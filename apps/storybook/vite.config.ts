import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// One build: the React front end goes to Static Assets, and the Worker in
// worker/ (see wrangler.jsonc) serves /api/*, /content/* and /health.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
