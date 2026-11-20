import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RunResponse } from "./api";
import { type Reply, runFixture, RUN_ID, stubFetch, uuid } from "./fixtures";
import { useRunPoll } from "./useRunPoll";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);

// Only the timer functions are fake: the poll is a `setTimeout` chain, and
// `Response.json()` keeps working.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const runPath = (id: string) => `/api/studio/runs/${id}`;

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

// Replies in order; the last reply repeats.
function sequence(replies: Reply[]) {
  let i = 0;
  return () => replies[Math.min(i++, replies.length - 1)];
}

it("useRunPoll polls every 2000 ms and stops at draft_ready, calling onDone once", async () => {
  const next = sequence([
    { status: 200, body: runFixture("running") },
    { status: 200, body: runFixture("running") },
    { status: 200, body: runFixture("draft_ready") },
  ]);
  const { calls } = stubFetch(() => next());
  const onDone = vi.fn<(r: RunResponse) => void>();
  const { result } = renderHook(() => useRunPoll(RUN_ID, onDone));

  await advance(0);
  expect(calls.map((c) => c.path)).toEqual([runPath(RUN_ID)]);
  await advance(1999);
  expect(calls).toHaveLength(1);
  await advance(1);
  expect(calls).toHaveLength(2);
  expect(onDone).not.toHaveBeenCalled();
  await advance(2000);
  expect(calls).toHaveLength(3);
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(onDone.mock.calls[0][0].run.status).toBe("draft_ready");
  expect(result.current.latest?.run.status).toBe("draft_ready");
  expect(result.current.lost).toBe(false);

  await advance(20_000);
  expect(calls).toHaveLength(3);
  expect(onDone).toHaveBeenCalledTimes(1);
});

it("useRunPoll stops at needs_review and at failed", async () => {
  for (const status of ["needs_review", "failed"] as const) {
    const { calls } = stubFetch(() => ({ status: 200, body: runFixture(status) }));
    const onDone = vi.fn<(r: RunResponse) => void>();
    const { unmount } = renderHook(() => useRunPoll(RUN_ID, onDone));
    await advance(0);
    await advance(10_000);
    expect(calls).toHaveLength(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    unmount();
  }
});

it("useRunPoll never has two requests in flight", async () => {
  // Each reply comes 5000 ms after its request.
  const { calls } = stubFetch(
    () => new Promise<Reply>((resolve) => setTimeout(() => resolve({ status: 200, body: runFixture("running") }), 5000)),
  );
  renderHook(() => useRunPoll(RUN_ID, () => {}));

  await advance(0);
  expect(calls).toHaveLength(1);
  await advance(5000);
  expect(calls).toHaveLength(1);
  // The next request is 2000 ms after the reply, not 2000 ms after the request.
  await advance(1999);
  expect(calls).toHaveLength(1);
  await advance(1);
  expect(calls).toHaveLength(2);
});

it("useRunPoll stops on unmount (no fetch after unmount)", async () => {
  const { calls } = stubFetch(() => ({ status: 200, body: runFixture("running") }));
  const { unmount } = renderHook(() => useRunPoll(RUN_ID, () => {}));
  await advance(0);
  expect(calls).toHaveLength(1);
  unmount();
  await advance(20_000);
  expect(calls).toHaveLength(1);
});

it("useRunPoll stops after 5 consecutive failures and sets lost", async () => {
  // 4 failures, 1 success, then failures only: the success resets the count.
  const replies: Reply[] = [
    ...Array.from({ length: 4 }, () => ({ status: 500, body: { error: "internal" } })),
    { status: 200, body: runFixture("running") },
    { status: 503, body: null },
  ];
  const next = sequence(replies);
  const { calls } = stubFetch(() => next());
  const onDone = vi.fn<(r: RunResponse) => void>();
  const { result } = renderHook(() => useRunPoll(RUN_ID, onDone));

  await advance(0);
  // Requests 2 to 9 come 2000 ms apart: failures 1 to 4, the success, failures 1 to 4.
  for (let i = 0; i < 8; i++) await advance(2000);
  expect(calls).toHaveLength(9);
  expect(result.current.lost).toBe(false);

  // The 5th failure in a row.
  await advance(2000);
  expect(calls).toHaveLength(10);
  expect(result.current.lost).toBe(true);

  await advance(20_000);
  expect(calls).toHaveLength(10);
  expect(onDone).not.toHaveBeenCalled();
});

it("useRunPoll sends no request without a runId", async () => {
  const { calls } = stubFetch(() => ({ status: 200, body: runFixture("running") }));
  const { result } = renderHook(() => useRunPoll(undefined, () => {}));
  await advance(10_000);
  expect(calls).toHaveLength(0);
  expect(result.current).toEqual({ latest: undefined, lost: false });
});

it("useRunPoll ignores a reply that arrives after runId changed", async () => {
  const otherRun = uuid(301);
  const { calls } = stubFetch((call) =>
    call.path === runPath(RUN_ID)
      ? new Promise<Reply>((resolve) => setTimeout(() => resolve({ status: 200, body: runFixture("draft_ready") }), 5000))
      : { status: 200, body: runFixture("running", [], { id: otherRun }) },
  );
  const onDone = vi.fn<(r: RunResponse) => void>();
  const { result, rerender } = renderHook(({ id }: { id: string }) => useRunPoll(id, onDone), {
    initialProps: { id: RUN_ID },
  });
  await advance(1000);
  rerender({ id: otherRun });
  await advance(0);
  expect(calls.map((c) => c.path)).toEqual([runPath(RUN_ID), runPath(otherRun)]);

  // The reply for the first run arrives at 5000 ms.
  await advance(5000);
  expect(onDone).not.toHaveBeenCalled();
  expect(result.current.latest?.run.id).toBe(otherRun);
});
