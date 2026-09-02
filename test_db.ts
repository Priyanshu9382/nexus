import { db } from "./prisma/db.ts";

async function test() {
    try {
        const user = await db.orm.public.User.first();
        if (!user) {
            console.log("No user found");
            return;
        }

        const conv = await db.orm.public.Conversation.create({
            type: "DIRECT",
        });

        const tempId = "test-uuid-123";

        console.log("Creating Message...");
        const payload = await db.orm.public.Message.create({
            idempotencyKey: tempId,
            content: null,
            conversationId: conv.id,
            senderId: user.id,
            type: "STICKER" as any,
            status: "SENT",
        });

        console.log("Created message", payload);

        console.log("Creating Attachment...");
        await db.orm.public.Attachment.create({
            fileUrl: "http://example.com/test.svg",
            fileType: "image/svg+xml",
            fileSize: 0,
            messageId: payload.id,
        });

        console.log("Created attachment successfully!");
    } catch (e) {
        console.error("Prisma Error:", e);
    }
}

test();
