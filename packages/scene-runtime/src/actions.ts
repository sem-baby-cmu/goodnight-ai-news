import type { AssetManifest, PageScene, PrimitiveId } from "@storybook/dsl";
import type { LayerState, ResolvedAsset } from "./types";

type Action = PageScene["interactions"][number]["do"][number];

export type TapContext = {
  page: PageScene;
  asset(instanceId: string): ResolvedAsset | undefined;
  getState(instanceId: string): LayerState | undefined;
  setState(instanceId: string, state: LayerState): void;
  playOnce(target: string, primitive: PrimitiveId): void;
  showBubble(target: string, text: string): void;
  onSfx?: (sfxRef: string) => void;
};

// Runs every interaction on `instanceId`, in page order, and each `do` action
// in array order. Everything is synchronous, so `onSfx` runs inside the
// user gesture (invariant 4).
export function runTap(instanceId: string, ctx: TapContext): void {
  for (const interaction of ctx.page.interactions) {
    if (interaction.on.tap !== instanceId) continue;
    for (const action of interaction.do) runAction(action, ctx);
  }
}

function isLegal(manifest: AssetManifest, pose: string, expression: string): boolean {
  return manifest.kind !== "sfx" && manifest.legal.some((p) => p.pose === pose && p.expression === expression);
}

// The pose of a layer without one is the first pose entry.
function currentPose(manifest: AssetManifest, state: LayerState): string | undefined {
  return state.pose ?? (manifest.kind === "sfx" ? undefined : manifest.poses[0]?.id);
}

function runAction(action: Action, ctx: TapContext): void {
  switch (action.action) {
    case "play_sfx":
      ctx.onSfx?.(action.sfx);
      return;
    case "play_animation":
      ctx.playOnce(action.target, action.primitive);
      return;
    case "show_bubble":
      ctx.showBubble(action.target, action.text);
      return;
    case "set_expression": {
      const asset = ctx.asset(action.target);
      const state = ctx.getState(action.target);
      const pose = asset && state ? currentPose(asset.manifest, state) : undefined;
      if (!asset || !state || pose === undefined || !isLegal(asset.manifest, pose, action.expression)) {
        console.warn(
          `scene-runtime: set_expression "${action.expression}" on ${action.target} is not legal for pose "${pose}"; skipped`,
        );
        return;
      }
      ctx.setState(action.target, { ...state, expression: action.expression });
      return;
    }
    case "set_pose": {
      const asset = ctx.asset(action.target);
      const state = ctx.getState(action.target);
      const manifest = asset?.manifest;
      const legal =
        manifest !== undefined &&
        manifest.kind !== "sfx" &&
        state !== undefined &&
        (state.expression === undefined
          ? manifest.poses.some((p) => p.id === action.pose)
          : isLegal(manifest, action.pose, state.expression));
      if (!legal || !state) {
        console.warn(
          `scene-runtime: set_pose "${action.pose}" on ${action.target} is not legal with expression "${state?.expression}"; skipped`,
        );
        return;
      }
      ctx.setState(action.target, { ...state, pose: action.pose });
      return;
    }
    default: {
      const never: never = action;
      console.warn(`scene-runtime: unknown action ${JSON.stringify(never)}; skipped`);
    }
  }
}
