# Nexus Desktop

Tauri v2 desktop application that:

1. **Turns any website into a desktop app** — assign a website URL to a project and open it in its own bundled webview window.
2. **Manages your projects and files** — pick a root folder once (e.g. `Desktop/Nex`); every immediate subfolder becomes a project. Full CRUD over projects, folders, and files, with real-time updates.
3. **Builds cross-platform** — GitHub CI produces Linux (AppImage/deb/rpm), Windows (MSI), and macOS (DMG) bundles. Linux is the primary target; Windows and macOS are produced the same way.

## First run

1. Launch the app.
2. Click **Select Root Folder** and choose a folder (e.g. `Desktop/Nex`).
3. Nexus remembers that folder for this computer. Every subfolder under it appears as a project. Folders *inside* a project are normal folders, not projects.
4. Existing folders under the root are imported as projects automatically.

## Features

- **Projects:** create, rename, delete project folders under your root.
- **Website wrapping:** open any project card, set a website URL, then click **Open Website** to run that site in a dedicated desktop window (a real bundled Tauri webview app).
- **Files & folders:** full CRUD (create, read, update, delete, rename) for files and folders inside projects.
- **Real-time:** the file watcher refreshes the current view whenever files change on disk.
- **Persistence:** root folder and per-project metadata (name, website URL) are saved in the app config directory, so they persist across restarts.

## Development

```bash
cd desktop
npm install        # or npm ci
npm run dev        # frontend dev server (Tauri dev mode needs `cargo tauri`)
```

For Tauri dev commands install the CLI: `cargo install tauri-cli --version 2`.

## Building / CI

- `npm run build` — builds the Vite frontend into `desktop/dist`.
- `cargo tauri build` — bundles the app for the current platform.
- `.github/workflows/release.yml` — builds Linux, Windows, and macOS on git tags (`v*`) and publishes a GitHub Release with all bundles.

Linux is the primary target; the same workflow produces Windows (MSI) and macOS (DMG) bundles on their respective runners.

## Project structure

```
desktop/
├── src-tauri/
│   ├── Cargo.toml
│   ├── src/main.rs          # Rust backend: commands + FS watcher + settings persistence
│   └── capabilities/default.json
├── tauri.conf.json          # Tauri config + bundle targets (all)
├── package.json             # Vite + @tauri-apps/api
├── vite.config.js
├── index.html
└── src/
    ├── main.js
    ├── api.js               # Tauri invoke wrappers
    ├── App.js               # UI: settings, projects, entries, editor, website wrapper
    └── index.css
```

## Notes

- The macOS job runs on `macos-latest` and produces a signed/notarization-ready bundle only if you set `TAURI_SIGNING_PRIVATE_KEY` secrets; otherwise it produces an unsigned DMG.
- Windows Code Signing is optional; without `TAURI_SIGNING_PRIVATE_KEY` the MSI/EXE is unsigned.
