// Per-credential single-flight lock.
//
// All Playwright work for a credential runs against ONE shared in-memory
// browser + page (see session.ts — `sessions` Map keyed by credentialId).
// The web UI is naturally serial (one human clicking), but a remote/agent
// caller can fire concurrent requests. Two actions sharing the same page would
// trample each other (interleaved navigations, garbled scrapes), so calls on
// the SAME credential must run strictly one-at-a-time. Different credentials
// have independent browsers and run in parallel.
//
// FIFO, re-entrancy-free. Acquire returns a release() that is safe to call
// once; always release in a finally (withCredentialLock does this for you).

type Lane = {
  // Tail of the promise chain: resolves when the last queued holder releases.
  tail: Promise<void>;
  // Number of holders currently queued or running on this lane.
  waiters: number;
};

const lanes = new Map<string, Lane>();

/**
 * Acquire the lock for `credentialId`. Resolves once the caller owns the lock
 * (all prior holders released). Returns a release function — call it exactly
 * once when done (double-calls are ignored).
 */
export async function acquireCredentialLock(
  credentialId: string,
): Promise<() => void> {
  let lane = lanes.get(credentialId);
  if (!lane) {
    lane = { tail: Promise.resolve(), waiters: 0 };
    lanes.set(credentialId, lane);
  }
  lane.waiters++;

  const prev = lane.tail;
  let release!: () => void;
  // Our segment of the chain: the next holder waits on this until we release.
  lane.tail = new Promise<void>((resolve) => {
    release = resolve;
  });

  // Block until every prior holder has finished — then we own the lock.
  await prev;

  let released = false;
  const heldLane = lane;
  return () => {
    if (released) return;
    released = true;
    release();
    heldLane.waiters--;
    // Drop the lane once it fully drains so the map can't grow unbounded.
    if (heldLane.waiters === 0 && lanes.get(credentialId) === heldLane) {
      lanes.delete(credentialId);
    }
  };
}

/**
 * Run `fn` while holding the per-credential lock, releasing automatically.
 * Use this to wrap any handler body that drives the shared Playwright page.
 */
export async function withCredentialLock<T>(
  credentialId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const release = await acquireCredentialLock(credentialId);
  try {
    return await fn();
  } finally {
    release();
  }
}
