/** Optional engines and the paper catalog must not prevent access to saved work. */
export async function optionalResource(load, timeoutMs = 8000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(load),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function loadWorkspaceResources({loadMath, loadGrader, fetchImpl = globalThis.fetch}) {
  return Promise.all([
    optionalResource(loadMath),
    optionalResource(loadGrader),
    optionalResource(async () => {
      const response = await fetchImpl('./archive.json', {signal: AbortSignal.timeout(8000)});
      if (!response.ok) throw Error('Paper catalog unavailable.');
      const catalog = await response.json();
      if (![catalog?.papers, catalog?.questionReferences, catalog?.sources].every(Array.isArray))
        throw Error('Invalid paper catalog.');
      return catalog;
    }),
  ]);
}
