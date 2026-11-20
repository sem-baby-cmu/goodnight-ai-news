import { type AssetManifest, type PageScene, type PrimitiveId, isLayerManifest, selectPoseEntry } from "@storybook/dsl";
import type { LayerState, ResolvedAsset } from "./types";

type Action = PageScene["interactions"][number]["do"][number];

export type TapContext = {
  page: PageScene;
  asset(instanceId: string): ResolvedAsset | undefined;
  getState(instanceId: string): LayerState | undefined;
  setState(instanceId: string, state: LayerState): void;
  playOnce(target: string, primitive: PrimitiveId): void;
  showBubble(target: string, text: string): void;
  // Whether the layer's inlined svg-rig node has `expr-<expression>`;
  // undefined when the node is not inserted yet.
  hasExpression(target: string, expression: string): boolean | undefined;
  onSfx?: (sfxRef: string) => void;
};

// Runs every interaction on `instanceId`, in page order, and each `do` action
// in array order. Everything is synchronous, so `onSfx` runs inside the
// user gesture (invariant 4). A throwing action is logged and the next one
// still runs. The warning names the action and the layer, not scene text.
export function runTap(instanceId: string, ctx: TapContext): void {
  for (const interaction of ctx.page.interactions) {
    if (interaction.on.tap !== instanceId) continue;
    for (const action of interaction.do) {
      try {
        runAction(action, ctx);
      } catch {
        console.warn(`scene-runtime: action ${action.action} on the tap of ${instanceId} failed; skipped`);
      }
    }
  }
}

// The file a state would show exists: the entry is there and, on svg and
// webp, it shows the requested expression (or one that is not named).
function hasFile(asset: ResolvedAsset, state: LayerState): boolean {
  const entry =
    asset.renderer === "svg-rig"
      ? selectPoseEntry(asset.manifest, state.pose)
      : selectPoseEntry(asset.manifest, state.pose, state.expression);
  if (!entry || (state.pose !== undefined && entry.id !== state.pose)) return false;
  if (asset.renderer === "svg-rig" || state.expression === undefined || entry.expression === undefined) return true;
  return entry.expression === state.expression;
}

function isLegal(manifest: AssetManifest, pose: string, expression: string): boolean {
  return isLayerManifest(manifest) && manifest.legal.some((p) => p.pose === pose && p.expression === expression);
}

// The pose of a layer without one is the first pose entry.
function currentPose(manifest: AssetManifest, state: LayerState): string | undefined {
  return state.pose ?? (isLayerManifest(manifest) ? manifest.poses[0]?.id : undefined);
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
      const next = { ...state, expression: action.expression };
      const present =
        asset.renderer === "svg-rig" ? ctx.hasExpression(action.target, action.expression) !== false : hasFile(asset, next);
      if (!present) {
        console.warn(`scene-runtime: ${action.target} has no file or group for expression "${action.expression}"; skipped`);
        return;
      }
      ctx.setState(action.target, next);
      return;
    }
    case "set_pose": {
      const asset = ctx.asset(action.target);
      const state = ctx.getState(action.target);
      const manifest = asset?.manifest;
      const legal =
        manifest !== undefined &&
        isLayerManifest(manifest) &&
        state !== undefined &&
        (state.expression === undefined
          ? manifest.poses.some((p) => p.id === action.pose)
          : isLegal(manifest, action.pose, state.expression));
      if (!legal || !state || !asset) {
        console.warn(
          `scene-runtime: set_pose "${action.pose}" on ${action.target} is not legal with expression "${state?.expression}"; skipped`,
        );
        return;
      }
      const next = { ...state, pose: action.pose };
      if (!hasFile(asset, next)) {
        console.warn(`scene-runtime: ${action.target} has no file for pose "${action.pose}"; skipped`);
        return;
      }
      ctx.setState(action.target, next);
      return;
    }
    default: {
      const never: never = action;
      console.warn(`scene-runtime: unknown action ${JSON.stringify(never)}; skipped`);
    }
  }
}
