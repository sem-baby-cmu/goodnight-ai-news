import type { PrimitiveId } from "@storybook/dsl";
import type { KeyframeSpec } from "./keyframes";

type Entry = { element: Element; primitive: PrimitiveId; animation: Animation };

// Every Web Animation one SceneView started. A second animation of the same
// primitive on the same element replaces the first (invariant 3).
export class Animator {
  private entries: Entry[] = [];

  start(element: Element, primitive: PrimitiveId, spec: KeyframeSpec): void {
    this.cancelWhere((e) => e.element === element && e.primitive === primitive);
    const animation = element.animate(spec.keyframes, spec.options);
    this.entries.push({ element, primitive, animation });
  }

  // Cancels the animations of the elements inside `root` (an SVG node that
  // is being replaced or removed).
  cancelWithin(root: Element): void {
    this.cancelWhere((e) => root.contains(e.element));
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
