# Space

Space is a Windows desktop file manager inspired by QSpace. It is built with Electron, React, Vite, and TypeScript.

## Current Feature Set

- Four integrated explorer panes in a light, frameless, compact desktop layout.
- Per-pane navigation: back, forward, up, refresh, compact breadcrumb navigation, and editable address bar with path suggestions.
- Per-pane details/icon views, richer icons for common file types, sortable details columns, multi-select, status bar, and active-pane highlighting.
- Sidebar ordered for daily use: Stash Shelf, Windows Explorer Quick Access entries plus Space-only dropped shortcuts, then drives with volume names and usage bars.
- File operations through Electron IPC: create folder, create templated file, rename, delete to trash, copy, move, open, reveal in Explorer, and open Windows Terminal in the current directory.
- Selection utilities: copy selected full paths to the system clipboard and expand the current selection to matching file types or folders.
- Cross-pane workflows: internal copy/cut/paste, drag/drop copy or shift-drop move, and live pane reordering by dragging a pane handle over another pane.
- Search/filter: per-pane filter is hidden by default and opens on demand, with recursive search capped to bounded results.
- Workspace Search: search across the current four-pane workspace, de-duplicate matches from overlapping pane roots, then open, reveal, or add results to Stash Shelf.
- Workspace persistence: pane paths, histories, layout, active pane, and bookmarks are restored between launches.
- New File Templates: create txt, Markdown, Word, Excel, and PowerPoint files from built-in or workspace-saved templates, edit template content, and use `$date(...)` variables in names or content.
- Custom Actions: per-workspace toolbar actions and action hotkeys can be shown, hidden, reordered, assigned, and restored to defaults; right-click opens a fixed grouped Space menu with open/copy/cut/paste, shelf/bookmark/reveal, SVN Update/Commit, and new-file actions.
- Inspector: hidden by default, with on-demand text/image preview, metadata, reveal action, and SHA-256 hash calculation.
- Hash Compare: calculate MD5, SHA-1, SHA-256, or SHA-512 for selected files and group matching hashes to verify duplicates or copied files.
- Folder sync: compare two folders, preview one-way or bidirectional copy actions for missing/newer files, optionally include hidden items, save reusable workspace presets, and execute the sync.
- Workspace tabs: create, clone, rename, delete, switch, auto-save, and restore multiple four-pane workspaces. Legacy single-workspace state is migrated automatically.
- Stash Shelf: collect files or folders from any pane or by dropping onto the shelf area, preview shelf items, copy or move the whole shelf into the active pane, clear individual items, and calculate SHA-256 hashes for staged files.
- ZIP/TAR/TGZ archive tools: double-click supported archives to browse entries, preview text/images inside archives, extract selected/all entries, and create ZIP files from selected local items.
- Keyboard shortcuts: Tab/Shift+Tab pane focus, Ctrl+A/C/X/V, Ctrl+Shift+C for full paths, Ctrl+R, Alt+Up, Delete, F2, Enter, and user-assigned per-workspace action hotkeys.
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

The current implementation focuses on the local Windows filesystem. ZIP, TAR, TGZ, and TAR.GZ archives are supported for browsing and extraction; other archive formats such as 7z/rar, encrypted archives, FTP/SFTP/cloud drives, scheduled/automatic folder sync runs, system-wide global hotkeys, and extracted Windows system icon bitmaps are not implemented yet.
