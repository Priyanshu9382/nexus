# Real-Time Messaging Architecture

A production-ready, highly reliable, and heavily moderated real-time messaging system built on Next.js, Node WebSockets, Redis, and PostgreSQL.

## Setup Instructions

1. **Install Dependencies:**
   Ensure you have installed node dependencies.
   ```bash
   npm install
   ```
2. **Environment Configuration:**
   Create a `.env` file at the root containing:
   ```env
   # Database (PostgreSQL)
   DATABASE_URL="postgresql://user:password@localhost:5432/chat_db"
   
   # NextAuth
   NEXTAUTH_SECRET="super-secret-key-for-local-dev"
   
   # Redis
   REDIS_URL="redis://localhost:6379"
   
   # Cloudflare R2 Object Storage
   CLOUDFLARE_ACCOUNT_ID="your_account_id"
   R2_ACCESS_KEY_ID="your_access_key"
   R2_SECRET_ACCESS_KEY="your_secret_key"
   S3_BUCKET_NAME="my-messaging-bucket"
   ```
3. **Database Initialization:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```
4. **Boot the Server:**
   ```bash
   npm run dev
   ```
   *(Note: The server automatically runs via `server.ts` to seamlessly host both the Next.js runtime and our Socket.IO runtime side-by-side on port 3000)*

## Architecture Integrations

- **Next.js & Socket.IO (`server.ts`)**: Deep integration of a traditional HTTP server enabling standard Next.js features alongside a deterministic TCP Socket server on a unified port.
- **Redis Horizontal Scaling (`@socket.io/redis-adapter`)**: True Multi-tab and multi-instance synchronization. If connections land on distributed server nodes behind a load balancer, Redis Pub/Sub replicates the socket events cross-machine near-instantly.
- **S3 Presigned Direct Upload**: The Node server securely provisions strict, time-limited Signed URLs granting direct object-storage write access to the client. This enforces zero payload latency or bandwidth exhaustion against the main `server.ts` messaging process.

## Technical Decisions

- **Strict Idempotency**: Due to unpredictable network drops, a client might stubbornly retry an inflight `send_message` event. The system forces the client to provision a deterministic UUID (`tempId`) preceding DB hits. The backend explicitly intercepts duplicate UUIDs and acks immediately, averting collision errors flawlessly and resolving the React Optimistic UI state safely.
- **CSS-Native Layout Preservation**: Loading 10,000+ messages often introduces severe DOM layout shifts (stuttering). By combining an offset `react-intersection-observer` anchor alongside the `flex-direction: column-reverse` paradigm, all positioning math is offloaded purely to the CSS engine, executing entirely jitter-free rendering effortlessly.
- **Zero-Trust Moderation Pipeline**: We globally instantiate the AI MobileNetV2 TensorFlow model (`NSFWJS`) alongside a leetspeak-normalized `leo-profanity` array inside memory. They evaluate payloads completely synchronously *before* Postgres hits and *before* broadcast emissions. No bypassing the API router is tolerated as the socket payload itself is directly halted.

## Testing the Flows (Screen Recording Guide)

1. **Dual Instance Simulation (Auth)**: Open two isolated browser environments (e.g., Chrome & Incognito, or Firefox). Enter `user_a` in the mock NextAuth login on one, and `user_b` on the other.
2. **Idempotent UI Testing**: Send a long string into the Chat box. Notice how the blue chat bubble snaps into the window instantly thanks to the optimistic React `useMessaging` hooks, adopting a slightly faded state until the server `ACK` verifies database integrity in real-time.
3. **Trigger Security Measures**: 
   - Upload any harmless small image through the [+] attachment icon. Check your browser Network tab to observe the S3 `uploadUrl` intercept. 
   - Then attempt to send evasive profanity (e.g. `s t @ p i d`). The UI will refuse projection, instantly stamping the failing bubble with a red `FAILED` state preventing the other browser from ever receiving it.
