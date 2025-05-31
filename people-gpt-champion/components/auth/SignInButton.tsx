"use client"

import { signIn } from "next-auth/react"

export default function SignInButton() {
  return (
    <>
      <button
        onClick={() => signIn("google")}
        style={{ marginRight: "10px", padding: "10px", cursor: "pointer" }}
      >
        Sign in with Google
      </button>
      <button
        onClick={() => signIn("github")}
        style={{ padding: "10px", cursor: "pointer" }}
      >
        Sign in with GitHub
      </button>
    </>
  )
}
