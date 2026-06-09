# Test Plan

## Requirement Matrix

| Area | Evidence |
| --- | --- |
| Windows desktop app launches | `npm run smoke:electron` |
| Four explorer panes render | `tests/App.test.tsx`; browser DOM verification |
| Modern responsive layout | Browser screenshot at `http://127.0.0.1:5173/`; overflow checks |
| Pane navigation and path UI | `src/App.tsx` controls; browser DOM snapshot |
| Local file operations | `tests/fileService.test.ts` temp-directory lifecycle |
| Cross-pane transfer commands | Renderer controls and IPC APIs in `src/App.tsx` and `electron/fileService.ts` |
| Search/filter | Renderer tests and browser interaction check |
| Batch rename | `tests/fileService.test.ts` preview/apply/conflict coverage |
| Folder sync | `tests/fileService.test.ts` one-way missing/newer file coverage |
| Workspace tabs and persistence | `tests/App.test.tsx`; `tests/workspaceStore.test.ts`; smoke launch loads app with store available |
| ZIP archives | `tests/fileService.test.ts` create/list/preview/extract coverage; `tests/App.test.tsx` archive browser coverage |
| Type safety | `npm run typecheck` |
| Production build | `npm run build` |

## Automated Checks

Run these before considering a build stable:

```powershell
npm run typecheck
npm test
npm run build
npm run smoke:electron
```

Expected result: all commands exit with code `0`.

## Manual Desktop Checks

1. Run `npm start`.
2. Confirm the app opens as a desktop window named `Space`.
3. Confirm four panes are visible in the default grid layout.
4. In pane 1, navigate into a folder by double-clicking, then use Back, Forward, Up, breadcrumb buttons, and the editable address bar.
5. Create a temporary folder and file, rename them, delete them, and confirm they go through the app without renderer errors.
6. Select one or more files and copy/move them to another pane using the `Copy to P#` and `Move to P#` controls.
7. Use Ctrl+C/Ctrl+V and Ctrl+X/Ctrl+V between panes.
8. Toggle details/icon view in a single pane and verify the other panes retain their own view state.
9. Filter a pane by keyword and run recursive search with `Subfolders` checked.
10. Select a text or image file and verify the inspector preview, metadata, reveal action, and SHA-256 action.
11. Select multiple files, open Batch Rename, confirm preview status, apply, and verify renamed files appear in the pane.
12. Open two folders in separate panes, use Folder Sync, confirm the preview direction, apply, and verify missing/newer files copy to the target folder.
13. Create a new workspace tab, clone it, rename it, switch back and forth, and confirm each workspace keeps its own four-pane paths and view state.
14. Select files/folders and use Create ZIP Archive, then double-click the resulting `.zip`, preview entries, extract selected entries, and extract all.
15. Restart the app and confirm workspace tabs, pane locations, layout, active pane, and bookmarks are restored.

## Browser Renderer Checks

For fast UI checks without touching the local filesystem:

```powershell
npm run dev:renderer -- --port 5173
```

Open `http://127.0.0.1:5173/` and verify:

- Exactly four panes render.
- Layout switcher changes grid/columns/rows/focus modes.
- Pane 1 can switch to icon view.
- Filtering `Space` in pane 1 reduces the mock result set.
- No console `error` or `warning` entries appear.

## Review Notes

- Deleting through the real app uses the OS trash via Electron `shell.trashItem`.
- Copy and move currently resolve name conflicts by appending `copy`, `copy 2`, and so on.
- Recursive search is intentionally capped at 1000 results in the filesystem service and requested as 500 from the renderer to prevent accidental runaway UI work.
- Large text preview is truncated and image preview is capped to avoid loading huge files into renderer memory.
- ZIP extraction validates destination paths to prevent archive entries from writing outside the chosen folder.
