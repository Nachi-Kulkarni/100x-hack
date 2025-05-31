import NextAuth from "next-auth"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import GoogleProvider from "next-auth/providers/google"
import GithubProvider from "next-auth/providers/github"
import { PrismaClient, User as PrismaUser } from "@prisma/client" // Import PrismaUser

const prisma = new PrismaClient()

// Define the NextAuthOptions separately for clarity and potential re-use
import { NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      // Persist the user's role and ID to the token
      if (user) { // `user` is available on sign-in
        token.id = user.id;
        token.role = (user as PrismaUser).role; // PrismaUser has role
      }
      return token;
    },
    async session({ session, token }) {
      // Add role and ID to the session object
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string; // Role comes from token
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      // Ensure user.id is available (it should be after user creation/linking by adapter)
      if (user.id) {
        try {
          // Attempt to get request details (IP, User-Agent) is complex here.
          // For now, log basic info. Advanced logging might require wrapping the handler.
          const { LoginActionDetailsSchema } = await import('../../../lib/schemas');
          const detailsToLog = { provider: account?.provider };

          // Validate details (optional, but good practice)
          const parsedDetails = LoginActionDetailsSchema.safeParse(detailsToLog);
          if (!parsedDetails.success) {
            console.warn("Failed to validate login audit details:", parsedDetails.error);
          }

          await createAuditLog({
            userId: user.id,
            action: "USER_LOGIN",
            details: parsedDetails.success ? parsedDetails.data : detailsToLog, // Log parsed or raw
          });
        } catch (error) {
          console.error("Error creating audit log for USER_LOGIN:", error);
        }
      }
    },
    async signOut({ token }) {
      // token will contain user info like id and role
      if (token && token.id) {
        try {
          await createAuditLog({
            userId: token.id as string,
            action: "USER_LOGOUT",
          });
        } catch (error) {
          console.error("Error creating audit log for USER_LOGOUT:", error);
        }
      }
    },
  },
};

import { createAuditLog } from '../../../lib/auditLog';

export default NextAuth(authOptions);
