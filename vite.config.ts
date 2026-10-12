/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Node, not jsdom, deliberately.
    //
    // The first tests here cover pure logic that has no DOM: the permission
    // vocabulary, the HTTP adapters' request and response mapping, the
    // scope helpers. Those are where the bugs this console has actually had
    // live, and they run in milliseconds without a browser environment.
    //
    // Component tests will want jsdom and can opt in per file with
    // `// @vitest-environment jsdom`. Making it the global default now would
    // slow every test down for a capability none of them use yet.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
