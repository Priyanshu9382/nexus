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

        // Fetch all users and filter out current
        const allUsers = await db.orm.public.User.select("id", "username").all();
        const availableUsers = allUsers.filter(u => u.id !== currentUserId);

        return NextResponse.json(availableUsers);
    } catch (error) {
        console.error("Error fetching users:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
