import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "../../../../../prisma/db";

export async function DELETE(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const currentUserId = (session.user as any).id as string;
        const { conversationId } = await params;

        if (!conversationId) {
            return NextResponse.json({ error: "Conversation ID is required" }, { status: 400 });
        }

        // Verify user is part of the conversation
        const participant = await db.orm.public.ConversationParticipant
            .where({ userId: currentUserId, conversationId })
            .first();

        if (!participant) {
            return NextResponse.json({ error: "Not found or not a participant" }, { status: 404 });
        }

        // Manually cascade delete avoiding tx wrapper if it's unsupported in edge/serverless ORM

        // 1) Get all message IDs to safely delete Attachments first if DB cascade fails
        const messages = await db.orm.public.Message.where({ conversationId }).select('id').all();
        const messageIds = messages.map(m => m.id);

        if (messageIds.length > 0) {
            // In Prisma Next, there is no direct IN delete, so we loop batch
            for (const id of messageIds) {
                await db.orm.public.Attachment.where({ messageId: id }).delete();
            }
        }

        // 2) Delete Messages explicitly by PK
        if (messageIds.length > 0) {
            for (const id of messageIds) {
                await db.orm.public.Message.where({ id }).delete();
            }
        }

        // 3) Delete Participants explicitly by PK
        const participants = await db.orm.public.ConversationParticipant.where({ conversationId }).select('id').all();
        for (const pt of participants) {
            await db.orm.public.ConversationParticipant.where({ id: pt.id }).delete();
        }

        // 4) Delete Conversation
        await db.orm.public.Conversation.where({ id: conversationId }).delete();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting conversation:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
