import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "../../../../prisma/db";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const currentUserId = (session.user as any).id as string;

        const participants = await db.orm.public.ConversationParticipant
            .where({ userId: currentUserId })
            .include('conversation', (conversation) =>
                conversation.include('participants', (p) => p.include('user', (u) => u))
            )
            .all();

        const conversations = participants.map(p => {
            const conv = p.conversation as any;
            // Determine exact name if DIRECT
            if (conv.type === "DIRECT" && !conv.name) {
                const other = conv.participants.find((pt: any) => pt.userId !== currentUserId);
                if (other && other.user) {
                    conv.name = other.user.username;
                }
            }
            return conv;
        });

        conversations.sort((a, b) => new Date(b.updatedAt?.toString()).getTime() - new Date(a.updatedAt?.toString()).getTime());

        return NextResponse.json(conversations);
    } catch (error) {
        console.error("Error fetching conversations:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
