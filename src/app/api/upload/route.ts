import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "@/lib/s3";
import { rateLimit } from "@/lib/rate-limit";
import { v4 as uuidv4 } from "uuid";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
    try {
        // 1. IP-based Rate Limiting
        // In production we would trust the load balancer headers.
        const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
        // Limit: 5 requests per 60 seconds
        const rateLimitResult = await rateLimit(`upload:${ip}`, 5, 60 * 1000);

        if (!rateLimitResult.success) {
            return NextResponse.json({ error: "Too many requests" }, { status: 429 });
        }

        // 2. Authentication check
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 3. Request parsing
        const formData = await req.formData();
        const file = formData.get("file") as Blob;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const contentType = file.type;
        const fileSize = file.size;

        // 4. File Validation
        // Ignore user filename. Validate explicitly by passed payload and bucket enforcement.
        if (!contentType || !ALLOWED_MIME_TYPES.includes(contentType)) {
            return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
        }

        if (!fileSize || fileSize > MAX_FILE_SIZE) {
            return NextResponse.json({ error: "File size exceeds 5MB limit" }, { status: 400 });
        }

        // Generate secure random filename UUID
        const ext = contentType.split("/")[1];
        const fileName = `${uuidv4()}.${ext}`;
        const s3Bucket = process.env.R2_BUCKET_NAME || "chats";

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const command = new PutObjectCommand({
            Bucket: s3Bucket,
            Key: fileName,
            ContentType: contentType,
            Body: buffer,
        });

        // 5. Upload file directly to R2 from the server
        await s3Client.send(command);

        const fileUrl = process.env.R2_PUBLIC_URL
            ? `${process.env.R2_PUBLIC_URL}/${fileName}`
            : `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${s3Bucket}/${fileName}`;

        return NextResponse.json({ fileUrl, fileName });
    } catch (error) {
        console.error("Presigned URL generation error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
