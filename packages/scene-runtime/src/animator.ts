import type { PrimitiveId } from "@storybook/dsl";
import type { KeyframeSpec } from "./keyframes";

// Why an animation runs: a page loop, a page enter animation, or a tap.
// "late" is the fade of an image that loads after the page became current (#68).
export type AnimationGroup = "loop" | "enter" | "tap" | "late";

type Entry = { element: Element; primitive: PrimitiveId; group: AnimationGroup; animation: Animation };

// Every Web Animation one SceneView started. A second animation of the same
// primitive on the same element replaces the first (invariant 3).
export class Animator {
  private entries: Entry[] = [];

  start(element: Element, primitive: PrimitiveId, group: AnimationGroup, spec: KeyframeSpec): void {
    this.cancelWhere((e) => e.element === element && e.primitive === primitive);
    const animation = element.animate(spec.keyframes, spec.options);
    this.entries.push({ element, primitive, group, animation });
  }

  // Cancels and drops the animations of the elements inside `root` (a node
  // that is being replaced or removed).
  cancelWithin(root: Element): void {
    this.cancelWhere((e) => root.contains(e.element));
  }

  cancelGroup(group: AnimationGroup): void {
    this.cancelWhere((e) => e.group === group);
  }

  cancelAll(): void {
    this.cancelWhere(() => true);
  }

  private cancelWhere(match: (e: Entry) => boolean): void {
    const keep: Entry[] = [];
    for (const e of this.entries) {
      if (match(e)) e.animation.cancel();
      else keep.push(e);
    }
    this.entries = keep;
  }
}
