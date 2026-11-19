// Runs the wrangler of apps/storybook (#21). Wrangler uses its own login or
// CLOUDFLARE_API_TOKEN from the environment; this file reads no secret.
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { REPO_ROOT } from "./paths";

const exec = promisify(execFile);

// Returns stdout; throws on a non-zero exit. The error names the first three
// arguments only, so it never holds SQL or file contents.
export async function runWrangler(args: string[]): Promise<string> {
  try {
    const { stdout } = await exec("pnpm", ["--dir", join(REPO_ROOT, "apps/storybook"), "exec", "wrangler", ...args], { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (e) {
    const err = e as { code?: number | string; stderr?: string };
    const tail = (err.stderr ?? "").trim().split("\n").slice(-5).join(" | ");
    throw new Error(`wrangler ${args.slice(0, 3).join(" ")} exited with ${err.code ?? "an error"}: ${tail}`);
  }
}
