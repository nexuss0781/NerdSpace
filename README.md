# Nerd Space

A browser-based coding workspace built with React, TypeScript, and Monaco Editor.

## Features

- Collapsible project rail and Explorer-style file tree.
- Create, rename, move, and delete projects, files, and folders.
- Monaco editing with language-aware highlighting and built-in suggestions.
- Optional **ABC** mode: type an alphabetic symbol code and press Space to insert the actual programming character. For example, `lpar` inserts `(`.
- A focused editor workspace without a terminal or AI panel.

Projects and files are saved in browser storage on the current device. This version does not read or write the computer’s native filesystem.

## Run locally

Requirements: Node.js and pnpm (the project pins pnpm 10.18.0).

```bash
pnpm install --frozen-lockfile
pnpm dev:static
```

Open the local address shown by Vite (port 3000 by default). To create a static build or check TypeScript:

```bash
pnpm build:static
pnpm check
```
