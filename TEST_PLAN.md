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
| Color Rules | `tests/App.test.tsx` rule creation and highlighted entry coverage; browser DOM style check |
| Quick Launch | `tests/fileService.test.ts` variable/argument construction; `tests/App.test.tsx` panel run/settings coverage |
| Custom toolbar/context menu | `tests/App.test.tsx` action visibility and context menu customization coverage |
| Cross-pane transfer commands | Renderer controls and IPC APIs in `src/App.tsx` and `electron/fileService.ts` |
| Search/filter | Renderer tests and browser interaction check |
| Batch rename | `tests/fileService.test.ts` preview/apply/conflict coverage; `tests/App.test.tsx` preset save/load/delete and history record/clear coverage |
| Folder sync | `tests/fileService.test.ts` one-way missing/newer file coverage; `tests/App.test.tsx` sync preset save/load/delete coverage |
| Workspace tabs and persistence | `tests/App.test.tsx`; `tests/workspaceStore.test.ts`; smoke launch loads app with store available |
| Stash Shelf | `tests/App.test.tsx` shelf add/hash/clear coverage; manual copy/move shelf checks |
| ZIP/TAR/TGZ archives | `tests/fileService.test.ts` ZIP create/list/preview/extract plus TAR/TGZ list/preview/extract and traversal-block coverage; `tests/App.test.tsx` archive browser coverage |
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
11. Select multiple files, open Batch Rename, save a reusable preset, load it again, delete it, confirm preview status, apply, verify renamed files appear in the pane, and confirm the operation appears in Rename History.
12. Open two folders in separate panes, use Folder Sync, save a reusable preset, load it again, confirm the preview direction, apply, and verify missing/newer files copy to the target folder.
13. Create a new workspace tab, clone it, rename it, switch back and forth, and confirm each workspace keeps its own four-pane paths and view state.
14. Select files in multiple panes, add them to Stash Shelf, preview a shelf item, copy the shelf to the active pane, move another shelf batch to the active pane, remove one shelf item, clear the shelf, and calculate SHA-256 for staged files.
15. Select files/folders and use Create ZIP Archive, then double-click the resulting `.zip`, preview entries, extract selected entries, and extract all. Also double-click existing `.tar`, `.tgz`, or `.tar.gz` archives and verify browsing, text/image preview, selected extraction, and extract-all.
16. Open Color Rules, add a rule for `.zip` files, save it, and confirm matching entries are highlighted in details view and icon view without changing selection behavior.
17. Open Quick Launch, run the default PowerShell item from a pane, add a custom command/app/shortcut item, use `{currentPath}` and `{selectedPaths}`, save, and confirm it appears in the Quick Launch panel.
18. Open Customize Actions, hide and reorder toolbar actions, save, and verify the toolbar updates; customize the Context Menu and verify right-click actions follow the saved layout.
19. Restart the app and confirm workspace tabs, pane locations, layout, active pane, bookmarks, Stash Shelf items, saved file templates, saved color rules, saved Quick Launch items, batch rename presets/history, folder sync presets, and action layout are restored.
20. Run `npm run package:win`, start `release/win-unpacked/Space.exe`, and confirm the packaged app opens without relying on the dev server.
21. Run `npm run dist:win`, confirm `Space-0.1.0-x64-setup.exe` and `Space-0.1.0-x64-portable.exe` are both created, launch the portable exe, and do one smoke pass from an installed copy.

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
- The Color Rules panel can add a `.zip` rule and immediately highlight `Archive.zip`.
- The Quick Launch panel runs the default item through the browser mock and opens the settings panel.
- The Batch Rename panel can save a preset, load it back from the preset selector, delete it, record a successful rename in history, and clear history.
- The Folder Sync panel can save a preset, load it back from the preset selector, and delete it.
- The Customize Actions panel can hide a toolbar action and remove a context-menu action.
- Filtering `Space` in pane 1 reduces the mock result set.
- Adding `Space Notes.md` to Stash Shelf shows it in the left sidebar and Hash reports a shelf SHA-256 line.
- No console `error` or `warning` entries appear.

## Review Notes

- Deleting through the real app uses the OS trash via Electron `shell.trashItem`.
- Copy and move currently resolve name conflicts by appending `copy`, `copy 2`, and so on.
- Recursive search is intentionally capped at 1000 results in the filesystem service and requested as 500 from the renderer to prevent accidental runaway UI work.
- Large text preview is truncated and image preview is capped to avoid loading huge files into renderer memory.
- Archive extraction validates destination paths to prevent entries from writing outside the chosen folder.
