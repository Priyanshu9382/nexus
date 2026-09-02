import { db } from "./prisma/db.ts";

async function test() {
    try {
        const user = await db.orm.public.User.first();
        if (!user) return;
        const conv = await db.orm.public.Conversation.create({ type: "DIRECT" });
        await db.orm.public.ConversationParticipant.create({ userId: user.id, conversationId: conv.id });
        console.log("Created empty chat successfully. Now testing deletion...");

        await db.transaction(async (tx) => {
            console.log("Deleting messages...");
            await tx.orm.public.Message.where({ conversationId: conv.id }).delete();
            console.log("Deleting participants...");
            await tx.orm.public.ConversationParticipant.where({ conversationId: conv.id }).delete();
            console.log("Deleting conversation...");
            await tx.orm.public.Conversation.where({ id: conv.id }).delete();
        });

        console.log("Deleted successfully!");
    } catch (e) {
        console.error("Prisma Error:", e);
    }
}
test();
