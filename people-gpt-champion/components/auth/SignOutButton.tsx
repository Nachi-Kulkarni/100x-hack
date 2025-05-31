"use client"

import { signOut } from "next-auth/react"

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut()}
      style={{ padding: "10px", cursor: "pointer" }}
    >
      Sign Out
    </button>
  )
}
