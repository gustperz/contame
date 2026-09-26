/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mailboxCode } from "./inbox/build/mailbox";

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), mailboxCode()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "inbox/**/*.test.ts", "supabase/**/*.test.ts"],
  },
});
