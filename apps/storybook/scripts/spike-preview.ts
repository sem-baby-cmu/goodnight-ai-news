import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// `vite preview` of the spike build (`dist-spike/`). The Cloudflare Vite plugin
// finds the build through `.wrangler/deploy/config.json`, and `wrangler deploy`
// follows the same file. So this script writes the file for the preview only,
// and removes it when the preview ends. A deploy after a spike run then fails
// instead of shipping the spike.
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const deployConfig = here("../.wrangler/deploy/config.json");

if (!existsSync(here("../dist-spike/kidsnews/wrangler.json"))) {
  console.error("spike-preview: dist-spike/ is missing. Run `pnpm run spike:build` first.");
  process.exit(1);
}

mkdirSync(here("../.wrangler/deploy/"), { recursive: true });
writeFileSync(deployConfig, JSON.stringify({ configPath: "../../dist-spike/kidsnews/wrangler.json", auxiliaryWorkers: [] }));

const preview = spawn(here("../node_modules/.bin/vite"), ["preview", "--host", "0.0.0.0", "--port", "4173", "--strictPort"], {
  stdio: "inherit",
  env: { ...process.env, VITE_SPIKE: "1" },
});

const cleanup = () => rmSync(deployConfig, { force: true });
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => preview.kill(signal));
}
preview.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
