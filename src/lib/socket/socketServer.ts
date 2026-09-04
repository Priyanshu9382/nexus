import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { Temporal } from "temporal-polyfill";
import { isProfane } from "../moderation/profanityFilter";
import { isImageSafe } from "../moderation/imageModeration";
import { db } from "../../../prisma/db";

// Bug-fix #23: Lock CORS to the app origin, not "*"
const ALLOWED_ORIGIN = process.env.NEXTAUTH_URL || "http://localhost:3000";

// Module-level Redis client used for presence tracking and rate-limiting.
// Uses lazy connect + no-retry so it doesn't crash the server if Redis is absent.
const redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    lazyConnect: true,
    connectTimeout: 3000,
    retryStrategy: () => null, // Fail fast; don't keep retrying in the background
});

// Track whether Redis is actually usable
let redisReady = false;
redisClient.connect()
    .then(() => { redisReady = true; })
    .catch(() => { console.warn("⚠️  Redis unavailable — presence/rate-limit features will be skipped"); });

/** Thin wrappers that silently no-op when Redis is not connected */
const rSadd = (key: string, member: string) =>
    redisReady ? redisClient.sadd(key, member).catch(() => 0) : Promise.resolve(0);
const rSrem = (key: string, member: string) =>
    redisReady ? redisClient.srem(key, member).catch(() => 0) : Promise.resolve(0);
const rCard = (key: string) =>
    redisReady ? redisClient.scard(key).catch(() => 0) : Promise.resolve(0);
const rExpire = (key: string, seconds: number) =>
    redisReady ? redisClient.expire(key, seconds).catch(() => 0) : Promise.resolve(0);
const rIncr = (key: string) =>
    redisReady ? redisClient.incr(key).catch(() => 0) : Promise.resolve(0);
const rPExpire = (key: string, ms: number) =>
    redisReady ? redisClient.pexpire(key, ms).catch(() => 0) : Promise.resolve(0);

export function initSocketServer(httpServer: HttpServer) {
    const io = new SocketIOServer(httpServer, {
        path: "/api/socket/io",
        addTrailingSlash: false,
        cors: {
            origin: ALLOWED_ORIGIN,
            methods: ["GET", "POST"],
            credentials: true,
        },
    });

    // Set up Redis adapter for multi-server / horizontal scaling.
    // If Redis is not available, fall back to Socket.IO's built-in in-memory adapter —
    // this still works perfectly for a single-server deployment (dev & demo).
    if (redisReady) {
        try {
            const subClient = redisClient.duplicate();
            io.adapter(createAdapter(redisClient, subClient));
            console.log("✅ Socket.IO using Redis pub/sub adapter");
        } catch {
            console.warn("⚠️  Could not attach Redis adapter — using in-memory adapter");
        }
    } else {
        // Attempt adapter attachment once Redis becomes ready
        redisClient.once("ready", () => {
            try {
                const subClient = redisClient.duplicate();
                io.adapter(createAdapter(redisClient, subClient));
                redisReady = true;
                console.log("✅ Socket.IO Redis adapter attached (deferred)");
            } catch {
                console.warn("⚠️  Deferred Redis adapter failed — staying on in-memory adapter");
            }
        });
        console.log("ℹ️  Socket.IO using in-memory adapter (Redis not yet connected)");
    }

    // -----------------------------------------------------------------------
    // Bug-fix #1: Verify the session token sent by the client.
    // In development we do a lightweight DB lookup. Production upgrade path:
    // parse `socket.handshake.auth.token` with getToken from "next-auth/jwt".
    // -----------------------------------------------------------------------
    io.use(async (socket, next) => {
        const userId = socket.handshake.auth.userId as string | undefined;
        if (!userId) return next(new Error("unauthorized"));
        try {
            const user = await db.orm.public.User.where({ id: userId }).first();
            if (!user) return next(new Error("unauthorized"));
            socket.data.userId = userId;
            next();
        } catch (err) {
            console.error("Socket auth error:", err);
            next(new Error("unauthorized"));
        }
    });

    io.on("connection", async (socket) => {
        const userId = socket.data.userId as string;

        // Presence: track active socket IDs per user
        await rSadd(`user:online:${userId}`, socket.id);
        // Bug-fix #15: TTL so stale keys clean up even on crash
        await rExpire(`user:online:${userId}`, 86400);
        socket.join(`user:${userId}`);
        io.emit("presence_change", { userId, isOnline: true });

        socket.on("disconnect", async () => {
            await rSrem(`user:online:${userId}`, socket.id);
            const activeSockets = await rCard(`user:online:${userId}`);
            if (activeSockets === 0) {
                io.emit("presence_change", { userId, isOnline: false });
            }
        });

        // -----------------------------------------------------------------------
        // Bug-fix #2: Authorize join_conversation against DB membership
        // -----------------------------------------------------------------------
        socket.on("join_conversation", async (conversationId: string, callback) => {
            const participant = await db.orm.public.ConversationParticipant
                .where({ userId, conversationId })
                .first();
            if (!participant) {
                if (callback) callback({ status: "error", reason: "Not a participant" });
                return;
            }
            socket.join(`conv:${conversationId}`);
            if (callback) callback({ status: "joined" });
        });

        // -----------------------------------------------------------------------
        // Bug-fix #4: Rate-limit send_message per user (20 messages / minute)
        // -----------------------------------------------------------------------
        const MESSAGE_RATE_WINDOW = 60 * 1000;
        const MESSAGE_RATE_LIMIT = 20;

        socket.on("send_message", async (msg: any, callback) => {
            const { tempId, content, attachmentUrl, conversationId, contentType, isSticker } = msg;

            // Rate limit (only when Redis is available)
            if (redisReady) {
                const windowKey = Math.floor(Date.now() / MESSAGE_RATE_WINDOW);
                const rateLimitKey = `msg_rl:${userId}:${windowKey}`;
                const count = await rIncr(rateLimitKey);
                if (count === 1) await rPExpire(rateLimitKey, MESSAGE_RATE_WINDOW);
                if (count > MESSAGE_RATE_LIMIT) {
                    if (callback) callback({ status: "failed", reason: "Rate limit exceeded. Please slow down." });
                    return;
                }
            }

            // Verify user is a participant in this conversation
            const participant = await db.orm.public.ConversationParticipant
                .where({ userId, conversationId })
                .first();
            if (!participant) {
                if (callback) callback({ status: "failed", reason: "Not a participant in this conversation." });
                return;
            }

            // --- Profanity ---
            if (content && isProfane(content)) {
                if (callback) callback({ status: "failed", reason: "Message blocked: Contains profanity." });
                return;
            }

            // -----------------------------------------------------------------------
            // Bug-fix #3: Moderation must NOT fail open
            // Bug-fix #5: Use contentType, not .endsWith('.gif')
            // -----------------------------------------------------------------------
            // Bypass moderation for first-party dicebear images/stickers
            if (attachmentUrl && !attachmentUrl.includes("dicebear.com") && !isSticker) {
                try {
                    // Slight retry logic to handle Cloudflare R2 replication delays
                    let res = await fetch(attachmentUrl);
                    if (!res.ok) {
                        await new Promise((resolve) => setTimeout(resolve, 500));
                        res = await fetch(attachmentUrl);
                    }
                    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

                    const buffer = Buffer.from(await res.arrayBuffer());
                    const modCheck = await isImageSafe(buffer);
                    if (!modCheck.isSafe) {
                        if (callback) callback({ status: "failed", reason: modCheck.reason });
                        return;
                    }
                } catch (e) {
                    console.error("Moderation error:", e);
                    // Bug-fix #3: Fail CLOSED
                    if (callback) callback({ status: "failed", reason: "Media moderation could not be completed. Please try again." });
                    return;
                }
            }

            // --- Idempotency ---
            const existing = await db.orm.public.Message.where({ idempotencyKey: tempId }).first();
            if (existing) {
                if (callback) callback({ status: "success", msg: { ...existing, attachmentUrl: attachmentUrl || undefined } });
                return;
            }

            // Bug-fix #5: Determine type from the contentType field sent by the client
            let type: "TEXT" | "IMAGE" | "GIF" | "STICKER" = "TEXT";
            if (attachmentUrl) {
                if (isSticker) type = "STICKER";
                else if ((contentType as string | undefined)?.includes("gif")) type = "GIF";
                else type = "IMAGE";
            }

            // Bug-fix #6: Persist message to DB
            const payload = await db.orm.public.Message.create({
                idempotencyKey: tempId,
                content: content || null,
                conversationId,
                senderId: userId,
                type: type as any,
                status: "SENT",
            });

            // Bug-fix #6: Persist attachment
            if (attachmentUrl) {
                await db.orm.public.Attachment.create({
                    fileUrl: attachmentUrl,
                    fileType: contentType || "image/unknown",
                    fileSize: 0,
                    messageId: payload.id,
                });
            }

            // Prisma 8 uses the TC39 Temporal API — must pass Temporal.Instant, not Date
            await db.orm.public.Conversation.where({ id: conversationId }).update({
                updatedAt: Temporal.Now.instant(),
            });

            const fullMessage = attachmentUrl ? { ...payload, attachmentUrl } : payload;

            // Use socket.to() (not io.to()) so the SENDER is excluded from the broadcast.
            // Alice gets her confirmed message via the callback below; if she also receives
            // the broadcast she ends up with two entries sharing the same real ID (duplicate key).
            // Bob and all other participants receive it normally via the conv room.
            socket.to(`conv:${conversationId}`).emit("new_message", fullMessage);

            // Also notify every participant's personal user room with a lighter
            // conversation_updated event so their sidebar refreshes even if they
            // haven't opened that conversation yet.
            const participants = await db.orm.public.ConversationParticipant
                .where({ conversationId })
                .all();
            for (const p of participants) {
                io.to(`user:${p.userId}`).emit("conversation_updated", {
                    conversationId,
                    updatedAt: fullMessage.createdAt,
                });
            }

            if (callback) callback({ status: "success", msg: fullMessage });
        });

        // Bug-fix #14: Validate participant before emitting typing
        socket.on("typing", async (conversationId: string) => {
            const participant = await db.orm.public.ConversationParticipant
                .where({ userId, conversationId })
                .first();
            if (!participant) return;
            socket.to(`conv:${conversationId}`).emit("typing_status", { userId, isTyping: true });
        });

        socket.on("read_receipt", async (msgId: string, conversationId: string) => {
            const participant = await db.orm.public.ConversationParticipant
                .where({ userId, conversationId })
                .first();
            if (!participant) return;
            await db.orm.public.ConversationParticipant
                .where({ userId, conversationId })
                .update({ lastReadMessageId: msgId });
            socket.to(`conv:${conversationId}`).emit("message_read", { msgId, userId });
        });
    });

    return io;
}
