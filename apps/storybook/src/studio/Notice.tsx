import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { AlertIcon, ArcIcon, CheckIcon, CrossIcon } from "./icons";

export type NoticeTone = "ok" | "work" | "warn" | "bad";

// The state fill and the notice text of each tone (DESIGN.md 2, "Studio states").
const TONE: Record<NoticeTone, { className: string; Icon: typeof CheckIcon }> = {
  ok: { className: "bg-[var(--ok)] text-[var(--ok-notice)]", Icon: CheckIcon },
  work: { className: "bg-[var(--work)] text-[var(--work-notice)]", Icon: ArcIcon },
  warn: { className: "bg-[var(--warn)] text-[var(--warn-notice)]", Icon: AlertIcon },
  bad: { className: "bg-[var(--bad)] text-[var(--bad-notice)]", Icon: CrossIcon },
};

// The edge of the one action button of a notice (DESIGN.md 6: Card fill, state edge, Teal text).
export const NOTICE_BUTTON_EDGE: Record<NoticeTone, string> = {
  ok: "shadow-[0_3px_0_var(--edge)]",
  work: "shadow-[0_3px_0_var(--work-edge)]",
  warn: "shadow-[0_3px_0_var(--warn-edge)]",
  bad: "shadow-[0_3px_0_var(--bad-edge)]",
};

// A Studio notice (DESIGN.md 6 `Alert`): a 20 px icon, a bold first line,
// then what to do, and one optional action. `alone` is a notice on the Desk.
export function Notice({
  tone,
  title,
  children,
  action,
  alone = false,
}: {
  tone: NoticeTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  alone?: boolean;
}) {
  const { className, Icon } = TONE[tone];
  return (
    <Alert
      className={cn(
        "gap-x-3 gap-y-1 border-0 px-4 py-3 text-[16px] font-semibold *:[svg]:size-5",
        alone ? "rounded-[18px]" : "rounded-[14px]",
        className,
      )}
    >
      <Icon />
      <AlertTitle className="font-extrabold">{title}</AlertTitle>
      {children !== undefined || action !== undefined ? (
        <AlertDescription className="flex flex-col gap-1 text-[16px] font-semibold text-current md:text-[16px]">
          {children}
          {action !== undefined ? <div className="pt-2">{action}</div> : null}
        </AlertDescription>
      ) : null}
    </Alert>
  );
}
