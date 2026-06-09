# Space

Space is a Windows desktop file manager inspired by QSpace. It is built with Electron, React, Vite, and TypeScript.

## Current Feature Set

- Four integrated explorer panes with a modern compact desktop layout.
- Per-pane navigation: back, forward, up, refresh, breadcrumb navigation, and editable address bar.
- Per-pane details/icon views, sortable details columns, multi-select, status bar, and active-pane highlighting.
- Quick Access sidebar for common Windows user folders, drive list, and user bookmarks.
- File operations through Electron IPC: create folder, create file, rename, delete to trash, copy, move, open, reveal in Explorer, and open terminal.
- Cross-pane workflows: copy/move selected files to any other pane, internal copy/cut/paste, and drag/drop copy or shift-drop move.
- Search/filter: instant pane filtering and recursive search with bounded results.
- Workspace persistence: pane paths, histories, layout, active pane, and bookmarks are restored between launches.
- Inspector: text/image preview, metadata, reveal action, and SHA-256 hash calculation.
- Keyboard shortcuts: Tab/Shift+Tab pane focus, Ctrl+A/C/X/V, Ctrl+R, Alt+Up, Delete, F2, and Enter.
- Testable renderer fallback: when opened in a browser without Electron, Space uses a mock filesystem for UI verification.

## Commands

```powershell
npm install
npm run dev
npm start
npm test
npm run typecheck
npm run build
npm run smoke:electron
```

`npm start` builds the production renderer and Electron main process, then launches the Windows desktop app.

`npm run smoke:electron` builds the app, starts Electron with `SPACE_SMOKE_TEST=1`, verifies the production window can load, and exits automatically.

## Project Structure

- `electron/`: Electron main process, preload bridge, filesystem service, and workspace persistence.
- `src/`: React app, shared contracts, renderer API adapter, path utilities, and styling.
- `tests/`: Vitest coverage for path utilities, filesystem service behavior, and renderer smoke interactions.
- `dist/` and `dist-electron/`: generated build output, ignored by Git.

## Known Scope Boundaries

The current implementation focuses on the local Windows filesystem. QSpace advanced extension areas such as FTP/SFTP/cloud drives, archive browsing, batch rename presets, folder sync, file color rules, and fully customizable toolbars/context menus are not implemented yet.
