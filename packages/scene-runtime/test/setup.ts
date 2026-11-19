// Browser API stubs for the runtime tests (Exact change 9 of #14).
// jsdom 31 has no Element.prototype.animate, matchMedia or ResizeObserver.
// The stubs are installed always, so every animation call the tests see comes
// from this recorder, and the tests can assert exact keyframes and options.

export type AnimateCall = {
  element: Element;
  keyframes: Keyframe[] | PropertyIndexedKeyframes | null;
  options: KeyframeAnimationOptions | undefined;
  animation: FakeAnimation;
  canceled: boolean;
};

export type FakeAnimation = {
  playState: AnimationPlayState;
  cancel(): void;
  finished: Promise<FakeAnimation>;
  effect: { getTiming(): KeyframeAnimationOptions | undefined };
};

export const animateCalls: AnimateCall[] = [];

Element.prototype.animate = function animate(
  this: Element,
  keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
  options?: number | KeyframeAnimationOptions,
): Animation {
  const timing = typeof options === "number" ? { duration: options } : options;
  const animation: FakeAnimation = {
    playState: "running",
    cancel() {
      animation.playState = "idle";
      call.canceled = true;
    },
    finished: Promise.resolve(undefined as unknown as FakeAnimation),
    effect: { getTiming: () => timing },
  };
  animation.finished = Promise.resolve(animation);
  const call: AnimateCall = { element: this, keyframes, options: timing, animation, canceled: false };
  animateCalls.push(call);
  return animation as unknown as Animation;
};

const REDUCE = "(prefers-reduced-motion: reduce)";
let reduced = false;
const listeners = new Set<(event: MediaQueryListEvent) => void>();

// Sets the reduced-motion preference and fires `change` on every listener.
export function setReducedMotion(value: boolean): void {
  reduced = value;
  for (const listener of [...listeners]) listener({ matches: value, media: REDUCE } as MediaQueryListEvent);
}

window.matchMedia = (query: string): MediaQueryList => {
  const isReduce = query === REDUCE;
  const add = (_type: string, listener: unknown) => {
    if (isReduce && typeof listener === "function") listeners.add(listener as (event: MediaQueryListEvent) => void);
  };
  const remove = (_type: string, listener: unknown) => {
    listeners.delete(listener as (event: MediaQueryListEvent) => void);
  };
  return {
    get matches() {
      return isReduce && reduced;
    },
    media: query,
    onchange: null,
    addEventListener: add,
    removeEventListener: remove,
    addListener: (listener: unknown) => add("change", listener),
    removeListener: (listener: unknown) => remove("change", listener),
    dispatchEvent: () => true,
  } as MediaQueryList;
};

globalThis.ResizeObserver = class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
