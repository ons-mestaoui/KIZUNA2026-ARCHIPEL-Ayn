import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The dev server refuses requests from any host but localhost, so a phone on the same Wi-Fi would get a page
  // that never hydrates. Allow private-network addresses (only the host name is matched; * = one label).
  // `npm start` has no such restriction. Do not run `npm run dev` on a network you don't trust.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`)],
  turbopack: {
    // a stray package-lock.json exists in the user's home dir; pin the root to this project
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
