// Publish step (#21): upload new asset versions to R2, then upsert the
// `asset` and `asset_version` rows in D1, then set the active flag.
// Invariants (refinement): R2 objects before the rows that refer to them; a
// published (key, version) is never overwritten; at most one active version
// per asset, exactly one when publish ends; a rerun is safe. Prints keys,
// versions and counts only.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { v7 } from "uuid";
import { type AssetBuild, AssetBuildSchema } from "./build";
import { OUT_DIR } from "./paths";
import { checkSvg, sanitizeSvg } from "./svg";

// Names from apps/storybook/wrangler.jsonc (design, Deployment).
export const DB_NAME = "storybook-mvp";
export const BUCKET = "storybook-mvp";

export type Mode = "local" | "remote";
// One row of the registry query. `version` and `manifest` are null for an
// asset row with no version (LEFT JOIN). `manifest` is parsed JSON.
export type ExistingRow = { key: string; kind: string; version: number | null; manifest: unknown };
export type Plan = { skip: AssetBuild[]; create: AssetBuild[]; errors: string[] };

const RENDERERS: Record<AssetBuild["kind"], readonly AssetBuild["renderer"][]> = {
  character: ["webp", "svg", "svg-rig"],
  prop: ["webp", "svg", "svg-rig"],
  scenery: ["webp", "svg", "svg-rig"],
  sfx: ["audio"],
};
const CONTENT_TYPES: Record<string, string> = { ".webp": "image/webp", ".svg": "image/svg+xml", ".wav": "audio/wav" };
const ONLY = /^([a-z0-9][a-z0-9-]*)@([1-9]\d*)$/;

export const label = (b: { key: string; version: number }) => `${b.key} v${b.version}`;
export const r2Prefix = (b: { key: string; version: number }) => `assets/${b.key}/v${b.version}/`;

// The files that a manifest names; these are the files that publish uploads.
export function manifestFiles(build: AssetBuild): string[] {
  const m = build.manifest;
  return m.kind === "sfx" ? [m.file] : [...new Set(m.poses.map((p) => p.file))];
}

// Every error of the local build set; nothing is written when this is thrown.
export class PublishInputError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join("\n"));
  }
}

// Reads every <outDir>/*/v*/asset.json and checks it with its files.
// `outDir` is a parameter so that tests use a temporary directory
// (implementation decision). `only` holds `<key>@<n>` entries.
export function loadLocalBuilds(opts: { outDir?: string; only?: string[] } = {}): AssetBuild[] {
  const outDir = opts.outDir ?? OUT_DIR;
  const errors: string[] = [];
  const builds: AssetBuild[] = [];
  let wanted: Set<string> | undefined;
  if (opts.only) {
    wanted = new Set();
    for (const entry of opts.only) {
      if (ONLY.test(entry)) wanted.add(entry);
      else errors.push(`--only entries are <key>@<n>; got "${entry}"`);
    }
  }
  if (!existsSync(outDir)) throw new PublishInputError([`${outDir} does not exist; run cut, measure, svg and sfx first`]);
  const found = new Set<string>();
  const dirs = (dir: string) =>
    readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  for (const keyDir of dirs(outDir)) {
    for (const versionDir of dirs(join(outDir, keyDir)).filter((d) => d.startsWith("v"))) {
      const folder = `${keyDir}/${versionDir}`;
      const dir = join(outDir, folder);
      if (!existsSync(join(dir, "asset.json"))) continue;
      let build: AssetBuild;
      try {
        build = AssetBuildSchema.parse(JSON.parse(readFileSync(join(dir, "asset.json"), "utf8")));
      } catch (e) {
        errors.push(`${folder}/asset.json: ${(e as Error).message.split("\n")[0]}`);
        continue;
      }
      const id = `${build.key}@${build.version}`;
      if (wanted && !wanted.has(id)) continue;
      found.add(id);
      const before = errors.length;
      checkBuild(build, folder, dir, errors);
      if (errors.length === before) builds.push(build);
    }
  }
  for (const id of wanted ?? []) if (!found.has(id)) errors.push(`--only ${id}: there is no local build`);
  if (errors.length === 0 && builds.length === 0) errors.push(`${outDir} has no asset builds`);
  if (errors.length > 0) throw new PublishInputError(errors);
  return builds;
}

function checkBuild(build: AssetBuild, folder: string, dir: string, errors: string[]): void {
  const name = label(build);
  if (folder !== `${build.key}/v${build.version}`) errors.push(`${folder}: the folder does not match ${name}`);
  if (!RENDERERS[build.kind].includes(build.renderer)) errors.push(`${name}: kind ${build.kind} with renderer ${build.renderer} is not allowed`);
  if (build.manifest.kind !== build.kind) errors.push(`${name}: manifest kind ${build.manifest.kind} differs from kind ${build.kind}`);
  for (const file of manifestFiles(build)) {
    if (file !== file.trim() || file.includes("/") || file.includes("\\") || file.startsWith(".")) {
      errors.push(`${name}: "${file}" is not a plain file name`);
      continue;
    }
    if (!CONTENT_TYPES[extname(file)]) errors.push(`${name}: ${file} has no content type (.webp, .svg or .wav)`);
    const path = join(dir, file);
    if (!existsSync(path)) {
      errors.push(`${name}: ${file} is missing`);
      continue;
    }
    if (extname(file) !== ".svg") continue;
    // Every SVG upload (planner rule for #21; the section names svg-rig).
    const text = readFileSync(path, "utf8");
    if (sanitizeSvg(text) !== text) errors.push(`${name}: ${file} changes under sanitizeSvg; build it with the svg command`);
    for (const i of checkSvg(text, build, file)) errors.push(`${name}: ${file}: ${i.path}: ${i.code}: ${i.message}`);
  }
}

export function planPublish(local: AssetBuild[], existing: ExistingRow[]): Plan {
  const plan: Plan = { skip: [], create: [], errors: [] };
  for (const build of local) {
    const rows = existing.filter((r) => r.key === build.key);
    const kind = rows[0]?.kind;
    if (kind !== undefined && kind !== build.kind) {
      plan.errors.push(`${build.key} is a ${kind} in the registry; the local build is a ${build.kind}`);
      continue;
    }
    const published = rows.find((r) => r.version === build.version);
    if (!published) plan.create.push(build);
    else if (isDeepStrictEqual(published.manifest, build.manifest)) plan.skip.push(build);
    else plan.errors.push(`${label(build)} differs from the published version; bump the version`);
  }
  return plan;
}

const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

// One SQL file: the inserts of every created version, then two activation
// UPDATEs per local key (invariant 3, R34). No BEGIN or COMMIT.
export function buildSql(plan: Plan, now: string, newId: () => string): string {
  const lines: string[] = [];
  for (const b of plan.create) {
    lines.push(`INSERT INTO asset (id, key, kind, name, created_at) VALUES (${q(newId())}, ${q(b.key)}, ${q(b.kind)}, ${q(b.name)}, ${q(now)}) ON CONFLICT(key) DO NOTHING;`);
    lines.push(
      `INSERT INTO asset_version (id, asset_id, version, renderer, manifest, r2_prefix, active, created_at) SELECT ${q(newId())}, id, ${b.version}, ${q(b.renderer)}, ${q(JSON.stringify(b.manifest))}, ${q(r2Prefix(b))}, 0, ${q(now)} FROM asset WHERE key = ${q(b.key)} ON CONFLICT(asset_id, version) DO NOTHING;`,
    );
  }
  const highest = "(SELECT MAX(v2.version) FROM asset_version v2 WHERE v2.asset_id = asset_version.asset_id)";
  for (const key of new Set([...plan.skip, ...plan.create].map((b) => b.key))) {
    const asset = `asset_id = (SELECT id FROM asset WHERE key = ${q(key)})`;
    lines.push(`UPDATE asset_version SET active = 0 WHERE ${asset} AND version <> ${highest};`);
    lines.push(`UPDATE asset_version SET active = 1 WHERE ${asset} AND version = ${highest};`);
  }
  return `${lines.join("\n")}\n`;
}

type Registry = Array<ExistingRow & { active?: number }>;

async function readRegistry(run: (args: string[]) => Promise<string>, flag: string, withActive: boolean): Promise<Registry> {
  const sql = `SELECT a.key AS key, a.kind AS kind, v.version AS version, v.manifest AS manifest${withActive ? ", v.active AS active" : ""} FROM asset a LEFT JOIN asset_version v ON v.asset_id = a.id`;
  const stdout = await run(["d1", "execute", DB_NAME, "--json", "--command", sql, flag]);
  let results: unknown;
  try {
    results = (JSON.parse(stdout) as Array<{ results?: unknown }>)[0]?.results;
  } catch {
    results = undefined;
  }
  const ok = (r: Record<string, unknown>) =>
    typeof r.key === "string" &&
    typeof r.kind === "string" &&
    (r.version === null || typeof r.version === "number") &&
    (r.manifest === null || typeof r.manifest === "string") &&
    (!withActive || r.active === null || typeof r.active === "number");
  if (!Array.isArray(results) || !results.every((r) => r !== null && typeof r === "object" && ok(r as Record<string, unknown>))) {
    throw new Error("d1 execute returned an unexpected output shape; expected [{ results: [{ key, kind, version, manifest }] }]");
  }
  return (results as Array<Record<string, unknown>>).map((r) => ({
    key: r.key as string,
    kind: r.kind as string,
    version: r.version as number | null,
    manifest: r.manifest === null ? null : JSON.parse(r.manifest as string),
    ...(withActive ? { active: (r.active as number | null) ?? 0 } : {}),
  }));
}

export type PublishDeps = {
  runWrangler: (args: string[]) => Promise<string>;
  log?: (line: string) => void;
  error?: (line: string) => void;
  now?: () => Date;
  newId?: () => string;
};

export async function runPublish(opts: { mode: Mode; only?: string[]; outDir?: string }, deps: PublishDeps): Promise<number> {
  const log = deps.log ?? console.log;
  const error = deps.error ?? deps.log ?? console.error;
  const flag = `--${opts.mode}`;
  const outDir = opts.outDir ?? OUT_DIR;
  try {
    const local = loadLocalBuilds({ outDir, only: opts.only });
    const plan = planPublish(local, await readRegistry(deps.runWrangler, flag, false));
    if (plan.errors.length > 0) {
      for (const e of plan.errors) error(e);
      return 1;
    }
    for (const b of plan.skip) log(`skip ${label(b)} (exists)`);
    for (const b of plan.create) {
      for (const file of manifestFiles(b)) {
        const key = `${r2Prefix(b)}${file}`;
        log(`put ${key}`);
        await deps.runWrangler(["r2", "object", "put", `${BUCKET}/${key}`, "--file", join(outDir, b.key, `v${b.version}`, file), "--content-type", CONTENT_TYPES[extname(file)]!, flag]);
      }
    }
    const now = (deps.now ?? (() => new Date()))();
    const sqlFile = join(outDir, `publish-${now.getTime()}.sql`);
    writeFileSync(sqlFile, buildSql(plan, now.toISOString(), deps.newId ?? v7));
    const keys = new Set(local.map((b) => b.key));
    log(`d1: ${plan.create.length} new version(s), activation for ${keys.size} key(s)`);
    await deps.runWrangler(["d1", "execute", DB_NAME, "--file", sqlFile, "-y", flag]);

    const after = await readRegistry(deps.runWrangler, flag, true);
    log("key | version | active");
    for (const r of [...after].sort((a, b) => a.key.localeCompare(b.key) || (a.version ?? 0) - (b.version ?? 0))) log(`${r.key} | ${r.version ?? "-"} | ${r.active ?? 0}`);
    const problems: string[] = [];
    for (const b of plan.create) {
      if (!after.some((r) => r.key === b.key && r.version === b.version)) problems.push(`${label(b)} is missing after publish`);
    }
    for (const key of new Set([...after.map((r) => r.key), ...keys])) {
      const n = after.filter((r) => r.key === key && r.active === 1).length;
      if (n !== 1) problems.push(`${key} has ${n} active versions; expected 1`);
    }
    if (problems.length > 0) {
      for (const p of problems) error(p);
      return 1;
    }
    log(`publish: ${plan.create.length} created, ${plan.skip.length} skipped, ${keys.size} key(s) checked`);
    return 0;
  } catch (e) {
    if (e instanceof PublishInputError) for (const m of e.errors) error(m);
    else error((e as Error).message);
    return 1;
  }
}
