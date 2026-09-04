import Redis from "ioredis";

// Use global to prevent connection limits in serverless environment
const globalForRedis = global as unknown as { redis: Redis };

export const redis = globalForRedis.redis || new Redis(process.env.REDIS_URL || "redis://localhost:6379");
if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

/**
 * A basic fixed-window rate limiter utilizing Redis.
 * @param identifier e.g. IP address or user ID
 * @param limit Max requests per window
 * @param windowMs Window size in milliseconds
 */
export async function rateLimit(identifier: string, limit: number, windowMs: number) {
    const currentWindow = Math.floor(Date.now() / windowMs);
    const key = `ratelimit:${identifier}:${currentWindow}`;

    const currentCount = await redis.incr(key);
    if (currentCount === 1) {
        await redis.pexpire(key, windowMs);
    }

    return {
        success: currentCount <= limit,
        limit,
        remaining: Math.max(0, limit - currentCount)
    };
}
