import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// One build: the React front end goes to Static Assets, and the Worker in
// worker/ (see wrangler.jsonc) serves /api/*, /content/* and /health.
//
// `spike:build` sets VITE_SPIKE=1 and writes to dist-spike/, never to dist/, so a
// deploy after a spike build cannot ship the spike (issue #15).
export default defineConfig({
  build: { outDir: process.env.VITE_SPIKE === "1" ? "dist-spike" : "dist" },
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
