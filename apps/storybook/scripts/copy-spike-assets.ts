import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SPIKE_ASSETS } from "../src/spike/assets";

// After `VITE_SPIKE=1 vite build`: copies the spike assets into
// `<client out dir>/spike-assets/`. Not into `public/`: Vite copies `public/`
// into every build, so the spike files would ship in a normal build.
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const source = here("../../../tools/assets/out/");
const dist = here("../dist/");
const clientDir = existsSync(`${dist}client/index.html`) ? `${dist}client/` : dist;

function fail(message: string): never {
  console.error(`copy-spike-assets: ${message}`);
  process.exit(1);
}

if (!existsSync(`${clientDir}index.html`)) fail(`${clientDir}index.html is missing. Run the build first.`);

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
