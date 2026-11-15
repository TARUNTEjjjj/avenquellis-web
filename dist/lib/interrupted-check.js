// A reload, a suspended tab or a dropped connection ends a hosted check with the same
// network error an unreachable checker gives, and a browser can deliver that error to
// the very page it is unloading. A submitted attempt must not be closed on that evidence.
const cutOff = error => error instanceof TypeError || error?.name === 'AbortError';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Returns ask(request), which repeats a request that was cut off before the checker answered.
 * Every cut-off is followed by a pause that only a page still open can finish, so a page being
 * unloaded concludes nothing and the attempt stays pending for the next visit. When the checker
 * stays out of reach through every retry, about three seconds in all, ask() rejects and stops
 * asking for the rest of the submission, and the caller falls back as it always has.
 * Answers, the checker's own errors and its deadline pass through at once.
 */
export function retryInterrupted({retries = 2, pauseMs = 1000, wait = pause} = {}) {
  let unreachable = null;
  return async function ask(request) {
    for (let failures = 0; ; ) {
      if (unreachable) throw unreachable;
      try {
        return await request();
      } catch (error) {
        if (!cutOff(error)) throw error;
        await wait(pauseMs);
        if (++failures > retries) unreachable ??= error;
      }
    }
  };
}
