# Release Monitor — Final Report

**Project:** Nerd Space (Nexus Desktop — Tauri offline desktop app)
**Report date:** Fri Nov 06 2026
**Status:** Implemented and integrated (offline-first, no external monitoring service)

## Summary

I built a self-contained release monitor directly into the Nexus Desktop app. Because this is an offline-first desktop application (per your instruction), I did **not** use `nexuss-monitor` or any external uptime/monitoring service. Instead, the app checks GitHub releases on demand and stores the result locally, so it keeps working offline.

## What was built

### Files changed
- `desktop/src/App.js` — release monitor logic + UI
- `desktop/src/index.css` — styling for the update chip
- `RELEASE_MONITOR_REPORT.md` — this report (new)

### How it works

1. **Version source of truth:** `desktop/tauri.conf.json` declares the app version as `0.1.0`. The app reads `CURRENT_VERSION = "0.1.0"` (kept in sync with `tauri.conf.json`).

2. **Check:** `checkForUpdates()` calls the GitHub API
   `https://api.github.com/repos/nexuss0781/NerdSpace/releases/latest`,
   reads the latest `tag_name`, strips a leading `v`, and compares it to the
   current version with a small semver comparator (`compareVersions`).

3. **Result:** If `latest > current`, `updateAvailable = true` and the
   `releaseUrl` / `releaseNotes` are captured. The whole result is
   persisted to `localStorage` under key `releaseMonitor`, so the last-known
   state is available offline.

4. **When it runs:**
   - **Automatically** on app boot (backgrounded, never blocks startup — errors are swallowed).
   - **Manually** when the user clicks "🔄 Check updates" in the header.

5. **UI:**
   - Header-right "🔄 Check updates" button (manual trigger).
   - An amber "Update v<version>" chip appears in the header when a new release is available; clicking it re-checks.
   - Toasts confirm the outcome: "Update available: vX (you have v0.1.0)", "You're on the latest version", or "Update check failed: ...".

### Design decisions (offline-first)
- **No `nexuss-monitor`:** The `nexuss-monitor` CLI is installed but its server (`nexuss-cronjob.onrender.com`) is unreachable (`server unreachable`), and you specified this is an offline desktop app. The monitor is therefore fully local + GitHub API only.
- **No Tauri/Rust changes:** Everything lives in the frontend (`App.js` + CSS). No `src-tauri` rebuild is required, so the change works with the existing Vite dev/build pipeline.
- **No secrets stored:** Only the public GitHub API is contacted; no tokens are written to scripts or the repo.
- **Graceful degradation:** Network failures are caught and stored as `releaseMonitor.error`; the app continues to run normally offline.

## How to use

- Build / run the desktop app as usual (`cd desktop && npm run dev` or `npm run build`).
- Open the app → header bar shows "🔄 Check updates".
- Click it to check GitHub for a new release.
- If an update exists, an amber chip "Update v<version>" shows in the header; the GitHub release URL is included in the stored state for the user to open manually.

## Version alignment

| Source | Version |
|---|---|
| `desktop/tauri.conf.json` | `0.1.0` |
| App `CURRENT_VERSION` | `0.1.0` |
| `desktop/package.json` | `0.1.0` |

When you cut a new release, bump `version` in `desktop/tauri.conf.json` and `desktop/package.json`, then update `CURRENT_VERSION` in `desktop/src/App.js` to match. The monitor will then compare against the new baseline.

## Verification performed
- Reviewed all edited sections of `App.js` and `index.css` for coherence.
- Confirmed all identifiers (`CURRENT_VERSION`, `releaseMonitor`, `checkForUpdates`, `compareVersions`, `loadReleaseMonitorState`, `saveReleaseMonitorState`, `check-updates`, `update-chip`) are wired together: constructor state → init auto-check → header chip/button → action handler → GitHub fetch → localStorage persist → toast.
- Note: `node --check` reports a pre-existing `await` in the non-async `setupFsListeners()` (original code, unrelated to this change) and cannot parse ESM `import`s anyway; it is not a valid gate for this file.

## Next steps (optional)
- Add a "Release Monitor" settings panel showing last-checked-at, latest version, and release notes.
- Cache the GitHub response with an ETag / conditional request to avoid rate limits on frequent checks.
- Add an auto-download/install prompt once a new Tauri bundle is published.
