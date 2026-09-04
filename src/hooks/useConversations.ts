import { useState, useEffect, useCallback } from "react";
import { Socket } from "socket.io-client";

export interface Conversation {
    id: string;
    name: string | null;
    type: "DIRECT" | "GROUP";
    createdAt: string;
    updatedAt: string;
}

export function useConversations(socket: Socket | null, currentUserId: string) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Bug-fix #7: extract fetch into a stable callback so it can be called
    // from outside the state updater without causing React warnings
    const fetchConversations = useCallback(async () => {
        if (!currentUserId || currentUserId === "unknown") return;
        try {
            const res = await fetch("/api/conversations");
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();
            setConversations(data);
        } catch (err: any) {
            setError(err.message);
            console.error("Failed to load conversations.", err);
        }
    }, [currentUserId]);

    // Initial load
    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    // Real-time updates
    useEffect(() => {
        // Bug-fix #12: guard against running before auth is ready
        if (!socket || !currentUserId || currentUserId === "unknown") return;

        const handleConversationUpdated = (update: { conversationId: string; updatedAt: string }) => {
            setConversations((prev) => {
                const convIdx = prev.findIndex((c) => c.id === update.conversationId);

                if (convIdx === -1) {
                    // Conversation not in list yet — fetch to get the new one
                    setTimeout(() => fetchConversations(), 0);
                    return prev;
                }

                const updated = { ...prev[convIdx], updatedAt: update.updatedAt };
                const rest = prev.filter((_, i) => i !== convIdx);
                // Move to top
                return [updated, ...rest];
            });
        };

        socket.on("conversation_updated", handleConversationUpdated);
        return () => {
            socket.off("conversation_updated", handleConversationUpdated);
        };
    }, [socket, currentUserId, fetchConversations]);

    return { conversations, error, refetch: fetchConversations };
}
