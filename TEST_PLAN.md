# Test Plan

## Requirement Matrix

| Area | Evidence |
| --- | --- |
| Windows desktop app launches | `npm run smoke:electron` verifies the packaged renderer reaches four visible panes; `tests/App.test.tsx` covers visible startup failure instead of endless loading |
| Four explorer panes render | `tests/App.test.tsx`; browser DOM verification |
| Modern responsive layout | Browser screenshot at `http://127.0.0.1:5188/`; overflow checks |
| Pane navigation and path UI | `src/App.tsx` compact breadcrumb plus editable address controls; browser DOM snapshot; path suggestion tests; `tests/App.test.tsx` guards out-of-order pane navigation responses |
| Local file operations | `tests/fileService.test.ts` temp-directory lifecycle, collision-safe copies, blocked self/child folder copies, and Windows-invalid filename rejection; `tests/App.test.tsx` verifies same-folder pane refresh, deleted/moved/renamed-folder pane recovery, and background refresh focus retention |
| Browser mock filesystem | `tests/browserMockApi.test.ts` directory tree rename/delete behavior, rename conflict parity, and Windows-invalid filename rejection |
| Selection and path utilities | `tests/App.test.tsx` copy-path, select-same-type, refresh-retains-existing-selection, filter-clears-hidden-selection, filtered-anchor shift-click fallback, and rename-selects-new-item coverage |
| New File Templates | `tests/fileService.test.ts` template content/date variables plus valid empty docx/xlsx/pptx packages; `tests/App.test.tsx` template modal create flow |
| Windows Terminal | `tests/App.test.tsx` direct active-pane terminal action; `electron/fileService.ts` launches `wt.exe -d` on Windows and falls back to PowerShell only if Windows Terminal is unavailable |
| Custom toolbar/hotkeys and fixed context menu | `tests/App.test.tsx` action visibility, toolbar customization, hotkey trigger coverage, fixed grouped right-click menu coverage, and SVN command dispatch |
| Cross-pane workflows | `tests/App.test.tsx` clipboard copy/cut/paste across panes, cut-clipboard retention after failed paste, live pane handle reordering, sidebar section-specific drops, and drag/drop file copy/move; renderer controls and IPC APIs in `src/App.tsx` and `electron/fileService.ts` |
| Search/filter | `tests/App.test.tsx` per-pane recursive search completion plus browser interaction check |
| Workspace Search | `tests/App.test.tsx` workspace search modal coverage with de-duplicated mock results and Stash Shelf action |
| Hash Compare | `tests/App.test.tsx` selected-file hash comparison modal coverage; `tests/fileService.test.ts` hash calculation coverage |
| Folder sync | `tests/fileService.test.ts` one-way missing/newer file coverage; `tests/App.test.tsx` sync preset save/load/delete coverage |
| Workspace tabs and persistence | `tests/App.test.tsx` including malformed saved workspace recovery; `tests/workspaceStore.test.ts`; smoke launch loads app with store available |
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
4. In pane 1, navigate into a folder by double-clicking, then use Back, Forward, Up, breadcrumb buttons, and the editable address bar; type a partial path and confirm matching path suggestions appear before submitting.
5. Select an item, use Copy Paths and Ctrl+Shift+C, paste into a text target, and confirm full paths are copied one per line; use Select Same Type and confirm matching extensions or folders are selected in the current pane.
6. Create a temporary folder and create a file from the New File template panel, including a `$date(...)` name, then rename and delete them.
   Confirm built-in templates are txt, Markdown, Word, Excel, and PowerPoint, and that JSON/PowerShell/HTML templates are not shown.
7. Use Ctrl+C/Ctrl+V and Ctrl+X/Ctrl+V between panes.
8. Drag selected files from one pane to another to copy them; hold Shift while dropping to move them.
9. Drag the handle on P1 over P4 and confirm the pane preview follows the pointer and the panes reorder before mouse release.
10. Toggle details/icon view in a single pane and verify the other panes retain their own view state.
11. Open the per-pane filter button, filter by keyword, and run recursive search with `Subfolders` checked.
12. Open Workspace Search, search across the current pane roots, confirm duplicate paths collapse to one row, open a file result, reveal a result, and add a result to Stash Shelf.
13. Confirm the inspector is hidden on launch; open it from the top bar, then select a text or image file and verify preview, metadata, reveal action, and SHA-256 action.
14. Select two or more files, open Hash Compare, switch algorithms, calculate hashes, and confirm matching hashes are grouped while unique files remain separate.
15. Open two folders in separate panes, use Folder Sync, save a reusable preset, load it again, confirm the preview direction, apply, and verify missing/newer files copy to the target folder.
16. Create a new workspace tab, clone it, rename it, switch back and forth, and confirm each workspace keeps its own name, four-pane paths, and view state after restart.
17. Select files in multiple panes, add them to Stash Shelf, preview a shelf item, copy the shelf to the active pane, move another shelf batch to the active pane, remove one shelf item, clear the shelf, and calculate SHA-256 for staged files.
18. Drag a file or folder onto Stash Shelf and confirm it is staged; drag a folder onto Shortcut Entries and confirm it becomes a Space-only shortcut without writing to Windows Quick Access.
19. Select files/folders and use Create ZIP Archive, then double-click the resulting `.zip`, preview entries, extract selected entries, and extract all. Also double-click existing `.tar`, `.tgz`, or `.tar.gz` archives and verify browsing, text/image preview, selected extraction, and extract-all.
20. Confirm the sidebar order is Stash Shelf, Shortcut Entries, then Drives; confirm Shortcut Entries include Windows Explorer Quick Access entries without modifying them, and drives show volume names plus usage bars.
21. Click Windows Terminal in the top toolbar and confirm Windows Terminal opens in the active pane directory without a secondary confirmation panel.
22. Right-click a file and a blank pane area, confirm Space renders its fixed grouped menu with simple separators: Open/Copy/Cut/Paste; Shelf/Shortcut/Explorer reveal; SVN Update/SVN Commit; New.
23. Open Customize Actions, hide and reorder toolbar actions, assign a hotkey to Workspace Search, save, and verify the toolbar updates and the hotkey opens Workspace Search.
24. Restart the app and confirm workspace tabs, pane locations, layout, active pane, bookmarks, Stash Shelf items, saved file templates, folder sync presets, action layout, and custom hotkeys are restored.
25. Run `npm run package:win`, start `release/win-unpacked/Space.exe`, and confirm the packaged app opens without relying on the dev server.
26. Run `npm run dist:win`, confirm `Space-0.1.0-x64-setup.exe` and `Space-0.1.0-x64-portable.exe` are both created, launch the portable exe, and do one smoke pass from an installed copy.

## Browser Renderer Checks

For fast UI checks without touching the local filesystem:

```powershell
npm run dev:renderer
```

Open `http://127.0.0.1:5188/` and verify:

- Exactly four panes render.
- Layout switcher changes grid/columns/rows/focus modes.
- The app uses a light shell, the filter row is hidden by default, the inspector is hidden by default, active pane highlighting is obvious, and grid splitters are hidden until hovered.
- Pane 1 can switch to icon view.
- Dragging a pane handle over another pane shows a floating pane preview and reorders panes before mouse release.
- Sidebar headings are `暂存架`, `快捷入口`, `磁盘`; dropping a folder path onto `快捷入口` adds a Space-only shortcut.
- Typing `C:\Users\Traveler\D` in pane 1's address bar shows Desktop, Documents, and Downloads path suggestions.
- The top toolbar shows icons plus text labels; Batch Rename, Color Rules, and Quick Launch are not present.
- The New File panel can create a Markdown note from the built-in date template and shows txt/md/docx/xlsx/pptx templates only.
- The Windows Terminal toolbar action directly invokes the terminal API for the active pane.
- The Folder Sync panel can save a preset, load it back from the preset selector, and delete it.
- The Customize Actions panel can hide a toolbar action, assign `Ctrl+Alt+W` to Workspace Search, and trigger that hotkey from the main shell.
- Right-clicking an item shows the fixed grouped context menu, closes on action/Escape/outside click, and no longer opens the Windows system context menu.
- Opening the filter control and recursively searching `Archive` in pane 3 returns results and clears the loading overlay.
- Workspace Search for `Archive` returns `Archive.zip` and `Archive.tar`, and Shelf adds one result without duplicating repeated pane roots.
- Selecting `Archive.zip` and `Archive.tar`, then running Hash Compare, shows one matching mock hash group.
- Selecting `Desktop`, running Copy Paths, and then Select Same Type copies `C:\Users\Traveler\Desktop` to the mock clipboard and selects the four visible folders.
- Adding `Space Notes.md` to Stash Shelf shows it in the left sidebar and Hash reports a shelf SHA-256 line.
- No console `error` or `warning` entries appear.

## Review Notes

- Deleting through the real app uses the OS trash via Electron `shell.trashItem`.
- Copy and move currently resolve name conflicts by appending `copy`, `copy 2`, and so on.
- Recursive search is intentionally capped at 1000 results in the filesystem service and requested as 500 from the renderer to prevent accidental runaway UI work.
- Large text preview is truncated and image preview is capped to avoid loading huge files into renderer memory.
- Archive extraction validates destination paths to prevent entries from writing outside the chosen folder.
