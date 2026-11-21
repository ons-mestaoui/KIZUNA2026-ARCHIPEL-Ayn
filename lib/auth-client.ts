"use client";

import { createAuthClient } from "better-auth/react";

// Same-origin: works on localhost, the Vercel URL and the laptop's LAN address alike.
export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
