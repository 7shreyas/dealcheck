// Runs work after the response is sent (Next's after()). Outside a request
// (tests, scripts) after() throws, so the task just runs un-awaited.

import { after } from "next/server";

export function runAfterResponse(task: () => Promise<void>): void {
  const safe = () => task().catch((err) => console.error("[background] task failed", err));
  try {
    after(safe);
  } catch {
    void safe();
  }
}
