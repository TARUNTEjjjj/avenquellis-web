# Moving saved practice to Avenquellis

The previous Cloudflare address serves a small browser-local migration page. With no meaningful saved work, the browser continues to [Avenquellis](https://avenquellis.pages.dev/), retaining ordinary paths, queries and fragments and removing credential-like parameters. With saved work, the visitor can download an Avenquellis-compatible backup and open **Your progress → Restore backup** on the new origin. The backup preserves the old test deadline, so moving or reopening it never grants extra time. An expired test finishes when the new workspace detects its deadline. Review data imported from another browser remains labeled unverified.

The page reads only recognized local workspace/review keys, handles the original Noether and transitional app names, and never writes or deletes storage. If separate snapshots exist, the page offers distinct downloads; restoring a full backup replaces the current workspace at the destination. An additional recovery file preserves the recognized original record strings if a standard import cannot handle damaged or unusual data. It is a recovery artifact, not a standard import file. A browser that blocks local storage shows instructions and a manual link.

The retirement service worker has no fetch handler and does not forcibly activate, claim existing tabs, delete caches or erase progress. An already controlled exam can keep running in its open tab and save further answers. After old tabs close and the browser receives the worker update, subsequent online navigation shows the migration page. Browser profile and origin matter: another browser cannot see these records. A saved local backup is the transfer mechanism between origins.

The historical [private Sites address](https://noether-math-lab.taruntejavula-honeyb.chatgpt.site/) also serves a same-origin export shell behind its previous access gate. Empty visitors continue through the [old Cloudflare address](https://noether-math-lab.pages.dev/) to check that separate origin before reaching the current site. The legacy Sites worker has no practice or inference routes. Its access policy is managed separately by the Sites platform. Both migration pages keep the old origins useful without hosting the full application there.

## Verification

`node --test tests/legacy-migration.test.js` covers active deadlines, current position, flags, saved answers, bookmarks, model-only backups, malformed independent records, multiple storage prefixes and fixed-origin forwarding. `tests/support/build-legacy-site.mjs` generates the private Sites worker from the same migration assets.

The optional Chromium check uses two isolated local origins and an exact previous release, never a user's browser profile. Supply a copy of the previous deployed app with its original `sw.js`; the runner verifies every snapshot asset hash before exercising it.

```sh
PLAYWRIGHT_CORE_PATH=/absolute/path/to/playwright-core \
CHROME_PATH=/absolute/path/to/chrome \
node tests/legacy-migration-browser.mjs /absolute/path/to/old-dist
```

The production cutover was checked against the former 27-asset offline snapshot `0d0746613366476abd0a4549`. In local Chromium the retiring worker waited for a running exam, the old tab kept saving, and the migration preserved its original local entries and caches. A separate isolated browser also downloaded a synthetic timed test on the real old Cloudflare origin, restored it on the live Avenquellis origin, and resumed the same answer and deadline with the imported model record intact. The existing private Site's native publishing status succeeded on version 3 and an anonymous HTTPS request remained gated (401).
