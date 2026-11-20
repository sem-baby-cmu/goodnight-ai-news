import { useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { errorOf, studioApi } from "./api";
import { Notice } from "./Notice";
import { cardClass, cardTitleClass, fieldClass, NO_ANSWER, noteClass } from "./ui";

type Mode = "text" | "url";
type Refusal = { title: string; detail: string } | null;

const MIN_WORDS = 200;

// The same count as `limitWords` in the Worker.
function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const segmentClass =
  "h-11 min-w-0 flex-1 rounded-full px-[14px] text-[16px] font-bold text-ink-2 hover:bg-transparent hover:text-ink-2 aria-pressed:bg-card aria-pressed:text-teal-text aria-pressed:shadow-[0_2px_0_var(--seg-edge)] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-solid focus-visible:outline-ink focus-visible:ring-0 relative focus-visible:after:pointer-events-none focus-visible:after:absolute focus-visible:after:-inset-[9px] focus-visible:after:rounded-full focus-visible:after:border-3 focus-visible:after:border-sun";

// The "New story" card (#23, Exact changes 9; DESIGN.md 13.1).
export function NewStoryForm() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [refusal, setRefusal] = useState<Refusal>(null);
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const fieldId = useId();

  const words = countWords(text);
  const ready = mode === "text" ? words >= MIN_WORDS : isHttpUrl(url);

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    const r = await studioApi.createStory(mode === "text" ? { text } : { url });
    setBusy(false);
    if (r.ok) {
      void navigate({ to: "/studio/stories/$storyId", params: { storyId: r.data.storyId }, search: { runId: r.data.runId } });
      return;
    }
    const error = errorOf(r.body);
    if (r.status === 422 && error === "source_rejected") {
      setRefused(true);
      if (mode === "url") {
        setMode("text");
        setRefusal({
          title: "Could not read enough text from that page.",
          detail: "No run was started. Paste the text instead.",
        });
      } else {
        setRefusal({ title: "The text has fewer than 200 words.", detail: "No run was started." });
      }
      return;
    }
    if (r.status === 503 && error === "workflow_unavailable") {
      const body = r.body as { storyId?: unknown };
      if (typeof body.storyId === "string") {
        void navigate({ to: "/studio/stories/$storyId", params: { storyId: body.storyId } });
        return;
      }
    }
    setRefused(false);
    setRefusal(
      r.status === 0
        ? { title: NO_ANSWER, detail: "It is not known if the story was made. Check the stories list before you try again." }
        : { title: `Request failed (${r.status}).`, detail: "No run was started." },
    );
  }

  return (
    <Card
      role="region"
      aria-labelledby={`${fieldId}-title`}
      className={cn(cardClass, "w-full max-w-[440px] lg:flex-[1_1_0]")}
    >
      <h2 id={`${fieldId}-title`} className={cardTitleClass}>
        New story
      </h2>
      <ToggleGroup
        aria-label="Source"
        spacing={1}
        value={[mode]}
        onValueChange={(value) => {
          const next = value[0];
          if (next === "text" || next === "url") setMode(next);
        }}
        className="w-full rounded-full bg-cream p-[3px]"
      >
        <ToggleGroupItem value="text" className={segmentClass}>
          Paste text
        </ToggleGroupItem>
        <ToggleGroupItem value="url" className={segmentClass}>
          Article URL
        </ToggleGroupItem>
      </ToggleGroup>
      <label htmlFor={fieldId} className="text-[14px] leading-[1.2] font-bold text-ink">
        {mode === "text" ? "News text" : "Article address"}
      </label>
      {mode === "text" ? (
        <Textarea
          id={fieldId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={cn(fieldClass, "min-h-40")}
        />
      ) : (
        <Input
          id={fieldId}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={cn(fieldClass, "h-auto")}
        />
      )}
      <p className={cn(noteClass, "flex justify-between gap-3 tabular-nums")}>
        {mode === "text" ? (
          <span className={cn(refused && "font-bold text-[var(--bad-chip)]")}>
            {`${words} ${words === 1 ? "word" : "words"}`}
          </span>
        ) : (
          <span />
        )}
        <span>200 to 2,000 words</span>
      </p>
      {refusal !== null ? (
        <Notice tone="bad" title={refusal.title}>
          {refusal.detail}
        </Notice>
      ) : null}
      <div className="flex justify-end">
        <Button size="lg" disabled={!ready || busy} onClick={() => void submit()}>
          Make story
        </Button>
      </div>
    </Card>
  );
}
