import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SPIKE_ASSETS } from "../src/spike/assets";

// After `VITE_SPIKE=1 vite build` (which writes to `dist-spike/`): copies the
// spike assets into `dist-spike/client/spike-assets/`. Not into `public/`: Vite
// copies `public/` into every build, so the spike files would ship in a normal
// build. Then it checks that a deploy cannot pick up the spike.
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const source = here("../../../tools/assets/out/");
const spikeDist = here("../dist-spike/");
const dist = here("../dist/");
const clientDir = `${spikeDist}client/`;
const deployConfig = here("../.wrangler/deploy/config.json");

function fail(message: string): never {
  console.error(`copy-spike-assets: ${message}`);
  process.exit(1);
}

if (!existsSync(`${clientDir}index.html`)) fail(`${clientDir}index.html is missing. Run the spike build first.`);

const copies = [
  ...Object.entries(SPIKE_ASSETS).map(([key, version]) => `${key}/v${version}`),
  "spike", // paper-test.webp from make-texture.ts
];
for (const folder of copies) {
  const from = `${source}${folder}`;
  if (!existsSync(from)) fail(`${from} is missing. Build the assets first (see tools/assets).`);
  const to = `${clientDir}spike-assets/${folder}`;
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.info(`copied ${folder} -> ${to}`);
}

// The Cloudflare Vite plugin writes `.wrangler/deploy/config.json`, and
// `wrangler deploy` follows it to the last build. After a spike build it points
// at `dist-spike/`. Remove it, so a deploy before the next normal build fails
// instead of shipping the spike.
if (existsSync(deployConfig) && readFileSync(deployConfig, "utf8").includes("dist-spike")) rmSync(deployConfig);

// Checks: the normal build output has no spike files, and no deploy redirect
// leads to the spike build.
if (existsSync(`${dist}client/spike-assets`) || existsSync(`${dist}spike-assets`)) {
  fail("dist/ contains spike-assets. Run a normal build before you deploy.");
}
if (existsSync(deployConfig) && readFileSync(deployConfig, "utf8").includes("dist-spike")) {
  fail(".wrangler/deploy/config.json still points at dist-spike/.");
}
console.info("ok: dist/ has no spike-assets and no deploy redirect leads to dist-spike/");
