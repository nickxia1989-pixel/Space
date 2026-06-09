# Test Plan

## Requirement Matrix

| Area | Evidence |
| --- | --- |
| Windows desktop app launches | `npm run smoke:electron` |
| Four explorer panes render | `tests/App.test.tsx`; browser DOM verification |
| Modern responsive layout | Browser screenshot at `http://127.0.0.1:5188/`; overflow checks |
| Pane navigation and path UI | `src/App.tsx` controls; browser DOM snapshot |
| Local file operations | `tests/fileService.test.ts` temp-directory lifecycle |
| New File Templates | `tests/fileService.test.ts` template content/date variables; `tests/App.test.tsx` template modal create flow |
| Cross-pane transfer commands | Renderer controls and IPC APIs in `src/App.tsx` and `electron/fileService.ts` |
| Search/filter | Renderer tests and browser interaction check |
| Batch rename | `tests/fileService.test.ts` preview/apply/conflict coverage |
| Folder sync | `tests/fileService.test.ts` one-way missing/newer file coverage |
| Workspace tabs and persistence | `tests/App.test.tsx`; `tests/workspaceStore.test.ts`; smoke launch loads app with store available |
| Stash Shelf | `tests/App.test.tsx` shelf add/hash/clear coverage; manual copy/move shelf checks |
| ZIP archives | `tests/fileService.test.ts` create/list/preview/extract coverage; `tests/App.test.tsx` archive browser coverage |
| Type safety | `npm run typecheck` |
| Production build | `npm run build` |
| Windows package | `npm run package:win`; launch `release/win-unpacked/Space.exe`; `npm run dist:win` setup and portable output |

## Automated Checks

Run these before considering a build stable:

```powershell
npm run typecheck
npm test
npm run build
npm run package:win
npm run dist:win
npm run smoke:electron
```

Expected result: all commands exit with code `0`.

## Manual Desktop Checks

1. Run `npm start`.
2. Confirm the app opens as a desktop window named `Space`.
3. Confirm four panes are visible in the default grid layout.
4. In pane 1, navigate into a folder by double-clicking, then use Back, Forward, Up, breadcrumb buttons, and the editable address bar.
5. Create a temporary folder and create a file from the New File template panel, including a `$date(...)` name, then rename and delete them.
6. Select one or more files and copy/move them to another pane using the `Copy to P#` and `Move to P#` controls.
7. Use Ctrl+C/Ctrl+V and Ctrl+X/Ctrl+V between panes.
8. Toggle details/icon view in a single pane and verify the other panes retain their own view state.
9. Filter a pane by keyword and run recursive search with `Subfolders` checked.
10. Select a text or image file and verify the inspector preview, metadata, reveal action, and SHA-256 action.
11. Select multiple files, open Batch Rename, confirm preview status, apply, and verify renamed files appear in the pane.
12. Open two folders in separate panes, use Folder Sync, confirm the preview direction, apply, and verify missing/newer files copy to the target folder.
13. Create a new workspace tab, clone it, rename it, switch back and forth, and confirm each workspace keeps its own four-pane paths and view state.
14. Select files in multiple panes, add them to Stash Shelf, preview a shelf item, copy the shelf to the active pane, move another shelf batch to the active pane, remove one shelf item, clear the shelf, and calculate SHA-256 for staged files.
15. Select files/folders and use Create ZIP Archive, then double-click the resulting `.zip`, preview entries, extract selected entries, and extract all.
16. Restart the app and confirm workspace tabs, pane locations, layout, active pane, bookmarks, Stash Shelf items, and saved file templates are restored.
17. Run `npm run package:win`, start `release/win-unpacked/Space.exe`, and confirm the packaged app opens without relying on the dev server.
18. Run `npm run dist:win`, confirm `Space-0.1.0-x64-setup.exe` and `Space-0.1.0-x64-portable.exe` are both created, launch the portable exe, and do one smoke pass from an installed copy.

## Browser Renderer Checks

For fast UI checks without touching the local filesystem:

```powershell
npm run dev:renderer
```

Open `http://127.0.0.1:5188/` and verify:

- Exactly four panes render.
- Layout switcher changes grid/columns/rows/focus modes.
- Pane 1 can switch to icon view.
- The New File panel can create a Markdown note from the built-in date template.
- Filtering `Space` in pane 1 reduces the mock result set.
- Adding `Space Notes.md` to Stash Shelf shows it in the left sidebar and Hash reports a shelf SHA-256 line.
- No console `error` or `warning` entries appear.

## Review Notes

- Deleting through the real app uses the OS trash via Electron `shell.trashItem`.
- Copy and move currently resolve name conflicts by appending `copy`, `copy 2`, and so on.
- Recursive search is intentionally capped at 1000 results in the filesystem service and requested as 500 from the renderer to prevent accidental runaway UI work.
- Large text preview is truncated and image preview is capped to avoid loading huge files into renderer memory.
- ZIP extraction validates destination paths to prevent archive entries from writing outside the chosen folder.
