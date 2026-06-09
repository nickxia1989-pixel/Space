# Space

Space is a Windows desktop file manager inspired by QSpace. It is built with Electron, React, Vite, and TypeScript.

## Current Feature Set

- Four integrated explorer panes with a modern compact desktop layout.
- Per-pane navigation: back, forward, up, refresh, breadcrumb navigation, and editable address bar.
- Per-pane details/icon views, sortable details columns, multi-select, status bar, and active-pane highlighting.
- Quick Access sidebar for common Windows user folders, drive list, and user bookmarks.
- File operations through Electron IPC: create folder, create templated file, rename, delete to trash, copy, move, open, reveal in Explorer, and open terminal.
- Cross-pane workflows: copy/move selected files to any other pane, internal copy/cut/paste, and drag/drop copy or shift-drop move.
- Search/filter: instant pane filtering and recursive search with bounded results.
- Workspace persistence: pane paths, histories, layout, active pane, and bookmarks are restored between launches.
- New File Templates: create files from built-in or workspace-saved templates, edit template content, and use `$date(...)` variables in names or content.
- Color Rules: per-workspace rules highlight matching files/folders by type, name operator, extension, size, modified age, and created age with custom text/background colors.
- Quick Launch: per-workspace launch items run apps, command lines, or shortcuts from the active pane with variables for current path and selected files.
- Custom Actions: per-workspace toolbar and context menu actions can be shown, hidden, reordered, and restored to defaults.
- Inspector: text/image preview, metadata, reveal action, and SHA-256 hash calculation.
- Batch rename: selected items get a live rename preview with sequence, date, find/replace, case conversion, prefix/suffix, conflict detection, reusable workspace presets, apply, and per-workspace rename history.
- Folder sync: compare two folders, preview one-way or bidirectional copy actions for missing/newer files, optionally include hidden items, save reusable workspace presets, and execute the sync.
- Workspace tabs: create, clone, rename, delete, switch, auto-save, and restore multiple four-pane workspaces. Legacy single-workspace state is migrated automatically.
- Stash Shelf: collect files or folders from any pane, preview shelf items, copy or move the whole shelf into the active pane, clear individual items, and calculate SHA-256 hashes for staged files.
- ZIP/TAR/TGZ archive tools: double-click supported archives to browse entries, preview text/images inside archives, extract selected/all entries, and create ZIP files from selected local items.
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
npm run package:win
npm run dist:win
npm run smoke:electron
```

`npm start` builds the production renderer and Electron main process, then launches the Windows desktop app.

`npm run smoke:electron` builds the app, starts Electron with `SPACE_SMOKE_TEST=1`, verifies the production window can load, and exits automatically.

`npm run package:win` creates an unpacked Windows x64 build under `release/win-unpacked`. Use it for fast packaging verification.

`npm run dist:win` creates Windows x64 NSIS and portable distributables under `release/`:

- `Space-0.1.0-x64-setup.exe`
- `Space-0.1.0-x64-portable.exe`

## Project Structure

- `electron/`: Electron main process, preload bridge, filesystem service, and workspace persistence.
- `src/`: React app, shared contracts, renderer API adapter, path utilities, and styling.
- `tests/`: Vitest coverage for path utilities, filesystem service behavior, and renderer smoke interactions.
- `dist/`, `dist-electron/`, and `release/`: generated build/package output, ignored by Git.

## Known Scope Boundaries

The current implementation focuses on the local Windows filesystem. ZIP, TAR, TGZ, and TAR.GZ archives are supported for browsing and extraction; other archive formats such as 7z/rar, encrypted archives, FTP/SFTP/cloud drives, scheduled/automatic folder sync runs, media-dimension color rules, global hotkeys, custom per-action icons, and arbitrary third-party context menu providers are not implemented yet.
