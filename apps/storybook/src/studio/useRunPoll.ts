import { useEffect, useRef, useState } from "react";
import { type RunResponse, studioApi } from "./api";

const POLL_MS = 2000;
const MAX_FAILURES = 5;
const ENDED = new Set<RunResponse["run"]["status"]>(["draft_ready", "needs_review", "failed"]);

type PollState = { runId: string; latest: RunResponse | undefined; lost: boolean };

// Polls `GET /api/studio/runs/:id` (#23, Exact changes 6). A `setTimeout`
// chain: the next request starts 2000 ms after the previous one settled, so
// two requests are never in flight. A reply after unmount or after `runId`
// changed is ignored. The poll ends at a final status (calling `onDone` once
// per run), after 5 failures in a row (`lost`), and on unmount.
export function useRunPoll(
  runId: string | undefined,
  onDone: (r: RunResponse) => void,
): { latest: RunResponse | undefined; lost: boolean } {
  const [state, setState] = useState<PollState | undefined>(undefined);
  const onDoneRef = useRef(onDone);
  const doneFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (runId === undefined) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const poll = async () => {
      const r = await studioApi.getRun(runId);
      if (!active) return;
      if (r.ok) {
        failures = 0;
        setState({ runId, latest: r.data, lost: false });
        if (ENDED.has(r.data.run.status)) {
          if (doneFor.current !== runId) {
            doneFor.current = runId;
            onDoneRef.current(r.data);
          }
          return;
        }
      } else {
        failures += 1;
        if (failures >= MAX_FAILURES) {
          setState((s) => ({ runId, latest: s?.runId === runId ? s.latest : undefined, lost: true }));
          return;
        }
      }
      timer = setTimeout(() => void poll(), POLL_MS);
    };

    void poll();
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [runId]);

  if (runId === undefined || state?.runId !== runId) return { latest: undefined, lost: false };
  return { latest: state.latest, lost: state.lost };
}
