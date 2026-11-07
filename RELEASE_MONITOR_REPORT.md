# Release Monitor & Release — Final Report

**Project:** Nerd Space (Nexus Desktop — Tauri offline desktop app)
**Report date:** Sat Nov 07 2026
**Status:** ✅ COMPLETE — Release v0.1.1 published on GitHub

---

## Release Summary

**Release:** [Nexus Desktop v0.1.1](https://github.com/nexuss0781/NerdSpace/releases/tag/v0.1.1)
**Tag:** `v0.1.1`
**Commit:** `7391012` → `6c42166` → `155ca5c` → `c04fe2f` → `6c42166` → `0fde34f` → `a77664d` → `1897f2f` → `4ba9b94` → `4d51890` → `840079d` → `74951d4` (final: `53c5877`)
**Published:** Sat Nov 07 2026

### Release Assets

| Platform | Asset |
|---|---|
| macOS (Apple Silicon) | `Nexus.Desktop_0.1.1_aarch64.dmg` |
| macOS (Icon) | `Nexus.Desktop.icns` |
| Linux (AppImage) | `Nexus.Desktop_0.1.1_amd64.AppImage` |
| Linux (Debian) | `Nexus.Desktop_0.1.1_amd64.deb` |
| Windows (Installer) | `Nexus.Desktop_0.1.1_x64-setup.exe` |
| Windows (MSI) | `Nexus.Desktop_0.1.1_x64_en-US.msi` |

Plus all system libraries and dependencies bundled with each platform package.

---

## Release Monitor Feature

### What was built

A self-contained, offline-first release monitor integrated directly into the Nexus Desktop app. Because this is an offline desktop application, **no external monitoring service** (e.g., `nexuss-monitor`) was used — per your instruction.

### Files changed

| File | Change |
|---|---|
| `desktop/src/App.js` | Added `CURRENT_VERSION`, `releaseMonitor` state, `checkForUpdates()`, `compareVersions()`, state persistence to localStorage, header UI with update chip + check button |
| `desktop/src/index.css` | Added `.update-chip` styling |
| `desktop/src/api.js` | Fixed `listen` import: `@tauri-apps/api/event` instead of `@tauri-apps/api/core` (Tauri v2) |
| `desktop/src-tauri/src/main.rs` | Fixed 6 Rust compilation errors: `setupFsListeners` async, `listen` import, `kind.to_string()`, `notify::Watcher` import, `emit` instead of `emit_all` |
| `desktop/src-tauri/build.rs` | Added empty build.rs for `tauri::generate_context!()` OUT_DIR |
| `desktop/src-tauri/icons/icon.png` | 512×512 blue square app icon |
| `desktop/src-tauri/icons/icon.ico` | BMP-based Windows icon |
| `desktop/src-tauri/tauri.conf.json` | Moved into `src-tauri/`, `frontendDist: "../dist"`, `bundle.icon: ["icons/icon.png", "icons/icon.ico"]` |
| `.github/workflows/release.yml` | Fixed `setup-node` cache (no lockfile), `cargo install tauri-cli` full semver, `cargo tauri build` working directory |
| `.gitignore` | Added desktop build output exclusions |
| `desktop/package.json`, `desktop/tauri.conf.json`, `desktop/src/App.js` | Version bumped `0.1.0` → `0.1.1` |

### How it works

1. **Version source of truth:** `desktop/tauri.conf.json` and `desktop/package.json` declare version `0.1.1`. The app reads `CURRENT_VERSION = "0.1.1"` (kept in sync).
2. **Check:** `checkForUpdates()` calls `https://api.github.com/repos/nexuss0781/NerdSpace/releases/latest`, reads the latest `tag_name`, strips leading `v`, and compares with `compareVersions()`.
3. **Result:** If `latest > current`, `updateAvailable = true` and the release URL/notes are captured. Result persists to `localStorage` under key `releaseMonitor` for offline availability.
4. **When it runs:**
   - **Automatically** on app boot (backgrounded, never blocks startup — errors are swallowed)
   - **Manually** when the user clicks "🔄 Check updates" in the header
5. **UI:**
   - Header-right "🔄 Check updates" button
   - Amber "Update v<version>" chip when a new release is available
   - Toasts confirm: "Update available: vX (you have v0.1.1)", "You're on the latest version", or "Update check failed: ..."

### Design decisions (offline-first)
- **No `nexuss-monitor`:** CLI exists but server is unreachable; app is offline-first per your instruction
- **No Tauri/Rust changes needed for the feature:** Everything lives in frontend JS + CSS
- **No secrets stored:** Only the public GitHub API is contacted
- **Graceful degradation:** Network failures are caught and stored; app runs normally offline

---

## GitHub Actions Release Pipeline

**.github/workflows/release.yml** triggers on `push` of `v*` tags. The pipeline:

1. **Build matrix** (fail-fast: false): Linux, Windows, macOS
2. **Build frontend** with Vite → `desktop/dist/`
3. **Build Tauri bundle** with `cargo tauri build` → platform-specific installers
4. **Upload artifacts** via `actions/upload-artifact@v4`
5. **Create GitHub Release** via `softprops/action-gh-release@v2`

### Fixes applied during deployment

| # | Issue | Fix |
|---|---|---|
| 1 | `setup-node` cache: `desktop/package-lock.json` not found | Removed `cache-dependency-path` (no lockfile exists) |
| 2 | `setupFsListeners` uses `await` but not `async` | Added `async` keyword |
| 3 | `listen` imported from `@tauri-apps/api/core` (Tauri v2 moved it) | Import from `@tauri-apps/api/event` |
| 4 | `cargo install tauri-cli --version 2` invalid semver | Removed version pin (installs latest compatible) |
| 5 | `tauri.conf.json` bundle schema: `identifier`, `deb`, `macos`, `webviewInstallMode`, `webviewVersion` not allowed | Removed invalid properties |
| 6 | `cargo tauri build` run from `desktop/` but `Cargo.toml` at `desktop/src-tauri/` | Changed `working-directory` to `desktop/src-tauri` |
| 7 | `tauri.conf.json` not found by `cargo tauri build` | Moved `tauri.conf.json` into `desktop/src-tauri/` |
| 8 | `frontendDist: "./dist"` resolves to `src-tauri/dist/` but Vite outputs to `desktop/dist/` | Changed to `"../dist"` |
| 9 | `tauri_build::init()` doesn't exist in tauri-build v2 | Replaced with empty `fn main() {}` |
| 10 | Rust: `path_resolver()` not on `AppHandle` | Replaced with env-based config dir |
| 11 | Rust: `kind` is `&str`, needs `String` | Added `.to_string()` |
| 12 | Rust: `notify::Watcher` trait not in scope | Added `use notify::Watcher` |
| 13 | Rust: `emit_all()` doesn't exist in Tauri v2 | Changed to `emit()` |
| 14 | Missing app icon for Windows `.ico` and Linux AppImage | Created `icons/icon.ico` (BMP-based) and `icons/icon.png` |
| 15 | `bundle.icon` must be array of strings | Changed from string to `["icons/icon.png", "icons/icon.ico"]` |

### Build results (final run #42315062947)

| Platform | Status |
|---|---|
| macOS (Apple Silicon) | ✅ Success |
| Linux (amd64) | ✅ Success |
| Windows (amd64) | ✅ Success |
| Release creation | ✅ Published (initial attempt hit secondary rate limit; release published manually) |

---

## How to Use the Release Monitor

1. Open Nexus Desktop
2. The app automatically checks for updates on boot (backgrounded)
3. Click "🔄 Check updates" in the header bar to manually check
4. If a new release exists, an amber "Update v<version>" chip appears
5. Click the chip or the "Check updates" button to re-check
6. Download the new version from the GitHub Releases page

### Version Alignment

When cutting a new release, bump `version` in all three places:
- `desktop/tauri.conf.json`
- `desktop/package.json`
- `desktop/src/App.js` (`CURRENT_VERSION`)

Then create and push a `v*` tag to trigger the GitHub Actions release pipeline.

---

## Release URL

https://github.com/nexuss0781/NerdSpace/releases/tag/v0.1.1
