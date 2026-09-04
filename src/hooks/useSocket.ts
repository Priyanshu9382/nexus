import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export function useSocket(userId: string | undefined) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!userId || userId === "unknown") return;

        // The NextAuth session token cookie is httpOnly, so JS can't read it directly.
        // We pass the userId which the server verifies against the DB (see socketServer.ts).
        // Production upgrade: add a /api/auth/socket-token route that returns the raw
        // JWT string and pass it here as `auth.token` for full cryptographic verification.
        const socketInstance = io(process.env.NEXT_PUBLIC_SITE_URL || "/", {
            path: "/api/socket/io",
            auth: { userId },
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
        });

        socketInstance.on("connect", () => {
            setIsConnected(true);
            console.log("Socket connected");
        });

        socketInstance.on("disconnect", () => {
            setIsConnected(false);
            console.log("Socket disconnected");
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, [userId]);

    return { socket, isConnected };
}
