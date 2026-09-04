import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Mock Sign In",
      credentials: {
        username: { label: "Username (choose any)", type: "text", placeholder: "e.g. alice" },
      },
      async authorize(credentials) {
        if (!credentials?.username) return null;
        const username = credentials.username.trim().toLowerCase();
        if (username.length < 2) return null;

        const { db } = await import("../../prisma/db");

        let user = await db.orm.public.User.where({ username }).first();
        if (!user) {
          user = await db.orm.public.User.create({
            username,
            email: `${username}@mock.local`,
          });
        }

        // Return id explicitly so the jwt callback can pick it up as `user.id`
        return { id: user.id, name: user.username, email: user.email };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // Bug-fix #11: Copy the Prisma user.id (returned by authorize()) into the JWT token.
    // Without this callback, token.sub defaults to the email, not the DB UUID.
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id; // user.id is the Prisma UUID
      }
      return token;
    },
    // Expose the Prisma UUID on the session object for both client & server use
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.userId as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "very_secret_key_for_mock_development",
};
