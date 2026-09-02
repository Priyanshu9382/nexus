const { S3Client, PutBucketCorsCommand } = require("@aws-sdk/client-s3");
require("dotenv").config({ path: "/mnt/linux-data/personal/hiring_task/.env" });

const s3Client = new S3Client({
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

async function run() {
    const command = new PutBucketCorsCommand({
        Bucket: process.env.R2_BUCKET_NAME || "chats",
        CORSConfiguration: {
            CORSRules: [
                {
                    AllowedHeaders: ["*"],
                    AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
                    AllowedOrigins: ["*"],
                    ExposeHeaders: ["ETag"],
                    MaxAgeSeconds: 3000,
                },
            ],
        },
    });

    try {
        await s3Client.send(command);
        console.log("CORS updated successfully on the R2 bucket!");
        process.exit(0);
    } catch (err) {
        console.error("Error setting CORS:", err);
        process.exit(1);
    }
}

run();
