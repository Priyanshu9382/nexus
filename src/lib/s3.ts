import { S3Client } from "@aws-sdk/client-s3";

const globalForS3 = global as unknown as { s3Client: S3Client };

export const s3Client =
    globalForS3.s3Client ||
    new S3Client({
        endpoint: process.env.CLOUDFLARE_ACCOUNT_ID
            ? `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
            : undefined,
        region: "auto",
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID || "mock-access-key",
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "mock-secret-key",
        },
    });

if (process.env.NODE_ENV !== "production") globalForS3.s3Client = s3Client;
