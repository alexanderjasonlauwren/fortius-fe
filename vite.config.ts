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
  build: {
    rollupOptions: {
      output: {
        // The framework changes far less often than the console, so it gets
        // chunks whose hashes survive an app-only deploy and stay cached.
        //
        // Maps and charts are deliberately not named here: only lazy pages
        // import them, so Rollup already keeps them out of the entry. Forcing
        // them into a named chunk let Rollup park a shared CommonJS helper in
        // it, which made the entry preload all of Recharts.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return "vendor-react";
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return "vendor-query";
          return undefined;
        },
      },
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
