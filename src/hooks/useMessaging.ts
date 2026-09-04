import { useState, useCallback, useEffect, useRef } from "react";
import { Socket } from "socket.io-client";

export interface Message {
    id: string;
    tempId?: string;
    content: string | null;
    attachmentUrl?: string;
    conversationId: string;
    senderId: string;
    status: "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
    createdAt: string;
    errorReason?: string;
}

export function useMessaging(socket: Socket | null, conversationId: string, currentUserId: string) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const oldestCursor = useRef<string | null>(null);
    const isFetching = useRef(false);

    // Bug-fix #9 / #17: cursor-based fetch with hasMore
    const loadMessages = useCallback(async (cursor?: string) => {
        if (isFetching.current || !conversationId || conversationId === "none") return;
        isFetching.current = true;
        try {
            const url = cursor
                ? `/api/conversations/${conversationId}/messages?cursor=${encodeURIComponent(cursor)}&limit=50`
                : `/api/conversations/${conversationId}/messages?limit=50`;

            const res = await fetch(url);
            const data = await res.json();

            // Support both legacy array response and new { messages, hasMore } shape
            const msgs: Message[] = Array.isArray(data) ? data : (data.messages ?? []);
            const more: boolean = Array.isArray(data) ? false : (data.hasMore ?? false);

            setHasMore(more);

            if (!cursor) {
                // Bug-fix #10: initial load — DB messages first, pending optimistic at end
                setMessages((prev) => {
                    const pendingOptimistic = prev.filter(
                        (p) => p.id.startsWith("temp-") && !msgs.find((m) => m.tempId === p.tempId)
                    );
                    return [...msgs, ...pendingOptimistic];
                });
                oldestCursor.current = msgs[0]?.createdAt ?? null;
            } else {
                // Prepend older messages
                setMessages((prev) => [...msgs, ...prev]);
                oldestCursor.current = msgs[0]?.createdAt ?? oldestCursor.current;
            }
        } catch (err) {
            console.error("Could not fetch messages:", err);
        } finally {
            isFetching.current = false;
        }
    }, [conversationId]);

    // Effect 1: Load messages + join room whenever conversationId changes
    useEffect(() => {
        setMessages([]);
        oldestCursor.current = null;
        setHasMore(false);

        if (!socket || !conversationId || conversationId === "none") return;

        loadMessages();

        socket.emit("join_conversation", conversationId, () => {
            console.log(`Joined room ${conversationId}`);
        });
    }, [socket, conversationId, loadMessages]);

    // Effect 2: Register the new_message socket listener.
    // This is separate so the listener is never torn down just because loadMessages changed.
    // It always captures the latest conversationId via the ref below.
    const conversationIdRef = useRef(conversationId);
    useEffect(() => {
        conversationIdRef.current = conversationId;
    });

    useEffect(() => {
        if (!socket) return;

        const handleNewMessage = (msg: Message) => {
            // Use ref so we always compare against the current conversationId
            // without needing to re-register the listener on every conversationId change.
            if (msg.conversationId !== conversationIdRef.current) return;
            setMessages((prev) => {
                if (prev.find((m) => m.id === msg.id || (msg.tempId && m.tempId === msg.tempId))) {
                    return prev;
                }
                return [...prev, msg];
            });
        };

        socket.on("new_message", handleNewMessage);
        return () => {
            socket.off("new_message", handleNewMessage);
        };
    }, [socket]);

    // Bug-fix #9: expose fetchOlder so MessageList can trigger it on scroll
    const fetchOlder = useCallback(() => {
        if (oldestCursor.current) {
            loadMessages(oldestCursor.current);
        }
    }, [loadMessages]);

    // Optimistic Send
    const sendMessage = useCallback((content: string, attachmentUrl?: string, isSticker = false) => {
        if (!socket) return;

        const tempId = crypto.randomUUID();

        const optimisticMessage: Message = {
            id: `temp-${tempId}`,
            tempId,
            content,
            attachmentUrl,
            conversationId,
            senderId: currentUserId,
            status: "SENDING", // clock icon state
            createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, optimisticMessage]);

        // Bug-fix #5: pass contentType so the server can correctly classify the attachment
        const contentType = attachmentUrl?.endsWith(".gif") ? "image/gif" : "image/jpeg";

        socket.emit(
            "send_message",
            { tempId, content, attachmentUrl, conversationId, contentType, isSticker },
            (response: any) => {
                if (response.status === "success") {
                    setMessages((prev) =>
                        prev.map((m) => (m.tempId === tempId ? { ...response.msg } : m))
                    );
                } else {
                    alert(`Message Blocked: ${response.reason}`); // High-visibility moderation toast
                    setMessages((prev) =>
                        prev.map((m) => (m.tempId === tempId ? { ...m, status: "FAILED", errorReason: response.reason } : m))
                    );
                }
            }
        );
    }, [socket, conversationId, currentUserId]);

    return { messages, sendMessage, fetchOlder, hasMore };
}
