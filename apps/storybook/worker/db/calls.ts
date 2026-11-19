import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { type CallRow, type NewCallRow, callLog } from "./schema";

export async function getCall(db: Db, callId: string): Promise<CallRow | null> {
  const [row] = await db.select().from(callLog).where(eq(callLog.callId, callId));
  return row ?? null;
}

// Stores the result of a call once. The first write wins: a second writer
// gets the stored row, and must use it instead of its own result.
export async function putCall(db: Db, row: NewCallRow): Promise<CallRow> {
  const [, stored] = await db.batch([
    db.insert(callLog).values(row).onConflictDoNothing({ target: callLog.callId }),
    db.select().from(callLog).where(eq(callLog.callId, row.callId)),
  ]);
  const [result] = stored;
  if (!result) throw new Error("call_log row not found after insert");
  return result;
}
