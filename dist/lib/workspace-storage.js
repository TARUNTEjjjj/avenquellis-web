/** True when the browser refused a write because this site's storage is full. */
export const storageFull = (error) =>
  error?.name === "QuotaExceededError" || error?.name === "NS_ERROR_DOM_QUOTA_REACHED";

/**
 * Save the workspace as one value. Browsers keep about five million characters per site, and
 * long answers can fill that before the history reaches its 100-session limit. Completed
 * sessions are newest first: when storage is full the oldest are left out until the rest fits,
 * so the history cannot stop the active test, drafts or a just-finished attempt from saving.
 * The newest session is never left out. Returns how many completed sessions were saved.
 */
export function saveWorkspace(storage, key, workspace) {
  const { history } = workspace;
  const save = (kept) => {
    storage.setItem(key, JSON.stringify({ ...workspace, history: history.slice(0, kept) }));
    return kept;
  };
  try {
    return save(history.length);
  } catch (error) {
    if (!storageFull(error) || history.length < 2) throw error;
  }
  // When the newest session does not fit beside current work, leaving out more cannot help.
  save(1);
  for (let kept = history.length - 1; kept > 1; kept--) {
    try {
      return save(kept);
    } catch {
      // Still too large: leave out the next oldest session.
    }
  }
  return 1;
}
