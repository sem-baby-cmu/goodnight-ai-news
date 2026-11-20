import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertIcon, ArcIcon, CheckIcon, ClockIcon, CrossIcon, DashIcon } from "./icons";

export type ChipState = "ok" | "work" | "warn-stale" | "warn-review" | "bad" | "none";

// Fill, text colour, and icon of each state (DESIGN.md 2 and 4 "Chips").
// The state variables are not mapped to Tailwind colours, so the classes use
// the variables directly.
const LOOK: Record<ChipState, { className: string; Icon: typeof CheckIcon }> = {
  ok: { className: "bg-[var(--ok)] text-[var(--ok-chip)]", Icon: CheckIcon },
  work: { className: "bg-[var(--work)] text-[var(--work-chip)]", Icon: ArcIcon },
  "warn-stale": { className: "bg-[var(--warn)] text-[var(--warn-chip)]", Icon: ClockIcon },
  "warn-review": { className: "bg-[var(--warn)] text-[var(--warn-chip)]", Icon: AlertIcon },
  bad: { className: "bg-[var(--bad)] text-[var(--bad-chip)]", Icon: CrossIcon },
  none: { className: "bg-[var(--none)] text-[var(--none-chip)]", Icon: DashIcon },
};

export function StateChip({ state, label, className }: { state: ChipState; label: string; className?: string }) {
  const { className: look, Icon } = LOOK[state];
  return (
    <Badge
      className={cn(
        "h-auto gap-[6px] rounded-full border-0 px-[10px] pt-[6px] pb-[5px] text-[14px] leading-[1.2] font-bold",
        look,
        className,
      )}
    >
      <Icon />
      {label}
    </Badge>
  );
}

type PageState = "ok" | "stale" | "missing" | "needs_review";

// Page and target states (implementation decision, Exact changes 8).
export const PAGE_STATE_CHIP: Record<PageState, { state: ChipState; word: string }> = {
  ok: { state: "ok", word: "ok" },
  stale: { state: "warn-stale", word: "stale" },
  needs_review: { state: "warn-review", word: "needs review" },
  missing: { state: "none", word: "missing" },
};

type RunStatus = "queued" | "running" | "draft_ready" | "needs_review" | "failed";

export const RUN_STATUS_CHIP: Record<RunStatus, { state: ChipState; label: string }> = {
  queued: { state: "work", label: "Queued" },
  running: { state: "work", label: "Running" },
  draft_ready: { state: "ok", label: "Ready" },
  needs_review: { state: "warn-review", label: "Needs review" },
  failed: { state: "bad", label: "Failed" },
};
