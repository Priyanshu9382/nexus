import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "../../../../../prisma/db";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const currentUserId = (session.user as any).id as string;
        const body = await req.json();
        const { targetUserId } = body;

        if (!targetUserId) {
            return NextResponse.json({ error: "Target User ID is required" }, { status: 400 });
        }

        // See if direct conversation already exists between current user and target user
        const participants = await db.orm.public.ConversationParticipant
            .where({ userId: currentUserId })
            .include('conversation', (c) => c.include('participants', (p) => p))
            .all();

        let existingConv = null;
        for (const p of participants) {
            if (p.conversation.type === "DIRECT") {
                if (p.conversation.participants.some(cp => cp.userId === targetUserId)) {
                    existingConv = p.conversation;
                    break;
                }
            }
        }

        if (existingConv) {
            return NextResponse.json(existingConv);
        }

        // Create new direct conversation
        const targetUser = await db.orm.public.User.where({ id: targetUserId }).first();
        if (!targetUser) {
            return NextResponse.json({ error: "Target User not found" }, { status: 404 });
        }

        // Using simple sequential creates since standard nested creates syntax might differ in Prisma Next
        const newConversation = await db.orm.public.Conversation.create({
            type: "DIRECT",
        });

        await db.orm.public.ConversationParticipant.create({
            userId: currentUserId,
            conversationId: newConversation.id
        });

        await db.orm.public.ConversationParticipant.create({
            userId: targetUserId,
            conversationId: newConversation.id
        });

        return NextResponse.json(newConversation);

    } catch (error) {
        console.error("Error creating new conversation:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
