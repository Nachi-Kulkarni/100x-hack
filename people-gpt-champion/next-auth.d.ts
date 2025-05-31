import NextAuth, { DefaultSession, DefaultUser } from "next-auth";
import { JWT, DefaultJWT } from "next-auth/jwt";
import { Role } from "@prisma/client"; // Import the Role enum from your Prisma schema

// Extend the built-in session/user types
declare module "next-auth" {
  interface Session {
    user: {
      id: string; // Keep existing properties and add new ones
      role: Role; // Add role from Prisma enum
    } & DefaultSession["user"]; // Extends DefaultSession["user"] which includes name, email, image
  }

  interface User extends DefaultUser {
    // This interface is used as the `user` object passed to JWT and session callbacks
    role: Role; // Add role here as well
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    // Token returned by the `jwt` callback
    role: Role;
    id: string; // Ensure id is also part of the JWT token if you added it
  }
}
