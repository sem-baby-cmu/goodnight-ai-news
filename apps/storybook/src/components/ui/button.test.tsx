import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);

type Variant = "default" | "secondary" | "ghost" | "round" | "link";
type Size = "child-start" | "child" | "child-icon" | "lg" | "default" | "icon";

const variants: Variant[] = ["default", "secondary", "ghost", "round", "link"];
const childSizes: Size[] = ["child-start", "child", "child-icon"];

// The class tokens of the rendered button. `cn` merges the classes, so the
// test reads the rendered `className`, not the result of `buttonVariants()`.
function classesOf(variant: Variant, size: Size): string[] {
  render(
    <Button variant={variant} size={size}>
      Label
    </Button>,
  );
  const button = screen.getByRole("button");
  const classes = button.className.split(/\s+/).filter(Boolean);
  cleanup();
  return classes;
}

// Copied from DESIGN.md section 4, "Buttons", with the variant `default`.
// The weight of `default` and `icon` is not listed here: the Primary variant
// sets 800 at every size (a separate test).
const sizeClasses: Record<Size, { has: string[]; hasNot: string[] }> = {
  "child-start": {
    has: [
      "h-[76px]",
      "pr-[46px]",
      "pl-[34px]",
      "gap-3",
      "text-[32px]",
      "leading-none",
      "font-extrabold",
      "[&_svg]:size-[34px]",
      "data-disabled:opacity-35",
    ],
    hasNot: ["data-disabled:bg-cream"],
  },
  child: {
    has: [
      "h-[68px]",
      "pr-[38px]",
      "pl-[30px]",
      "gap-3",
      "text-[28px]",
      "leading-[1.3]",
      "font-extrabold",
      "[&_svg]:size-[30px]",
      "data-disabled:opacity-35",
    ],
    hasNot: ["data-disabled:bg-cream"],
  },
  "child-icon": {
    has: ["size-[64px]", "[&_svg]:size-[28px]", "[&_svg]:stroke-3", "data-disabled:opacity-35"],
    hasNot: ["data-disabled:bg-cream"],
  },
  lg: {
    has: ["h-[52px]", "px-[28px]", "gap-2", "text-[16px]", "leading-none", "font-extrabold", "[&_svg]:size-[20px]"],
    hasNot: ["data-disabled:opacity-35"],
  },
  default: {
    has: ["h-[44px]", "px-[20px]", "gap-2", "text-[16px]", "leading-none", "[&_svg]:size-[20px]"],
    hasNot: ["data-disabled:opacity-35", "h-8"],
  },
  icon: {
    has: ["size-[44px]", "[&_svg]:size-[20px]"],
    hasNot: ["data-disabled:opacity-35", "size-8"],
  },
};

it("each size has its DESIGN.md height, padding and text", () => {
  for (const [size, { has, hasNot }] of Object.entries(sizeClasses) as [Size, (typeof sizeClasses)[Size]][]) {
    const classes = classesOf("default", size);
    for (const name of has) expect(classes, `${size} has ${name}`).toContain(name);
    for (const name of hasNot) expect(classes, `${size} lacks ${name}`).not.toContain(name);
  }
});

// Copied from DESIGN.md section 4, "Buttons" and "Edges", with the size `default`.
const variantClasses: Record<Variant, { has: string[]; hasNot: string[] }> = {
  default: {
    has: [
      "bg-primary",
      "text-primary-foreground",
      "shadow-[0_4px_0_var(--teal-edge)]",
      "active:not-data-disabled:translate-y-[2px]",
      "active:not-data-disabled:shadow-[0_2px_0_var(--teal-edge)]",
    ],
    hasNot: [],
  },
  secondary: {
    has: [
      "bg-secondary",
      "text-secondary-foreground",
      "shadow-[0_3px_0_var(--soft-edge)]",
      "active:not-data-disabled:translate-y-[2px]",
      "active:not-data-disabled:shadow-[0_1px_0_var(--soft-edge)]",
    ],
    hasNot: [],
  },
  ghost: {
    has: ["bg-transparent", "text-teal-text", "hover:not-data-disabled:bg-soft"],
    hasNot: [], // "ghost button: edge none"; checked below for every `shadow-*` class
  },
  round: {
    has: ["bg-card", "text-teal-deep", "shadow-[0_3px_0_var(--edge)]", "active:not-data-disabled:scale-[0.94]"],
    hasNot: [],
  },
  link: {
    has: ["bg-transparent", "text-teal-text", "underline-offset-3", "hover:underline", "px-0"],
    hasNot: ["px-[20px]"],
  },
};

it("each variant has its fill, text and edge", () => {
  for (const [variant, { has, hasNot }] of Object.entries(variantClasses) as [Variant, (typeof variantClasses)[Variant]][]) {
    const classes = classesOf(variant, "default");
    for (const name of has) expect(classes, `${variant} has ${name}`).toContain(name);
    for (const name of hasNot) expect(classes, `${variant} lacks ${name}`).not.toContain(name);
  }
});

it("a ghost and a link button have no hard edge", () => {
  for (const variant of ["ghost", "link"] as const) {
    const edges = classesOf(variant, "default").filter((name) => name.startsWith("shadow-"));
    expect(edges, variant).toEqual([]);
  }
});

it("a Primary button has weight 800 at the default size", () => {
  const classes = classesOf("default", "default");
  expect(classes).toContain("font-extrabold");
  expect(classes).not.toContain("font-bold");
});

it("a child Primary button has a 5 px edge", () => {
  for (const size of childSizes) {
    const classes = classesOf("default", size);
    expect(classes, size).toContain("shadow-[0_5px_0_var(--teal-edge)]");
    expect(classes, size).toContain("active:not-data-disabled:translate-y-[3px]");
    expect(classes, size).not.toContain("shadow-[0_4px_0_var(--teal-edge)]");
    expect(classes, size).not.toContain("active:not-data-disabled:translate-y-[2px]");
  }
});

it("every button has the two focus rings", () => {
  for (const variant of variants) {
    const classes = classesOf(variant, "default");
    for (const name of [
      "focus-visible:outline-3",
      "focus-visible:outline-offset-3",
      "focus-visible:outline-ink",
      "focus-visible:after:-inset-[9px]",
      "focus-visible:after:border-3",
      "focus-visible:after:border-sun",
      "rounded-full",
    ]) {
      expect(classes, `${variant} has ${name}`).toContain(name);
    }
  }
});

it("a disabled Studio button has one look", () => {
  for (const variant of variants) {
    render(
      <Button variant={variant} size="default" disabled>
        Label
      </Button>,
    );
    const button = screen.getByRole("button");
    const classes = button.className.split(/\s+/);
    expect(button.hasAttribute("disabled"), `${variant} disabled`).toBe(true);
    expect(button.hasAttribute("data-disabled"), `${variant} data-disabled`).toBe(true);
    for (const name of [
      "data-disabled:bg-cream",
      "data-disabled:text-ink-2",
      "data-disabled:shadow-[0_3px_0_var(--disabled-edge)]",
      "data-disabled:cursor-not-allowed",
    ]) {
      expect(classes, `${variant} has ${name}`).toContain(name);
    }
    // A bare or `disabled:` pointer-events-none would hide `cursor: not-allowed`.
    expect(classes, variant).not.toContain("pointer-events-none");
    expect(classes, variant).not.toContain("disabled:pointer-events-none");
    cleanup();
  }
});

it("a disabled Player button keeps the focus", () => {
  const spy = vi.fn();
  render(
    <Button size="child" disabled focusableWhenDisabled onClick={spy}>
      Label
    </Button>,
  );
  const button = screen.getByRole("button");
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(button.hasAttribute("disabled")).toBe(false);
  expect(button.hasAttribute("data-disabled")).toBe(true);
  expect(button.className.split(/\s+/)).toContain("data-disabled:opacity-35");
  button.focus();
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
  expect(spy).not.toHaveBeenCalled();
});

it("no stock base-nova classes", () => {
  const classes = classesOf("default", "default");
  for (const name of ["rounded-lg", "h-8", "opacity-50", "ring-ring/50", "hover:bg-primary/80"]) {
    expect(classes, name).not.toContain(name);
  }
});

it("only the DESIGN.md variants and sizes type-check", () => {
  // The calls are never run. `pnpm -r typecheck` fails when a directive is unused.
  const never = () => (
    <>
      {/* @ts-expect-error "sm" is not a DESIGN.md size */}
      <Button size="sm" />
      {/* @ts-expect-error "outline" is not a DESIGN.md variant */}
      <Button variant="outline" />
    </>
  );
  expect(typeof never).toBe("function");
});
