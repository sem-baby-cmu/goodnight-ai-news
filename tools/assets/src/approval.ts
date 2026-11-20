// The backdrop approval record (#67, ADR 0016 Decision D, design "8. Asset
// pipeline"): `tools/assets/reviews/<key>-v<n>.json` holds the SHA-256 of every
// variant file and of the template list that a person reviewed. Publish refuses
// a backdrop version without an approval whose digests match. Only a person
// runs `approve`; tests write to temporary folders.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { LayoutTemplate } from "@storybook/dsl";
import { TEMPLATES } from "@storybook/layout";
import { z } from "zod";
import { ASSET_KEY } from "./crops";
import { label, type LocalBuild, loadLocalBuilds } from "./publish";

const HEX64 = z.string().regex(/^[0-9a-f]{64}$/);

export const ApprovalSchema = z.strictObject({
  key: z.string().regex(ASSET_KEY),
  version: z.number().int().min(1),
  templates: HEX64,
  files: z.record(z.string(), HEX64),
});
export type Approval = z.infer<typeof ApprovalSchema>;

// SHA-256 (lower-case hex) of JSON.stringify(templates) (implementation decision).
export function templatesDigest(templates: LayoutTemplate[] = TEMPLATES): string {
  return createHash("sha256").update(JSON.stringify(templates)).digest("hex");
}

export const approvalFile = (b: { key: string; version: number }) => `${b.key}-v${b.version}.json`;

// The errors of every build without a matching approval in `reviewsDir`.
// `files` are the publish digests (`LocalBuild.files`); there is no second digest.
export function checkApprovals(builds: LocalBuild[], reviewsDir: string): string[] {
  const errors: string[] = [];
  for (const b of builds) {
    const name = label(b);
    const file = approvalFile(b);
    const path = join(reviewsDir, file);
    if (!existsSync(path)) {
      errors.push(`${name}: the approval ${file} is missing; review the sheets, then a person runs approve`);
      continue;
    }
    let a: Approval;
    try {
      a = ApprovalSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    } catch (e) {
      errors.push(`${name}: the approval ${file} is not valid: ${(e as Error).message.split("\n")[0]}`);
      continue;
    }
    if (a.key !== b.key || a.version !== b.version) {
      errors.push(`${name}: the approval ${file} names ${a.key} v${a.version}`);
      continue;
    }
    if (a.templates !== templatesDigest()) errors.push(`${name}: the approval ${file} has another template digest; the templates changed, so review the sheets again`);
    for (const f of [...new Set([...Object.keys(a.files), ...Object.keys(b.files)])].sort()) {
      if (a.files[f] === undefined || a.files[f] !== b.files[f]) errors.push(`${name}: the approval ${file} does not match ${f}`);
    }
  }
  return errors;
}

// Writes <reviewsDir>/<key>-v<n>.json from current review sheets. The act of
// the person who looked at the sheets. Returns the path.
export function writeApproval(opts: { key: string; version: number; outDir: string; reviewsDir: string; log?: (line: string) => void }): string {
  const { key, version, outDir, reviewsDir } = opts;
  const name = label({ key, version });
  const [build] = loadLocalBuilds({ outDir, only: [`${key}@${version}`] });
  if (!build || build.kind !== "backdrop") throw new Error(`${name} is not a backdrop build`);
  const sheetPath = join(outDir, "review", `${key}-v${version}-envelopes.json`);
  if (!existsSync(sheetPath)) throw new Error(`${name}: no review sheets; run review first`);
  const sheet = JSON.parse(readFileSync(sheetPath, "utf8")) as { templates?: unknown; files?: unknown };
  const templates = templatesDigest();
  const skies = build.manifest.kind === "backdrop" ? build.manifest.variants.map((v) => v.sky) : [];
  const current =
    sheet.templates === templates &&
    isDeepStrictEqual(sheet.files, build.files) &&
    skies.every((sky) => existsSync(join(outDir, "review", `${key}-v${version}-${sky}.png`)));
  if (!current) throw new Error(`${name}: the review sheets are out of date; run review again`);
  const files = Object.fromEntries(Object.entries(build.files).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
  const record: Approval = { key, version, templates, files };
  mkdirSync(reviewsDir, { recursive: true });
  const path = join(reviewsDir, approvalFile(build));
  const existed = existsSync(path);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  opts.log?.(`${existed ? "replaced" : "wrote"} ${approvalFile(build)}`);
  return path;
}
