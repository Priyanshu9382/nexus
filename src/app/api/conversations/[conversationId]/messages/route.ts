import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "../../../../../../prisma/db";

export async function GET(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
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

        // Authorization: verify participant
        const participant = await db.orm.public.ConversationParticipant
            .where({ userId: currentUserId, conversationId })
            .first();

        if (!participant) {
            return NextResponse.json({ error: "Not found or not a participant" }, { status: 404 });
        }

        const url = new URL(req.url);
        const limitStr = url.searchParams.get("limit") || "50";
        const limit = Math.min(parseInt(limitStr, 10), 100); // cap at 100 per page
        // Bug-fix #17: cursor is the createdAt ISO timestamp of the oldest message currently loaded
        const cursor = url.searchParams.get("cursor");

        // Fetch limit+1 to determine whether more messages exist
        const allMessages = await db.orm.public.Message
            .where({ conversationId })
            .orderBy(m => m.createdAt.desc())
            .limit(limit + 1)
            .all();

        // Populate attachments manually to avoid ORM relation API guessing
        const populatedMessages = await Promise.all(allMessages.map(async (m) => {
            const att = await db.orm.public.Attachment.where({ messageId: m.id }).first();
            return att ? { ...m, attachmentUrl: att.fileUrl } : m;
        }));

        // Filter to messages older than the cursor if provided
        let filtered = cursor
            ? populatedMessages.filter(m => new Date(m.createdAt as any).getTime() < new Date(cursor).getTime())
            : populatedMessages;

        const hasMore = filtered.length > limit;
        if (hasMore) filtered.pop(); // remove the sentinel item

        // Reverse so oldest is first for the chat window
        filtered.reverse();

        // Bug-fix #17: return { messages, hasMore } so client knows when to stop paginating
        return NextResponse.json({ messages: filtered, hasMore });

    } catch (error) {
        console.error("Error fetching messages:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
