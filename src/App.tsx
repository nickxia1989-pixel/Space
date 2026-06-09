import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Archive,
  ClipboardCopy,
  Columns3,
  Copy,
  Download,
  ExternalLink,
  File,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Grid2X2,
  HardDrive,
  Hash as HashIcon,
  Home,
  Image,
  LayoutGrid,
  List,
  ListFilter,
  Monitor,
  MoreVertical,
  Music,
  Palette,
  PanelRight,
  Pencil,
  Plus,
  RefreshCcw,
  Rocket,
  Rows3,
  Scissors,
  Search,
  SlidersHorizontal,
  Star,
  Terminal,
  Trash2,
  Video
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { getSpaceApi } from "./api";
import {
  breadcrumbs,
  containsPath,
  formatBytes,
  formatDate,
  parentPath,
  pathName,
  trimTrailingSeparator
} from "./pathUtils";
import type {
  BootstrapPayload,
  ClipboardMode,
  ColorRule,
  ColorRuleComparison,
  ColorRuleNameMatch,
  ColorRuleTarget,
  ColorRuleTimeUnit,
  FileEntry,
  HashAlgorithm,
  KnownLocation,
  LayoutMode,
  NewFileTemplate,
  OperationResult,
  PathSuggestion,
  QuickLaunchItem,
  QuickLaunchType,
  BatchRenameHistoryEntry,
  BatchRenamePreset,
  BatchRenamePreview,
  BatchRenameRule,
  FolderSyncDirection,
  FolderSyncPlan,
  FolderSyncPreset,
  HotkeyBinding,
  SortDirection,
  SortKey,
  SpaceApi,
  StashShelfItem,
  ViewMode,
  WorkspaceDocument,
  ArchiveEntry,
  ArchivePreviewPayload,
  WorkspacePaneSnapshot,
  WorkspaceRecord,
  WorkspaceSnapshot
} from "./shared";

interface PaneState extends WorkspacePaneSnapshot {
  entries: FileEntry[];
  selectedPaths: string[];
  anchorPath?: string;
  filter: string;
  recursiveSearch: boolean;
  addressDraft: string;
  loading: boolean;
  error?: string;
  scannedAt?: number;
}

interface ClipboardState {
  mode: ClipboardMode;
  paths: string[];
}

interface ToastState {
  id: number;
  kind: "info" | "error" | "success";
  message: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  paneId: number;
  path?: string;
}

interface ArchiveBrowserState {
  archivePath: string;
  destinationPath: string;
}

interface WorkspaceSearchResult {
  entry: FileEntry;
  sourceLabels: string[];
}

interface HashCompareResult {
  entry: FileEntry;
  value?: string;
  error?: string;
}

const paneIds = [1, 2, 3, 4];
const layoutModes: LayoutMode[] = ["grid", "columns", "rows", "focus"];
const sortKeys: SortKey[] = ["name", "size", "modifiedAt", "type"];
const sortLabels: Record<SortKey, string> = {
  name: "Name",
  size: "Size",
  modifiedAt: "Modified",
  type: "Type"
};
const iconByName: Record<string, LucideIcon> = {
  home: Home,
  monitor: Monitor,
  "file-text": FileText,
  download: Download,
  image: Image,
  music: Music,
  video: Video
};
const quickLaunchVariableTokens = [
  "{currentPath}",
  "{selectedPaths}",
  "{selectedFiles}",
  "{selectedFolders}",
  "{firstSelected}",
  "{firstName}",
  "{selectedNames}"
];

const defaultBatchRenameRule: BatchRenameRule = {
  pattern: "{name}-{n}",
  startNumber: 1,
  step: 1,
  padLength: 2,
  prefix: "",
  suffix: "",
  find: "",
  replace: "",
  useRegex: false,
  caseSensitive: false,
  caseMode: "none",
  includeExtension: false
};

const maxBatchRenameHistory = 50;
const currentActionLayoutVersion = 4;
const hashAlgorithms: HashAlgorithm[] = ["sha256", "md5", "sha1", "sha512"];

const defaultToolbarActionIds = [
  "newFolder",
  "newFile",
  "copy",
  "copyPaths",
  "cut",
  "paste",
  "selectSameType",
  "delete",
  "createZip",
  "batchRename",
  "folderSync",
  "addShelf",
  "hashCompare",
  "colorRules",
  "quickLaunch",
  "workspaceSearch",
  "refresh",
  "terminal",
  "bookmark"
];
const defaultContextMenuActionIds = [
  "copy",
  "copyPaths",
  "selectSameType",
  "cut",
  "paste",
  "rename",
  "delete",
  "hash",
  "addShelf",
  "quickLaunch",
  "terminal",
  "reveal"
];
const toolbarActionCatalog = [
  { id: "newFolder", label: "New Folder" },
  { id: "newFile", label: "New File" },
  { id: "copy", label: "Copy" },
  { id: "copyPaths", label: "Copy Paths" },
  { id: "cut", label: "Cut" },
  { id: "paste", label: "Paste" },
  { id: "selectSameType", label: "Select Same Type" },
  { id: "delete", label: "Delete" },
  { id: "createZip", label: "Create ZIP Archive" },
  { id: "batchRename", label: "Batch Rename" },
  { id: "folderSync", label: "Folder Sync" },
  { id: "addShelf", label: "Add To Shelf" },
  { id: "hashCompare", label: "Hash Compare" },
  { id: "colorRules", label: "Color Rules" },
  { id: "quickLaunch", label: "Quick Launch" },
  { id: "workspaceSearch", label: "Workspace Search" },
  { id: "refresh", label: "Refresh" },
  { id: "terminal", label: "Open Terminal" },
  { id: "bookmark", label: "Add Bookmark" }
];
const contextMenuActionCatalog = [
  { id: "copy", label: "Copy" },
  { id: "copyPaths", label: "Copy Paths" },
  { id: "selectSameType", label: "Select Same Type" },
  { id: "cut", label: "Cut" },
  { id: "paste", label: "Paste" },
  { id: "rename", label: "Rename" },
  { id: "delete", label: "Delete" },
  { id: "hash", label: "Calculate SHA-256" },
  { id: "addShelf", label: "Add To Shelf" },
  { id: "quickLaunch", label: "Quick Launch" },
  { id: "terminal", label: "Open Terminal" },
  { id: "reveal", label: "Reveal In Explorer" }
];
const hotkeyActionCatalog = [
  ...toolbarActionCatalog,
  ...contextMenuActionCatalog.filter((item) => !toolbarActionCatalog.some((toolbarItem) => toolbarItem.id === item.id))
];

type ActionCatalogItem = { id: string; label: string };

const defaultFileTemplates: NewFileTemplate[] = [
  {
    id: "default-blank-text",
    label: "Blank Text",
    fileName: "New File.txt",
    content: "",
    createdAt: 0
  },
  {
    id: "default-markdown-note",
    label: "Markdown Note",
    fileName: "Note-$date(yyyy-MM-dd).md",
    content: "# $date(yyyy-MM-dd)\n\n",
    createdAt: 0
  },
  {
    id: "default-json",
    label: "JSON",
    fileName: "data-$date(yyyyMMdd).json",
    content: "{\n  \"createdAt\": \"$date(yyyy-MM-dd HH:mm:ss)\"\n}\n",
    createdAt: 0
  },
  {
    id: "default-powershell",
    label: "PowerShell Script",
    fileName: "script-$date(yyyyMMdd).ps1",
    content: "# Created $date(yyyy-MM-dd HH:mm:ss)\n\n",
    createdAt: 0
  },
  {
    id: "default-html",
    label: "HTML Page",
    fileName: "index.html",
    content: "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\" />\n  <title>New Page</title>\n</head>\n<body>\n  <main></main>\n</body>\n</html>\n",
    createdAt: 0
  }
];

function createColorRule(label = "Archives"): ColorRule {
  return {
    id: `color-rule-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label,
    enabled: true,
    target: "files",
    textColor: "#fff2b7",
    backgroundColor: "#4b3714",
    nameMatch: "contains",
    namePattern: "",
    extensions: "zip, tar, tgz, 7z, rar",
    sizeComparison: "any",
    sizeValueMB: 100,
    modifiedComparison: "any",
    modifiedValue: 1,
    modifiedUnit: "days",
    createdComparison: "any",
    createdValue: 1,
    createdUnit: "days",
    createdAt: Date.now()
  };
}

function isSupportedArchiveEntry(entry: FileEntry): boolean {
  const name = entry.name.toLowerCase();
  return name.endsWith(".zip") || name.endsWith(".tar") || name.endsWith(".tgz") || name.endsWith(".tar.gz");
}

function createQuickLaunchItem(label = "PowerShell Here"): QuickLaunchItem {
  return {
    id: `quick-launch-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label,
    enabled: true,
    type: "command",
    command: "powershell.exe",
    arguments: "-NoExit -Command Set-Location -LiteralPath {currentPath}",
    openFiles: "",
    icon: "terminal",
    createdAt: Date.now()
  };
}

function cloneBatchRenameRule(rule: BatchRenameRule): BatchRenameRule {
  return { ...defaultBatchRenameRule, ...rule };
}

function createBatchRenamePreset(name: string, rule: BatchRenameRule): BatchRenamePreset {
  const now = Date.now();
  return {
    id: `rename-preset-${now}-${Math.random().toString(16).slice(2, 8)}`,
    name: name.trim() || "Rename Preset",
    rule: cloneBatchRenameRule(rule),
    createdAt: now,
    updatedAt: now
  };
}

function normalizeBatchRenamePresets(input: BatchRenamePreset[] | undefined): BatchRenamePreset[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input
    .filter((preset) => preset && typeof preset.id === "string" && typeof preset.name === "string" && !seen.has(preset.id))
    .map((preset) => {
      seen.add(preset.id);
      const updatedAt = typeof preset.updatedAt === "number" ? preset.updatedAt : preset.createdAt || Date.now();
      return {
        id: preset.id,
        name: preset.name.trim() || "Rename Preset",
        rule: cloneBatchRenameRule(preset.rule),
        createdAt: typeof preset.createdAt === "number" ? preset.createdAt : updatedAt,
        updatedAt
      };
    });
}

function createBatchRenameHistoryEntry(
  rule: BatchRenameRule,
  preview: BatchRenamePreview,
  message: string
): BatchRenameHistoryEntry {
  const now = Date.now();
  const changedItems = preview.items.filter((item) => item.status === "ready");
  return {
    id: `rename-history-${now}-${Math.random().toString(16).slice(2, 8)}`,
    performedAt: now,
    itemCount: preview.items.length,
    changedCount: changedItems.length,
    message,
    rule: cloneBatchRenameRule(rule),
    items: changedItems.map((item) => ({
      sourcePath: item.sourcePath,
      targetPath: item.targetPath,
      sourceName: item.sourceName,
      targetName: item.targetName
    }))
  };
}

function normalizeBatchRenameHistory(input: BatchRenameHistoryEntry[] | undefined): BatchRenameHistoryEntry[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input
    .filter((entry) => entry && typeof entry.id === "string" && !seen.has(entry.id))
    .map((entry) => {
      seen.add(entry.id);
      const items = Array.isArray(entry.items)
        ? entry.items
            .filter(
              (item) =>
                item &&
                typeof item.sourcePath === "string" &&
                typeof item.targetPath === "string" &&
                typeof item.sourceName === "string" &&
                typeof item.targetName === "string"
            )
            .map((item) => ({
              sourcePath: item.sourcePath,
              targetPath: item.targetPath,
              sourceName: item.sourceName,
              targetName: item.targetName
            }))
        : [];
      const changedCount = typeof entry.changedCount === "number" ? entry.changedCount : items.length;
      return {
        id: entry.id,
        performedAt: typeof entry.performedAt === "number" ? entry.performedAt : Date.now(),
        itemCount: typeof entry.itemCount === "number" ? entry.itemCount : Math.max(items.length, changedCount),
        changedCount,
        message: typeof entry.message === "string" ? entry.message : `Renamed ${changedCount} item(s).`,
        rule: cloneBatchRenameRule(entry.rule),
        items
      };
    })
    .sort((a, b) => b.performedAt - a.performedAt)
    .slice(0, maxBatchRenameHistory);
}

function createFolderSyncPreset(
  name: string,
  settings: {
    leftPath: string;
    rightPath: string;
    direction: FolderSyncDirection;
    includeHidden: boolean;
    filter: string;
  }
): FolderSyncPreset {
  const now = Date.now();
  return {
    id: `sync-preset-${now}-${Math.random().toString(16).slice(2, 8)}`,
    name: name.trim() || "Folder Sync Preset",
    leftPath: settings.leftPath,
    rightPath: settings.rightPath,
    direction: settings.direction,
    includeHidden: settings.includeHidden,
    filter: settings.filter,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeFolderSyncPresets(input: FolderSyncPreset[] | undefined): FolderSyncPreset[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input
    .filter(
      (preset) =>
        preset &&
        typeof preset.id === "string" &&
        typeof preset.name === "string" &&
        typeof preset.leftPath === "string" &&
        typeof preset.rightPath === "string" &&
        !seen.has(preset.id)
    )
    .map((preset) => {
      seen.add(preset.id);
      const direction: FolderSyncDirection =
        preset.direction === "updateLeft" || preset.direction === "updateBoth" ? preset.direction : "updateRight";
      const updatedAt = typeof preset.updatedAt === "number" ? preset.updatedAt : preset.createdAt || Date.now();
      return {
        id: preset.id,
        name: preset.name.trim() || "Folder Sync Preset",
        leftPath: preset.leftPath,
        rightPath: preset.rightPath,
        direction,
        includeHidden: !!preset.includeHidden,
        filter: typeof preset.filter === "string" ? preset.filter : "",
        createdAt: typeof preset.createdAt === "number" ? preset.createdAt : updatedAt,
        updatedAt
      };
    });
}

function normalizeActionIds(
  input: string[] | undefined,
  defaults: string[],
  catalog: ActionCatalogItem[],
  migrateMissingDefaults = false
): string[] {
  const validIds = new Set(catalog.map((item) => item.id));
  if (!input) return defaults;
  const seen = new Set<string>();
  const normalized = input.filter((id) => {
    if (!validIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (input.length === 0) return [];
  if (normalized.length === 0) return defaults;
  if (migrateMissingDefaults) {
    for (const id of defaults) {
      if (!seen.has(id) && validIds.has(id)) {
        normalized.push(id);
        seen.add(id);
      }
    }
  }
  return normalized;
}

function normalizeShortcut(value: string): string {
  const parts = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  const modifiers = new Set<string>();
  let key = "";
  for (const rawPart of parts) {
    const part = rawPart.toLowerCase();
    if (part === "ctrl" || part === "control") {
      modifiers.add("Ctrl");
    } else if (part === "alt" || part === "option") {
      modifiers.add("Alt");
    } else if (part === "shift") {
      modifiers.add("Shift");
    } else if (part === "meta" || part === "cmd" || part === "command" || part === "win" || part === "windows") {
      modifiers.add("Meta");
    } else {
      key = normalizeShortcutKey(rawPart);
    }
  }
  if (!key) return "";
  return [...["Ctrl", "Alt", "Shift", "Meta"].filter((modifier) => modifiers.has(modifier)), key].join("+");
}

function normalizeShortcutKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const aliases: Record<string, string> = {
    esc: "Escape",
    return: "Enter",
    del: "Delete",
    spacebar: "Space",
    space: "Space",
    pgup: "PageUp",
    pgdn: "PageDown",
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight"
  };
  if (aliases[lower]) return aliases[lower];
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^[a-z0-9]$/i.test(trimmed)) return trimmed.toUpperCase();
  return trimmed.length > 1 ? trimmed[0].toUpperCase() + trimmed.slice(1) : trimmed.toUpperCase();
}

function shortcutFromKeyboardEvent(event: React.KeyboardEvent): string {
  const key = normalizeShortcutKey(event.key);
  if (!key || ["Control", "Shift", "Alt", "Meta"].includes(key)) return "";
  return [
    event.ctrlKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
    event.metaKey ? "Meta" : "",
    key
  ]
    .filter(Boolean)
    .join("+");
}

function normalizeHotkeyBindings(input: HotkeyBinding[] | undefined, catalog: ActionCatalogItem[] = hotkeyActionCatalog): HotkeyBinding[] {
  if (!Array.isArray(input)) return [];
  const validIds = new Set(catalog.map((item) => item.id));
  const seen = new Set<string>();
  const normalized: HotkeyBinding[] = [];
  for (const binding of input) {
    if (!binding || !validIds.has(binding.actionId) || typeof binding.shortcut !== "string") continue;
    const shortcut = normalizeShortcut(binding.shortcut);
    if (!shortcut || seen.has(shortcut)) continue;
    seen.add(shortcut);
    normalized.push({ actionId: binding.actionId, shortcut });
  }
  return normalized;
}

function defaultPaneSnapshot(id: number, filePath: string): WorkspacePaneSnapshot {
  return {
    id,
    path: filePath,
    history: [filePath],
    historyIndex: 0,
    sortKey: "name",
    sortDirection: "asc",
    viewMode: "details"
  };
}

function normalizePaneSnapshot(
  snapshot: Partial<WorkspacePaneSnapshot> | undefined,
  id: number,
  bootstrap: BootstrapPayload
): WorkspacePaneSnapshot {
  const filePath = typeof snapshot?.path === "string" && snapshot.path.trim() ? snapshot.path : bootstrap.homePath;
  const historyCandidates = Array.isArray(snapshot?.history)
    ? snapshot.history.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const history = historyCandidates.length ? historyCandidates : [filePath];
  const rawHistoryIndex = Number.isInteger(snapshot?.historyIndex) ? Number(snapshot?.historyIndex) : history.length - 1;
  const historyIndex = Math.max(0, Math.min(rawHistoryIndex, history.length - 1));
  const sortKey = sortKeys.includes(snapshot?.sortKey as SortKey) ? (snapshot?.sortKey as SortKey) : "name";
  const sortDirection: SortDirection = snapshot?.sortDirection === "desc" ? "desc" : "asc";
  const viewMode: ViewMode = snapshot?.viewMode === "icons" ? "icons" : "details";
  return {
    id,
    path: filePath,
    history,
    historyIndex,
    sortKey,
    sortDirection,
    viewMode
  };
}

function hydratePane(snapshot: WorkspacePaneSnapshot): PaneState {
  return {
    ...snapshot,
    entries: [],
    selectedPaths: [],
    filter: "",
    recursiveSearch: false,
    addressDraft: snapshot.path,
    loading: true
  };
}

function snapshotFromPane(pane: PaneState): WorkspacePaneSnapshot {
  return {
    id: pane.id,
    path: pane.path,
    history: pane.history,
    historyIndex: pane.historyIndex,
    sortKey: pane.sortKey,
    sortDirection: pane.sortDirection,
    viewMode: pane.viewMode
  };
}

function getDefaultSnapshots(bootstrap: BootstrapPayload): WorkspacePaneSnapshot[] {
  const locationById = new Map(bootstrap.knownLocations.map((location) => [location.id, location.path]));
  const paths = [
    bootstrap.homePath,
    locationById.get("desktop") ?? bootstrap.homePath,
    locationById.get("downloads") ?? bootstrap.homePath,
    locationById.get("documents") ?? bootstrap.homePath
  ];
  return paths.map((filePath, index) => defaultPaneSnapshot(index + 1, filePath));
}

function createWorkspaceId(): string {
  return `workspace-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createWorkspaceRecord(name: string, snapshot: WorkspaceSnapshot, id = createWorkspaceId()): WorkspaceRecord {
  return {
    ...snapshot,
    id,
    name
  };
}

function createDefaultWorkspaceSnapshot(bootstrap: BootstrapPayload): WorkspaceSnapshot {
  return {
    layout: "grid",
    activePaneId: 1,
    panes: getDefaultSnapshots(bootstrap),
    bookmarks: [],
    stashItems: [],
    fileTemplates: [],
    colorRules: [],
    quickLaunchItems: [createQuickLaunchItem()],
    batchRenamePresets: [],
    batchRenameHistory: [],
    folderSyncPresets: [],
    toolbarActionIds: defaultToolbarActionIds,
    contextMenuActionIds: defaultContextMenuActionIds,
    hotkeyBindings: [],
    actionLayoutVersion: currentActionLayoutVersion,
    savedAt: Date.now()
  };
}

function normalizeWorkspaceRecord(record: WorkspaceRecord, bootstrap: BootstrapPayload): WorkspaceRecord {
  const migrateActionLayout = (record.actionLayoutVersion ?? 1) < currentActionLayoutVersion;
  const savedPanes = Array.isArray(record.panes) ? record.panes : [];
  const layout = layoutModes.includes(record.layout) ? record.layout : "grid";
  return {
    ...record,
    id: record.id || createWorkspaceId(),
    name: record.name || "Workspace",
    layout,
    activePaneId: paneIds.includes(record.activePaneId) ? record.activePaneId : 1,
    panes: paneIds.map((id) => normalizePaneSnapshot(savedPanes.find((pane) => pane?.id === id), id, bootstrap)),
    bookmarks: record.bookmarks ?? [],
    stashItems: record.stashItems ?? [],
    fileTemplates: record.fileTemplates ?? [],
    colorRules: record.colorRules ?? [],
    quickLaunchItems: record.quickLaunchItems ?? [createQuickLaunchItem()],
    batchRenamePresets: normalizeBatchRenamePresets(record.batchRenamePresets),
    batchRenameHistory: normalizeBatchRenameHistory(record.batchRenameHistory),
    folderSyncPresets: normalizeFolderSyncPresets(record.folderSyncPresets),
    hotkeyBindings: normalizeHotkeyBindings(record.hotkeyBindings),
    toolbarActionIds: normalizeActionIds(
      record.toolbarActionIds,
      defaultToolbarActionIds,
      toolbarActionCatalog,
      migrateActionLayout
    ),
    contextMenuActionIds: normalizeActionIds(
      record.contextMenuActionIds,
      defaultContextMenuActionIds,
      contextMenuActionCatalog,
      migrateActionLayout
    ),
    actionLayoutVersion: currentActionLayoutVersion,
    savedAt: record.savedAt ?? Date.now()
  };
}

function normalizeWorkspaceDocument(saved: WorkspaceDocument | null, bootstrap: BootstrapPayload): WorkspaceDocument {
  if (!saved || !Array.isArray(saved.workspaces) || saved.workspaces.length === 0) {
    const workspace = createWorkspaceRecord("Default", createDefaultWorkspaceSnapshot(bootstrap), "default");
    return {
      activeWorkspaceId: workspace.id,
      workspaces: [workspace],
      savedAt: Date.now()
    };
  }

  const workspaces = saved.workspaces.map((workspace) => normalizeWorkspaceRecord(workspace, bootstrap));
  const activeWorkspaceId = workspaces.some((workspace) => workspace.id === saved.activeWorkspaceId)
    ? saved.activeWorkspaceId
    : workspaces[0].id;
  return {
    activeWorkspaceId,
    workspaces,
    savedAt: saved.savedAt ?? Date.now()
  };
}

function sortEntries(entries: FileEntry[], sortKey: SortKey, direction: SortDirection): FileEntry[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    if (sortKey === "size") return (a.size - b.size) * factor;
    if (sortKey === "modifiedAt") return (a.modifiedAt - b.modifiedAt) * factor;
    const aValue = sortKey === "type" ? a.typeLabel : a.name;
    const bValue = sortKey === "type" ? b.typeLabel : b.name;
    return aValue.localeCompare(bValue, undefined, { sensitivity: "base", numeric: true }) * factor;
  });
}

function visibleEntries(pane: PaneState): FileEntry[] {
  const filtered =
    pane.filter.trim() && !pane.recursiveSearch
      ? pane.entries.filter((entry) => entry.name.toLowerCase().includes(pane.filter.trim().toLowerCase()))
      : pane.entries;
  return sortEntries(filtered, pane.sortKey, pane.sortDirection);
}

function retainExistingSelection(selectedPaths: string[], anchorPath: string | undefined, entries: FileEntry[]) {
  const entryPaths = new Set(entries.map((entry) => entry.path.toLowerCase()));
  const retainedSelection = selectedPaths.filter((selectedPath) => entryPaths.has(selectedPath.toLowerCase()));
  return {
    selectedPaths: retainedSelection,
    anchorPath: anchorPath && entryPaths.has(anchorPath.toLowerCase()) ? anchorPath : retainedSelection[0]
  };
}

function typeSelectionKey(entry: FileEntry): string {
  if (entry.isDirectory) return "directory";
  return `file:${entry.extension || entry.typeLabel || "file"}`.toLowerCase();
}

function isFormElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function joinDisplayPath(parent: string, child: string): string {
  const separator = parent.includes("\\") ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/, "")}${separator}${child}`;
}

export default function App() {
  const api = useMemo<SpaceApi>(() => getSpaceApi(), []);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [panes, setPanes] = useState<PaneState[]>([]);
  const [layout, setLayout] = useState<LayoutMode>("grid");
  const [activePaneId, setActivePaneId] = useState(1);
  const [bookmarks, setBookmarks] = useState<KnownLocation[]>([]);
  const [stashItems, setStashItems] = useState<StashShelfItem[]>([]);
  const [fileTemplates, setFileTemplates] = useState<NewFileTemplate[]>([]);
  const [colorRules, setColorRules] = useState<ColorRule[]>([]);
  const [quickLaunchItems, setQuickLaunchItems] = useState<QuickLaunchItem[]>([]);
  const [batchRenamePresets, setBatchRenamePresets] = useState<BatchRenamePreset[]>([]);
  const [batchRenameHistory, setBatchRenameHistory] = useState<BatchRenameHistoryEntry[]>([]);
  const [folderSyncPresets, setFolderSyncPresets] = useState<FolderSyncPreset[]>([]);
  const [toolbarActionIds, setToolbarActionIds] = useState<string[]>(defaultToolbarActionIds);
  const [contextMenuActionIds, setContextMenuActionIds] = useState<string[]>(defaultContextMenuActionIds);
  const [hotkeyBindings, setHotkeyBindings] = useState<HotkeyBinding[]>([]);
  const [addressSuggestions, setAddressSuggestions] = useState<Record<number, PathSuggestion[]>>({});
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [hashLine, setHashLine] = useState<string>("");
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [colorRulesOpen, setColorRulesOpen] = useState(false);
  const [quickLaunchMenuOpen, setQuickLaunchMenuOpen] = useState(false);
  const [quickLaunchEditorOpen, setQuickLaunchEditorOpen] = useState(false);
  const [actionSettingsOpen, setActionSettingsOpen] = useState(false);
  const [batchRenameOpen, setBatchRenameOpen] = useState(false);
  const [folderSyncOpen, setFolderSyncOpen] = useState(false);
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);
  const [hashCompareOpen, setHashCompareOpen] = useState(false);
  const [archiveBrowser, setArchiveBrowser] = useState<ArchiveBrowserState | null>(null);
  const toastCounter = useRef(0);
  const addressSuggestionCounters = useRef<Record<number, number>>({});
  const paneLoadCounters = useRef<Record<number, number>>({});

  const activePane = panes.find((pane) => pane.id === activePaneId) ?? panes[0];
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const selectedEntries = activePane
    ? activePane.entries.filter((entry) => containsPath(activePane.selectedPaths, entry.path))
    : [];
  const previewTarget = previewPath ?? selectedEntries[0]?.path;

  function paneById(paneId: number): PaneState | undefined {
    return panes.find((pane) => pane.id === paneId);
  }

  function selectedEntriesForPane(pane: PaneState | undefined): FileEntry[] {
    return pane ? pane.entries.filter((entry) => containsPath(pane.selectedPaths, entry.path)) : [];
  }

  function normalizedPathKey(filePath: string): string {
    return trimTrailingSeparator(filePath.trim()).replace(/[\\/]+/g, "\\").toLowerCase();
  }

  function paneIdsForPaths(paths: string[]): number[] {
    const pathKeys = new Set(paths.map(normalizedPathKey).filter(Boolean));
    return panes.filter((pane) => pathKeys.has(normalizedPathKey(pane.path))).map((pane) => pane.id);
  }

  function sameOrChildPath(candidate: string, parent: string): boolean {
    const normalizedCandidate = normalizedPathKey(candidate);
    const normalizedParent = normalizedPathKey(parent);
    return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}\\`);
  }

  function operationRefreshIds(baseIds: number[], paths: string[]): number[] {
    return [...new Set([...baseIds, ...paneIdsForPaths(paths)])];
  }

  function deletedPathRecoveryTargets(paths: string[]): Array<{ paneId: number; fallbackPath: string }> {
    return panes.flatMap((pane) => {
      const deletedRoot = paths
        .filter((path) => sameOrChildPath(pane.path, path))
        .sort((left, right) => right.length - left.length)[0];
      return deletedRoot ? [{ paneId: pane.id, fallbackPath: parentPath(deletedRoot) }] : [];
    });
  }

  function movedPathPairs(sources: string[], destination: string, affectedPaths: string[] | undefined): Array<{ sourcePath: string; targetPath: string }> {
    const movedSources = sources.filter((source) => normalizedPathKey(parentPath(source)) !== normalizedPathKey(destination));
    return movedSources.slice(0, affectedPaths?.length ?? 0).map((sourcePath, index) => ({
      sourcePath,
      targetPath: affectedPaths![index]
    }));
  }

  function replacePathRoot(candidate: string, sourceRoot: string, targetRoot: string): string {
    if (normalizedPathKey(candidate) === normalizedPathKey(sourceRoot)) return targetRoot;
    const source = trimTrailingSeparator(sourceRoot);
    const suffix = trimTrailingSeparator(candidate).slice(source.length).replace(/[\\/]+/g, "\\");
    return `${trimTrailingSeparator(targetRoot)}${suffix}`;
  }

  function movedPathRecoveryTargets(moves: Array<{ sourcePath: string; targetPath: string }>): Array<{ paneId: number; targetPath: string }> {
    return panes.flatMap((pane) => {
      const move = moves
        .filter((item) => sameOrChildPath(pane.path, item.sourcePath))
        .sort((left, right) => right.sourcePath.length - left.sourcePath.length)[0];
      return move ? [{ paneId: pane.id, targetPath: replacePathRoot(pane.path, move.sourcePath, move.targetPath) }] : [];
    });
  }

  async function recoverMovedPanes(sources: string[], destination: string, result: OperationResult | FileEntry | true): Promise<void> {
    if (result === true || !("affectedPaths" in result) || !result.affectedPaths?.length) return;
    const moves = movedPathPairs(sources, destination, result.affectedPaths);
    if (!moves.length) return;
    await Promise.all(movedPathRecoveryTargets(moves).map((target) => loadPane(target.paneId, target.targetPath, "replace", false)));
  }

  function nextPaneLoadRequest(paneId: number): number {
    const requestId = (paneLoadCounters.current[paneId] ?? 0) + 1;
    paneLoadCounters.current[paneId] = requestId;
    return requestId;
  }

  function isCurrentPaneLoadRequest(paneId: number, requestId: number): boolean {
    return paneLoadCounters.current[paneId] === requestId;
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setStartupError("");
      try {
        const bootPayload = await api.bootstrap();
        const workspaceDocument = normalizeWorkspaceDocument(await api.getWorkspace(), bootPayload);
        const workspace = workspaceDocument.workspaces.find((item) => item.id === workspaceDocument.activeWorkspaceId) ?? workspaceDocument.workspaces[0];
        const hydrated = workspace.panes.map(hydratePane);

        setBootstrap(bootPayload);
        setWorkspaces(workspaceDocument.workspaces);
        setActiveWorkspaceId(workspace.id);
        setLayout(workspace.layout);
        setActivePaneId(workspace.activePaneId);
        setBookmarks(workspace.bookmarks);
        setStashItems(workspace.stashItems ?? []);
        setFileTemplates(workspace.fileTemplates ?? []);
        setColorRules(workspace.colorRules ?? []);
        setQuickLaunchItems(workspace.quickLaunchItems ?? []);
        setBatchRenamePresets(workspace.batchRenamePresets ?? []);
        setBatchRenameHistory(workspace.batchRenameHistory ?? []);
        setFolderSyncPresets(workspace.folderSyncPresets ?? []);
        setToolbarActionIds(workspace.toolbarActionIds ?? defaultToolbarActionIds);
        setContextMenuActionIds(workspace.contextMenuActionIds ?? defaultContextMenuActionIds);
        setHotkeyBindings(workspace.hotkeyBindings ?? []);
        setPanes(hydrated);

        const loaded = await Promise.all(
          hydrated.map(async (pane) => {
            try {
              const payload = await api.listDirectory(pane.path);
              return {
                ...pane,
                path: payload.path,
                addressDraft: payload.path,
                entries: payload.entries,
                loading: false,
                scannedAt: payload.scannedAt
              };
            } catch (error) {
              return {
                ...pane,
                entries: [],
                error: getErrorMessage(error),
                loading: false
              };
            }
          })
        );

        if (!cancelled) {
          setPanes(loaded);
          setInitialized(true);
          setStartupError("");
        }
      } catch (error) {
        if (!cancelled) setStartupError(getErrorMessage(error));
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!initialized || panes.length !== 4 || !activeWorkspaceId || workspaces.length === 0) return;
    const timer = window.setTimeout(() => {
      const snapshot: WorkspaceSnapshot = {
        layout,
        activePaneId,
        panes: panes.map(snapshotFromPane),
        bookmarks,
        stashItems,
        fileTemplates,
        colorRules,
        quickLaunchItems,
        batchRenamePresets,
        batchRenameHistory,
        folderSyncPresets,
        toolbarActionIds,
        contextMenuActionIds,
        hotkeyBindings,
        actionLayoutVersion: currentActionLayoutVersion,
        savedAt: Date.now()
      };
      const workspaceDocument = createWorkspaceDocument(snapshot);
      if (workspaceDocument) void api.saveWorkspace(workspaceDocument);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activePaneId, activeWorkspaceId, api, batchRenameHistory, batchRenamePresets, bookmarks, colorRules, contextMenuActionIds, fileTemplates, folderSyncPresets, hotkeyBindings, initialized, layout, panes, quickLaunchItems, stashItems, toolbarActionIds, workspaces]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function closeContextMenu() {
      setContextMenu(null);
    }
    window.addEventListener("click", closeContextMenu);
    return () => window.removeEventListener("click", closeContextMenu);
  }, []);

  function showToast(kind: ToastState["kind"], message: string) {
    toastCounter.current += 1;
    setToast({ id: toastCounter.current, kind, message });
  }

  function updatePane(paneId: number, updater: (pane: PaneState) => PaneState) {
    setPanes((current) => current.map((pane) => (pane.id === paneId ? updater(pane) : pane)));
  }

  function updatePaneFilter(paneId: number, filter: string) {
    updatePane(paneId, (pane) => {
      const nextPane = { ...pane, filter };
      const retained = retainExistingSelection(pane.selectedPaths, pane.anchorPath, visibleEntries(nextPane));
      return { ...nextPane, ...retained };
    });
  }

  function updatePaneRecursiveSearch(paneId: number, recursiveSearch: boolean) {
    updatePane(paneId, (pane) => {
      const nextPane = { ...pane, recursiveSearch };
      const retained = retainExistingSelection(pane.selectedPaths, pane.anchorPath, visibleEntries(nextPane));
      return { ...nextPane, ...retained };
    });
  }

  function getCurrentWorkspaceSnapshot(): WorkspaceSnapshot {
    return {
      layout,
      activePaneId,
      panes: panes.map(snapshotFromPane),
      bookmarks,
      stashItems,
      fileTemplates,
      colorRules,
      quickLaunchItems,
      batchRenamePresets,
      batchRenameHistory,
      folderSyncPresets,
      toolbarActionIds,
      contextMenuActionIds,
      hotkeyBindings,
      actionLayoutVersion: currentActionLayoutVersion,
      savedAt: Date.now()
    };
  }

  function createWorkspaceDocument(snapshot: WorkspaceSnapshot, records = workspaces): WorkspaceDocument | null {
    if (!activeWorkspaceId || panes.length !== 4 || records.length === 0) return null;
    const savedAt = Date.now();
    const workspaceSnapshot = { ...snapshot, savedAt };
    return {
      activeWorkspaceId,
      workspaces: records.map((workspace) =>
        workspace.id === activeWorkspaceId ? { ...workspace, ...workspaceSnapshot } : workspace
      ),
      savedAt
    };
  }

  function persistCurrentWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
    const workspaceDocument = createWorkspaceDocument(snapshot);
    if (!workspaceDocument) return;
    setWorkspaces(workspaceDocument.workspaces);
    void api.saveWorkspace(workspaceDocument);
  }

  function saveBatchRenamePresets(nextPresets: BatchRenamePreset[]): void {
    setBatchRenamePresets(nextPresets);
    persistCurrentWorkspaceSnapshot({
      ...getCurrentWorkspaceSnapshot(),
      batchRenamePresets: nextPresets,
      savedAt: Date.now()
    });
  }

  function saveBatchRenameHistory(nextHistory: BatchRenameHistoryEntry[]): void {
    const normalizedHistory = normalizeBatchRenameHistory(nextHistory);
    setBatchRenameHistory(normalizedHistory);
    persistCurrentWorkspaceSnapshot({
      ...getCurrentWorkspaceSnapshot(),
      batchRenameHistory: normalizedHistory,
      savedAt: Date.now()
    });
  }

  function saveFolderSyncPresets(nextPresets: FolderSyncPreset[]): void {
    const normalizedPresets = normalizeFolderSyncPresets(nextPresets);
    setFolderSyncPresets(normalizedPresets);
    persistCurrentWorkspaceSnapshot({
      ...getCurrentWorkspaceSnapshot(),
      folderSyncPresets: normalizedPresets,
      savedAt: Date.now()
    });
  }

  function saveCurrentWorkspaceToList(records = workspaces): WorkspaceRecord[] {
    if (!activeWorkspaceId || panes.length !== 4) return records;
    const snapshot = getCurrentWorkspaceSnapshot();
    return records.map((workspace) => (workspace.id === activeWorkspaceId ? { ...workspace, ...snapshot } : workspace));
  }

  async function loadWorkspaceRecord(workspace: WorkspaceRecord) {
    setActiveWorkspaceId(workspace.id);
    setLayout(workspace.layout);
    setActivePaneId(workspace.activePaneId);
    setBookmarks(workspace.bookmarks);
    setStashItems(workspace.stashItems ?? []);
    setFileTemplates(workspace.fileTemplates ?? []);
    setColorRules(workspace.colorRules ?? []);
    setQuickLaunchItems(workspace.quickLaunchItems ?? []);
    setBatchRenamePresets(workspace.batchRenamePresets ?? []);
    setBatchRenameHistory(workspace.batchRenameHistory ?? []);
    setFolderSyncPresets(workspace.folderSyncPresets ?? []);
    setToolbarActionIds(workspace.toolbarActionIds ?? defaultToolbarActionIds);
    setContextMenuActionIds(workspace.contextMenuActionIds ?? defaultContextMenuActionIds);
    setHotkeyBindings(workspace.hotkeyBindings ?? []);
    setPreviewPath(null);
    setHashLine("");
    setClipboard(null);
    setContextMenu(null);
    setQuickLaunchMenuOpen(false);
    const hydrated = workspace.panes.map(hydratePane);
    setPanes(hydrated);

    const loaded = await Promise.all(
      hydrated.map(async (pane) => {
        try {
          const payload = await api.listDirectory(pane.path);
          return {
            ...pane,
            path: payload.path,
            addressDraft: payload.path,
            entries: payload.entries,
            loading: false,
            scannedAt: payload.scannedAt
          };
        } catch (error) {
          return {
            ...pane,
            entries: [],
            error: getErrorMessage(error),
            loading: false
          };
        }
      })
    );
    setPanes(loaded);
  }

  async function switchWorkspace(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) return;
    const nextWorkspaces = saveCurrentWorkspaceToList();
    const target = nextWorkspaces.find((workspace) => workspace.id === workspaceId);
    if (!target) return;
    setWorkspaces(nextWorkspaces);
    await loadWorkspaceRecord(target);
  }

  async function createNewWorkspace() {
    if (!bootstrap) return;
    const record = createWorkspaceRecord(`Workspace ${workspaces.length + 1}`, createDefaultWorkspaceSnapshot(bootstrap));
    setWorkspaces((current) => [...saveCurrentWorkspaceToList(current), record]);
    await loadWorkspaceRecord(record);
    showToast("success", "Workspace created.");
  }

  async function cloneWorkspace() {
    const sourceName = activeWorkspace?.name ?? "Workspace";
    const record = createWorkspaceRecord(`${sourceName} Copy`, getCurrentWorkspaceSnapshot());
    setWorkspaces((current) => [...saveCurrentWorkspaceToList(current), record]);
    await loadWorkspaceRecord(record);
    showToast("success", "Workspace cloned.");
  }

  function renameWorkspace() {
    if (!activeWorkspace) return;
    const name = window.prompt("Workspace name", activeWorkspace.name);
    if (!name?.trim()) return;
    setWorkspaces((current) =>
      current.map((workspace) => (workspace.id === activeWorkspace.id ? { ...workspace, name: name.trim() } : workspace))
    );
  }

  async function deleteWorkspace() {
    if (!activeWorkspace || workspaces.length <= 1) return;
    const ok = window.confirm(`Delete workspace "${activeWorkspace.name}"?`);
    if (!ok) return;
    const activeIndex = workspaces.findIndex((workspace) => workspace.id === activeWorkspace.id);
    const remaining = workspaces.filter((workspace) => workspace.id !== activeWorkspace.id);
    const next = remaining[Math.max(0, Math.min(activeIndex, remaining.length - 1))];
    setWorkspaces(remaining);
    await loadWorkspaceRecord(next);
    showToast("success", "Workspace deleted.");
  }

  async function loadPane(paneId: number, targetPath: string, mode: "push" | "replace" = "push", activate = true) {
    const requestId = nextPaneLoadRequest(paneId);
    if (activate) setActivePaneId(paneId);
    clearAddressSuggestions(paneId);
    updatePane(paneId, (pane) => ({ ...pane, loading: true, error: undefined, addressDraft: targetPath }));
    try {
      const payload = await api.listDirectory(targetPath);
      if (!isCurrentPaneLoadRequest(paneId, requestId)) return;
      updatePane(paneId, (pane) => {
        let history = pane.history;
        let historyIndex = pane.historyIndex;
        if (mode === "push") {
          history = [...pane.history.slice(0, pane.historyIndex + 1), payload.path];
          historyIndex = history.length - 1;
        } else {
          history = [...pane.history];
          history[historyIndex] = payload.path;
        }
        const retained = mode === "replace" ? retainExistingSelection(pane.selectedPaths, pane.anchorPath, payload.entries) : null;
        return {
          ...pane,
          path: payload.path,
          addressDraft: payload.path,
          entries: payload.entries,
          selectedPaths: retained?.selectedPaths ?? [],
          anchorPath: retained?.anchorPath,
          loading: false,
          error: undefined,
          history,
          historyIndex,
          scannedAt: payload.scannedAt
        };
      });
    } catch (error) {
      if (!isCurrentPaneLoadRequest(paneId, requestId)) return;
      updatePane(paneId, (pane) => ({ ...pane, loading: false, error: getErrorMessage(error) }));
      showToast("error", getErrorMessage(error));
    }
  }

  async function refreshPane(paneId = activePaneId, activate = true) {
    const pane = panes.find((item) => item.id === paneId);
    if (!pane) return;
    if (pane.recursiveSearch && pane.filter.trim()) {
      await runSearch(paneId);
    } else {
      await loadPane(paneId, pane.path, "replace", activate);
    }
  }

  async function runSearch(paneId: number) {
    const pane = panes.find((item) => item.id === paneId);
    if (!pane) return;
    if (!pane.filter.trim()) {
      await refreshPane(paneId);
      return;
    }
    const requestId = nextPaneLoadRequest(paneId);
    updatePane(paneId, (current) => ({ ...current, loading: true, error: undefined }));
    try {
      const entries = await api.searchFiles({
        rootPath: pane.path,
        query: pane.filter,
        recursive: pane.recursiveSearch,
        limit: 500
      });
      if (!isCurrentPaneLoadRequest(paneId, requestId)) return;
      updatePane(paneId, (current) => ({
        ...current,
        entries,
        selectedPaths: [],
        loading: false,
        scannedAt: Date.now()
      }));
    } catch (error) {
      if (!isCurrentPaneLoadRequest(paneId, requestId)) return;
      updatePane(paneId, (current) => ({ ...current, loading: false, error: getErrorMessage(error) }));
    }
  }

  function goHistory(paneId: number, direction: -1 | 1) {
    const pane = panes.find((item) => item.id === paneId);
    if (!pane) return;
    const nextIndex = pane.historyIndex + direction;
    const nextPath = pane.history[nextIndex];
    if (!nextPath) return;
    const requestId = nextPaneLoadRequest(paneId);
    setActivePaneId(paneId);
    clearAddressSuggestions(paneId);
    updatePane(paneId, (current) => ({ ...current, loading: true, error: undefined, addressDraft: nextPath }));
    api
      .listDirectory(nextPath)
      .then((payload) => {
        if (!isCurrentPaneLoadRequest(paneId, requestId)) return;
        updatePane(paneId, (current) => ({
          ...current,
          path: payload.path,
          addressDraft: payload.path,
          entries: payload.entries,
          selectedPaths: [],
          anchorPath: undefined,
          loading: false,
          error: undefined,
          history: current.history,
          historyIndex: nextIndex,
          scannedAt: payload.scannedAt
        }));
      })
      .catch((error: unknown) => {
        if (!isCurrentPaneLoadRequest(paneId, requestId)) return;
        updatePane(paneId, (current) => ({ ...current, loading: false, error: getErrorMessage(error) }));
        showToast("error", getErrorMessage(error));
      });
  }

  async function perform(
    label: string,
    action: () => Promise<OperationResult | unknown>,
    refreshIds: number[] = [activePaneId]
  ): Promise<OperationResult | FileEntry | true | null> {
    try {
      const result = await action();
      const message =
        typeof result === "object" && result && "message" in result
          ? String((result as OperationResult).message)
          : `${label} complete.`;
      showToast("success", message);
      await Promise.all([...new Set(refreshIds)].map((id) => refreshPane(id, false)));
      if (typeof result === "object" && result && "message" in result) return result as OperationResult;
      if (typeof result === "object" && result && "path" in result) return result as FileEntry;
      return true;
    } catch (error) {
      showToast("error", `${label} failed: ${getErrorMessage(error)}`);
      return null;
    }
  }

  function clearAddressSuggestions(paneId: number) {
    setAddressSuggestions((current) => {
      if (!current[paneId]?.length) return current;
      const next = { ...current };
      delete next[paneId];
      return next;
    });
  }

  async function updateAddressDraft(paneId: number, value: string) {
    updatePane(paneId, (pane) => ({ ...pane, addressDraft: value }));
    const requestId = (addressSuggestionCounters.current[paneId] ?? 0) + 1;
    addressSuggestionCounters.current[paneId] = requestId;
    if (value.trim().length < 2) {
      clearAddressSuggestions(paneId);
      return;
    }
    try {
      const suggestions = await api.suggestPaths({ input: value, limit: 8 });
      if (addressSuggestionCounters.current[paneId] !== requestId) return;
      setAddressSuggestions((current) => ({ ...current, [paneId]: suggestions }));
    } catch {
      if (addressSuggestionCounters.current[paneId] === requestId) clearAddressSuggestions(paneId);
    }
  }

  function selectEntry(paneId: number, entry: FileEntry, event: React.MouseEvent, entries: FileEntry[]) {
    setActivePaneId(paneId);
    setPreviewPath(null);
    setHashLine("");
    updatePane(paneId, (pane) => {
      let selectedPaths: string[];
      if (event.shiftKey && pane.anchorPath) {
        const anchorIndex = entries.findIndex((item) => item.path === pane.anchorPath);
        const entryIndex = entries.findIndex((item) => item.path === entry.path);
        if (anchorIndex >= 0 && entryIndex >= 0) {
          const [start, end] = [anchorIndex, entryIndex].sort((a, b) => a - b);
          selectedPaths = entries.slice(start, end + 1).map((item) => item.path);
        } else {
          selectedPaths = [entry.path];
        }
      } else if (event.ctrlKey || event.metaKey) {
        selectedPaths = containsPath(pane.selectedPaths, entry.path)
          ? pane.selectedPaths.filter((item) => item.toLowerCase() !== entry.path.toLowerCase())
          : [...pane.selectedPaths, entry.path];
      } else {
        selectedPaths = [entry.path];
      }
      return { ...pane, selectedPaths, anchorPath: entry.path };
    });
  }

  function selectAll(paneId = activePaneId) {
    updatePane(paneId, (pane) => ({ ...pane, selectedPaths: visibleEntries(pane).map((entry) => entry.path) }));
  }

  function selectPathIfVisible(paneId: number, targetPath: string) {
    updatePane(paneId, (pane) => {
      const entry = pane.entries.find((item) => item.path.toLowerCase() === targetPath.toLowerCase());
      return entry ? { ...pane, selectedPaths: [entry.path], anchorPath: entry.path } : pane;
    });
  }

  function openEntry(paneId: number, entry: FileEntry) {
    setPreviewPath(entry.path);
    if (entry.isDirectory) {
      void loadPane(paneId, entry.path);
    } else if (isSupportedArchiveEntry(entry)) {
      const pane = panes.find((item) => item.id === paneId);
      setArchiveBrowser({ archivePath: entry.path, destinationPath: pane?.path ?? entry.parentPath });
    } else {
      void perform("Open", () => api.openPath(entry.path), []);
    }
  }

  function copySelection(mode: ClipboardMode, paneId = activePaneId) {
    const pane = paneById(paneId);
    if (!pane?.selectedPaths.length) return;
    setClipboard({ mode, paths: [...pane.selectedPaths] });
    showToast("info", `${mode === "copy" ? "Copied" : "Cut"} ${pane.selectedPaths.length} item(s).`);
  }

  async function copySelectedPaths(paneId = activePaneId) {
    const pane = paneById(paneId);
    if (!pane?.selectedPaths.length) return;
    const paths = [...pane.selectedPaths];
    try {
      const result = await api.copyTextToClipboard(paths.join("\r\n"));
      if (!result.ok) throw new Error(result.message);
      showToast("success", `Copied ${paths.length} path(s).`);
    } catch (error) {
      showToast("error", `Copy paths failed: ${getErrorMessage(error)}`);
    }
  }

  function selectSameType(paneId = activePaneId) {
    const pane = paneById(paneId);
    const selected = selectedEntriesForPane(pane);
    if (!pane || selected.length === 0) return;
    const keys = new Set(selected.map(typeSelectionKey));
    const matches = visibleEntries(pane).filter((entry) => keys.has(typeSelectionKey(entry)));
    updatePane(pane.id, (current) => ({
      ...current,
      selectedPaths: matches.map((entry) => entry.path),
      anchorPath: matches[0]?.path ?? current.anchorPath
    }));
    showToast("info", `Selected ${matches.length} same type item(s).`);
  }

  async function pasteInto(paneId = activePaneId) {
    const pane = panes.find((item) => item.id === paneId);
    if (!pane || !clipboard?.paths.length) return;
    const sources = [...clipboard.paths];
    const destination = pane.path;
    const operation = clipboard.mode === "copy" ? api.copyItems : api.moveItems;
    const result = await perform(
      clipboard.mode === "copy" ? "Paste copy" : "Paste move",
      () => operation({ sources, destination }),
      paneIds
    );
    if (result && clipboard.mode === "cut") {
      setClipboard(null);
      await recoverMovedPanes(sources, destination, result);
    }
  }

  async function sendSelectionToPane(sourcePaneId: number, targetPaneId: number, mode: ClipboardMode) {
    const sourcePane = paneById(sourcePaneId);
    if (!sourcePane || !sourcePane.selectedPaths.length || targetPaneId === sourcePane.id) return;
    const targetPane = panes.find((pane) => pane.id === targetPaneId);
    if (!targetPane) return;
    const sources = [...sourcePane.selectedPaths];
    const destination = targetPane.path;
    const refreshIds = operationRefreshIds([sourcePane.id, targetPaneId], [destination, ...sources.map(parentPath)]);
    setActivePaneId(sourcePane.id);
    const result = await perform(
      mode === "copy" ? "Copy to pane" : "Move to pane",
      () =>
        mode === "copy"
          ? api.copyItems({ sources, destination })
          : api.moveItems({ sources, destination }),
      refreshIds
    );
    if (result && mode === "cut") await recoverMovedPanes(sources, destination, result);
  }

  async function createItem(kind: "file" | "folder") {
    if (!activePane) return;
    const parentPath = activePane.path;
    const refreshIds = operationRefreshIds([activePane.id], [parentPath]);
    const fallback = kind === "folder" ? "New Folder" : "New File.txt";
    const name = window.prompt(kind === "folder" ? "Folder name" : "File name", fallback);
    if (!name) return;
    await perform(
      kind === "folder" ? "Create folder" : "Create file",
      () =>
        kind === "folder"
          ? api.createFolder({ parentPath, name })
          : api.createFile({ parentPath, name }),
      refreshIds
    );
  }

  async function createTemplatedFile(request: { name: string; content: string; saveTemplateName?: string }) {
    if (!activePane) return;
    const parentPath = activePane.path;
    const refreshIds = operationRefreshIds([activePane.id], [parentPath]);
    try {
      const result = await api.createFile({ parentPath, name: request.name, content: request.content });
      showToast("success", `Created ${result.name}.`);
      await Promise.all(refreshIds.map((id) => refreshPane(id, false)));
      const savedTemplateName = request.saveTemplateName?.trim();
      if (savedTemplateName) {
        setFileTemplates((current) => [
          ...current,
          {
            id: `template-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            label: savedTemplateName,
            fileName: request.name,
            content: request.content,
            createdAt: Date.now()
          }
        ]);
        showToast("success", "Template saved.");
      }
      setNewFileOpen(false);
    } catch (error) {
      showToast("error", `Create file failed: ${getErrorMessage(error)}`);
    }
  }

  async function renameSelected(paneId = activePaneId) {
    const pane = paneById(paneId);
    if (!pane || pane.selectedPaths.length !== 1) return;
    const sourcePath = pane.selectedPaths[0];
    const refreshIds = operationRefreshIds([pane.id], [parentPath(sourcePath)]);
    const name = window.prompt("Rename", pathName(sourcePath));
    if (!name) return;
    const result = await perform("Rename", () => api.renameItem({ path: sourcePath, newName: name }), refreshIds);
    if (result && result !== true && "path" in result) {
      selectPathIfVisible(pane.id, result.path);
      await Promise.all(movedPathRecoveryTargets([{ sourcePath, targetPath: result.path }]).map((target) => loadPane(target.paneId, target.targetPath, "replace", false)));
    }
  }

  async function deleteSelected(paneId = activePaneId) {
    const pane = paneById(paneId);
    if (!pane?.selectedPaths.length) return;
    const selectedPaths = [...pane.selectedPaths];
    const recoveryTargets = deletedPathRecoveryTargets(selectedPaths);
    const recoveryPaneIds = new Set(recoveryTargets.map((target) => target.paneId));
    const refreshIds = operationRefreshIds([pane.id], selectedPaths.map(parentPath)).filter((id) => !recoveryPaneIds.has(id));
    const ok = window.confirm(`Delete ${selectedPaths.length} selected item(s)?`);
    if (!ok) return;
    const succeeded = await perform("Delete", () => api.deleteItems({ paths: selectedPaths }), refreshIds);
    if (succeeded) {
      await Promise.all(recoveryTargets.map((target) => loadPane(target.paneId, target.fallbackPath, "replace", false)));
    }
  }

  async function calculateSelectedHash(algorithm: HashAlgorithm = "sha256", paneId = activePaneId) {
    const pane = paneById(paneId);
    if (!pane || pane.selectedPaths.length !== 1) return;
    try {
      const result = await api.calculateHash({ path: pane.selectedPaths[0], algorithm });
      setHashLine(`${algorithm.toUpperCase()} ${pathName(result.path)}: ${result.value}`);
      showToast("success", "Hash calculated.");
    } catch (error) {
      showToast("error", `Hash failed: ${getErrorMessage(error)}`);
    }
  }

  async function applyBatchRename(rule: BatchRenameRule) {
    if (!activePane?.selectedPaths.length) return;
    const paneId = activePane.id;
    const paths = [...activePane.selectedPaths];
    const refreshIds = operationRefreshIds([paneId], paths.map(parentPath));
    try {
      const preview = await api.previewBatchRename({ paths, rule });
      const result = await api.applyBatchRename({ paths, rule });
      const message = result.message ?? "Batch rename complete.";
      saveBatchRenameHistory([createBatchRenameHistoryEntry(rule, preview, message), ...batchRenameHistory]);
      showToast("success", message);
      await Promise.all(refreshIds.map((id) => refreshPane(id, false)));
      setBatchRenameOpen(false);
    } catch (error) {
      showToast("error", `Batch rename failed: ${getErrorMessage(error)}`);
    }
  }

  async function applyFolderSync(request: {
    leftPath: string;
    rightPath: string;
    refreshPaneIds: number[];
    direction: FolderSyncDirection;
    includeHidden: boolean;
    filter: string;
  }) {
    if (!request.leftPath || !request.rightPath || request.leftPath.toLowerCase() === request.rightPath.toLowerCase()) return;
    await perform(
      "Folder sync",
      () =>
        api.applyFolderSync({
          leftPath: request.leftPath,
          rightPath: request.rightPath,
          direction: request.direction,
          includeHidden: request.includeHidden,
          filter: request.filter
        }),
      request.refreshPaneIds.length > 0 ? request.refreshPaneIds : [activePaneId]
    );
    setFolderSyncOpen(false);
  }

  async function createArchiveFromSelection() {
    if (!activePane?.selectedPaths.length) return;
    const defaultPath = joinDisplayPath(activePane.path, "Archive.zip");
    const destinationZipPath = window.prompt("Archive path", defaultPath);
    if (!destinationZipPath) return;
    await perform(
      "Create archive",
      () =>
        api.createArchive({
          sources: activePane.selectedPaths,
          destinationZipPath,
          includeRootFolder: true
        }),
      [activePane.id]
    );
  }

  async function runQuickLaunchItem(item: QuickLaunchItem) {
    if (!activePane) return;
    const entryByPath = new Map(activePane.entries.map((entry) => [entry.path.toLowerCase(), entry]));
    const selectedFilePaths = activePane.selectedPaths.filter((targetPath) => entryByPath.get(targetPath.toLowerCase())?.isFile);
    const selectedFolderPaths = activePane.selectedPaths.filter((targetPath) => entryByPath.get(targetPath.toLowerCase())?.isDirectory);
    try {
      const result = await api.runQuickLaunch({
        item,
        currentPath: activePane.path,
        selectedPaths: activePane.selectedPaths,
        selectedFilePaths,
        selectedFolderPaths
      });
      showToast("success", result.message);
      setQuickLaunchMenuOpen(false);
    } catch (error) {
      showToast("error", `Quick Launch failed: ${getErrorMessage(error)}`);
    }
  }

  function addSelectionToShelf(paneId = activePaneId) {
    const pane = paneById(paneId);
    if (!pane?.selectedPaths.length) return;
    const entryByPath = new Map(pane.entries.map((entry) => [entry.path.toLowerCase(), entry]));
    const additions = pane.selectedPaths.map((sourcePath) => {
      const entry = entryByPath.get(sourcePath.toLowerCase());
      return {
        path: sourcePath,
        label: entry?.name ?? pathName(sourcePath),
        isDirectory: entry?.isDirectory ?? false,
        size: entry?.size ?? 0,
        addedAt: Date.now()
      };
    });

    const seen = new Set(stashItems.map((item) => item.path.toLowerCase()));
    const uniqueAdditions = additions.filter((item) => {
      const key = item.path.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (uniqueAdditions.length) setStashItems((current) => [...current, ...uniqueAdditions]);
    showToast(
      uniqueAdditions.length ? "success" : "info",
      uniqueAdditions.length ? `Added ${uniqueAdditions.length} item(s) to shelf.` : "Selection is already on the shelf."
    );
  }

  function addFileEntryToShelf(entry: FileEntry) {
    const key = entry.path.toLowerCase();
    if (stashItems.some((item) => item.path.toLowerCase() === key)) {
      showToast("info", "Item is already on the shelf.");
      return;
    }
    setStashItems((current) => [
      ...current,
      {
        path: entry.path,
        label: entry.name,
        isDirectory: entry.isDirectory,
        size: entry.size,
        addedAt: Date.now()
      }
    ]);
    showToast("success", "Added 1 item(s) to shelf.");
  }

  async function openWorkspaceSearchResult(entry: FileEntry) {
    if (!activePane) return;
    setWorkspaceSearchOpen(false);
    setPreviewPath(entry.path);
    setHashLine("");
    if (entry.isDirectory) {
      await loadPane(activePane.id, entry.path);
      return;
    }
    await loadPane(activePane.id, entry.parentPath);
    updatePane(activePane.id, (pane) => ({ ...pane, selectedPaths: [entry.path], anchorPath: entry.path }));
  }

  async function transferShelf(mode: ClipboardMode) {
    if (!activePane || stashItems.length === 0) return;
    try {
      const sources = stashItems.map((item) => item.path);
      const destination = activePane.path;
      const result =
        mode === "copy"
          ? await api.copyItems({ sources, destination })
          : await api.moveItems({ sources, destination });
      showToast("success", result.message);
      if (mode === "cut") setStashItems([]);
      await Promise.all((mode === "cut" ? paneIds : [activePane.id]).map((id) => refreshPane(id, false)));
      if (mode === "cut") await recoverMovedPanes(sources, destination, result);
    } catch (error) {
      showToast("error", `Shelf ${mode === "copy" ? "copy" : "move"} failed: ${getErrorMessage(error)}`);
    }
  }

  async function hashShelf() {
    const files = stashItems.filter((item) => !item.isDirectory).slice(0, 12);
    if (files.length === 0) {
      showToast("info", "Shelf has no files to hash.");
      return;
    }
    const lines: string[] = [];
    for (const item of files) {
      try {
        const result = await api.calculateHash({ path: item.path, algorithm: "sha256" });
        lines.push(`${item.label}: ${result.value}`);
      } catch (error) {
        lines.push(`${item.label}: ${getErrorMessage(error)}`);
      }
    }
    setHashLine(`Shelf SHA-256\n${lines.join("\n")}`);
    showToast("success", `Hashed ${files.length} shelf file(s).`);
  }

  function addBookmark() {
    if (!activePane) return;
    const exists = bookmarks.some((bookmark) => bookmark.path.toLowerCase() === activePane.path.toLowerCase());
    if (exists) return;
    setBookmarks((current) => [
      ...current,
      { id: `bookmark-${Date.now()}`, label: pathName(activePane.path), path: activePane.path, icon: "star" }
    ]);
    showToast("success", "Bookmark added.");
  }

  function handleDrop(event: React.DragEvent, targetPaneId: number) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/x-space-paths");
    if (!raw) return;
    const targetPane = panes.find((pane) => pane.id === targetPaneId);
    if (!targetPane) return;
    let sources: string[];
    try {
      sources = JSON.parse(raw) as string[];
    } catch {
      showToast("error", "Drop payload was not recognized.");
      return;
    }
    if (!sources.length) return;
    const mode: ClipboardMode = event.shiftKey ? "cut" : "copy";
    void perform(
      mode === "copy" ? "Drop copy" : "Drop move",
      () =>
        mode === "copy"
          ? api.copyItems({ sources, destination: targetPane.path })
          : api.moveItems({ sources, destination: targetPane.path }),
      paneIds
    ).then((result) => {
      if (result && mode === "cut") void recoverMovedPanes(sources, targetPane.path, result);
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      event.preventDefault();
      const currentIndex = paneIds.indexOf(activePaneId);
      const nextIndex = event.shiftKey
        ? (currentIndex + paneIds.length - 1) % paneIds.length
        : (currentIndex + 1) % paneIds.length;
      setActivePaneId(paneIds[nextIndex]);
      return;
    }

    if (isFormElement(event.target)) return;

    const customActionId = hotkeyBindings.find((binding) => binding.shortcut === shortcutFromKeyboardEvent(event))?.actionId;
    if (customActionId && triggerToolbarAction(customActionId)) {
      event.preventDefault();
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAll();
    } else if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void copySelectedPaths();
    } else if (event.ctrlKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      copySelection("copy");
    } else if (event.ctrlKey && event.key.toLowerCase() === "x") {
      event.preventDefault();
      copySelection("cut");
    } else if (event.ctrlKey && event.key.toLowerCase() === "v") {
      event.preventDefault();
      void pasteInto();
    } else if (event.ctrlKey && event.key.toLowerCase() === "r") {
      event.preventDefault();
      void refreshPane();
    } else if (event.altKey && event.key === "ArrowUp") {
      event.preventDefault();
      if (activePane) void loadPane(activePane.id, parentPath(activePane.path));
    } else if (event.key === "Delete") {
      event.preventDefault();
      void deleteSelected();
    } else if (event.key === "F2") {
      event.preventDefault();
      void renameSelected();
    } else if (event.key === "Enter" && selectedEntries[0]) {
      event.preventDefault();
      openEntry(activePaneId, selectedEntries[0]);
    }
  }

  const toolbarActions: Record<string, { title: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; active?: boolean }> = {
    newFolder: { title: "New folder", icon: FolderPlus, onClick: () => void createItem("folder") },
    newFile: { title: "New file", icon: FilePlus2, onClick: () => setNewFileOpen(true) },
    copy: { title: "Copy", icon: Copy, onClick: () => copySelection("copy"), disabled: !activePane?.selectedPaths.length },
    copyPaths: { title: "Copy paths", icon: ClipboardCopy, onClick: () => void copySelectedPaths(), disabled: !activePane?.selectedPaths.length },
    cut: { title: "Cut", icon: Scissors, onClick: () => copySelection("cut"), disabled: !activePane?.selectedPaths.length },
    paste: { title: "Paste", icon: FileText, onClick: () => void pasteInto(), disabled: !clipboard?.paths.length },
    selectSameType: { title: "Select same type", icon: ListFilter, onClick: selectSameType, disabled: selectedEntries.length === 0 },
    delete: { title: "Delete", icon: Trash2, onClick: () => void deleteSelected(), disabled: !activePane?.selectedPaths.length },
    createZip: { title: "Create ZIP archive", icon: Archive, onClick: () => void createArchiveFromSelection(), disabled: !activePane?.selectedPaths.length },
    batchRename: { title: "Batch rename", icon: FileText, onClick: () => setBatchRenameOpen(true), disabled: !activePane?.selectedPaths.length },
    folderSync: { title: "Folder sync", icon: RefreshCcw, onClick: () => setFolderSyncOpen(true), disabled: !activePane },
    addShelf: { title: "Add selection to shelf", icon: Plus, onClick: addSelectionToShelf, disabled: !activePane?.selectedPaths.length },
    hashCompare: {
      title: "Hash compare",
      icon: HashIcon,
      onClick: () => setHashCompareOpen(true),
      disabled: !selectedEntries.some((entry) => entry.isFile),
      active: hashCompareOpen
    },
    colorRules: { title: "Color rules", icon: Palette, onClick: () => setColorRulesOpen(true), active: colorRules.some((rule) => rule.enabled) },
    quickLaunch: {
      title: "Quick launch",
      icon: Rocket,
      onClick: () => setQuickLaunchMenuOpen((open) => !open),
      active: quickLaunchMenuOpen,
      disabled: !activePane
    },
    workspaceSearch: {
      title: "Workspace search",
      icon: Search,
      onClick: () => setWorkspaceSearchOpen(true),
      active: workspaceSearchOpen,
      disabled: panes.length === 0
    },
    refresh: { title: "Refresh", icon: RefreshCcw, onClick: () => void refreshPane() },
    terminal: { title: "Open terminal", icon: Terminal, onClick: () => activePane && void perform("Terminal", () => api.openTerminal(activePane.path), []) },
    bookmark: { title: "Add bookmark", icon: Star, onClick: addBookmark }
  };

  function triggerToolbarAction(actionId: string): boolean {
    const triggerActions: Record<string, { onClick: () => void; disabled?: boolean }> = {
      ...toolbarActions,
      rename: { onClick: () => void renameSelected(), disabled: !activePane || activePane.selectedPaths.length !== 1 },
      hash: { onClick: () => void calculateSelectedHash("sha256"), disabled: !activePane || activePane.selectedPaths.length !== 1 },
      reveal: {
        onClick: () => activePane?.selectedPaths[0] && void perform("Reveal", () => api.revealPath(activePane.selectedPaths[0]), []),
        disabled: !activePane?.selectedPaths.length
      }
    };
    const action = triggerActions[actionId];
    if (!action || action.disabled) return false;
    action.onClick();
    return true;
  }

  if (startupError && (!bootstrap || panes.length !== 4)) {
    return (
      <main className="loading-screen startup-error" role="alert">
        <LayoutGrid size={42} />
        <strong>Space could not start</strong>
        <span>{startupError}</span>
        <button type="button" onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    );
  }

  if (!bootstrap || panes.length !== 4) {
    return (
      <main className="loading-screen">
        <LayoutGrid size={42} />
        <span>Loading Space...</span>
      </main>
    );
  }

  return (
    <main className="app-shell" onKeyDown={handleKeyDown} tabIndex={-1}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Grid2X2 size={20} />
          </div>
          <div>
            <h1>Space</h1>
            <span>Four-pane file manager</span>
          </div>
        </div>

        <div className="toolbar" role="toolbar" aria-label="File operations">
          {toolbarActionIds.map((actionId) => {
            const action = toolbarActions[actionId];
            if (!action) return null;
            return (
              <IconButton
                key={actionId}
                title={action.title}
                onClick={action.onClick}
                icon={action.icon}
                disabled={action.disabled}
                active={action.active}
              />
            );
          })}
        </div>

        <div className="layout-switcher" aria-label="Layout">
          <IconButton title="Customize actions" onClick={() => setActionSettingsOpen(true)} icon={SlidersHorizontal} />
          <IconButton title="Grid layout" onClick={() => setLayout("grid")} icon={Grid2X2} active={layout === "grid"} />
          <IconButton title="Columns layout" onClick={() => setLayout("columns")} icon={Columns3} active={layout === "columns"} />
          <IconButton title="Rows layout" onClick={() => setLayout("rows")} icon={Rows3} active={layout === "rows"} />
          <IconButton title="Focus active pane" onClick={() => setLayout("focus")} icon={PanelRight} active={layout === "focus"} />
        </div>
      </header>

      {quickLaunchMenuOpen && activePane && (
        <QuickLaunchPanel
          items={quickLaunchItems}
          currentPath={activePane.path}
          selectedCount={activePane.selectedPaths.length}
          onRun={(item) => void runQuickLaunchItem(item)}
          onManage={() => {
            setQuickLaunchMenuOpen(false);
            setQuickLaunchEditorOpen(true);
          }}
        />
      )}

      <WorkspaceTabs
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSwitch={(workspaceId) => void switchWorkspace(workspaceId)}
        onNew={() => void createNewWorkspace()}
        onClone={() => void cloneWorkspace()}
        onRename={renameWorkspace}
        onDelete={() => void deleteWorkspace()}
      />

      <section className="workspace">
        <Sidebar
          bootstrap={bootstrap}
          bookmarks={bookmarks}
          stashItems={stashItems}
          canAddSelection={!!activePane?.selectedPaths.length}
          onOpen={(targetPath) => activePane && void loadPane(activePane.id, targetPath)}
          onRemoveBookmark={(id) => setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id))}
          onAddSelectionToShelf={addSelectionToShelf}
          onPreviewShelfItem={(targetPath) => {
            setPreviewPath(targetPath);
            setHashLine("");
          }}
          onRemoveShelfItem={(targetPath) =>
            setStashItems((current) => current.filter((item) => item.path.toLowerCase() !== targetPath.toLowerCase()))
          }
          onClearShelf={() => setStashItems([])}
          onCopyShelf={() => void transferShelf("copy")}
          onMoveShelf={() => void transferShelf("cut")}
          onHashShelf={() => void hashShelf()}
        />

        <section className={`pane-area layout-${layout}`} aria-label="Explorer panes">
          {panes.map((pane) => (
            <ExplorerPane
              key={pane.id}
              pane={pane}
              entries={visibleEntries(pane)}
              colorRules={colorRules}
              addressSuggestions={addressSuggestions[pane.id] ?? []}
              active={pane.id === activePaneId}
              onActivate={() => setActivePaneId(pane.id)}
              onNavigate={(targetPath) => void loadPane(pane.id, targetPath)}
              onBack={() => goHistory(pane.id, -1)}
              onForward={() => goHistory(pane.id, 1)}
              onUp={() => void loadPane(pane.id, parentPath(pane.path))}
              onRefresh={() => void refreshPane(pane.id)}
              onAddressChange={(value) => void updateAddressDraft(pane.id, value)}
              onAddressSubmit={() => {
                clearAddressSuggestions(pane.id);
                void loadPane(pane.id, pane.addressDraft);
              }}
              onFilterChange={(value) => updatePaneFilter(pane.id, value)}
              onRecursiveChange={(value) => updatePaneRecursiveSearch(pane.id, value)}
              onSearch={() => void runSearch(pane.id)}
              onSort={(sortKey) =>
                updatePane(pane.id, (current) => ({
                  ...current,
                  sortKey,
                  sortDirection:
                    current.sortKey === sortKey && current.sortDirection === "asc" ? "desc" : "asc"
                }))
              }
              onViewMode={(viewMode) => updatePane(pane.id, (current) => ({ ...current, viewMode }))}
              onSelect={(entry, event, entries) => selectEntry(pane.id, entry, event, entries)}
              onOpen={(entry) => openEntry(pane.id, entry)}
              onContextMenu={(event, entry) => {
                event.preventDefault();
                if (entry && !containsPath(pane.selectedPaths, entry.path)) {
                  selectEntry(pane.id, entry, event, visibleEntries(pane));
                }
                setContextMenu({ x: event.clientX, y: event.clientY, paneId: pane.id, path: entry?.path });
              }}
              onDrop={(event) => handleDrop(event, pane.id)}
              onDragStart={(event, entry) => {
                const payload = containsPath(pane.selectedPaths, entry.path) ? pane.selectedPaths : [entry.path];
                event.dataTransfer.setData("application/x-space-paths", JSON.stringify(payload));
              }}
              onCopyTo={(targetId) => void sendSelectionToPane(pane.id, targetId, "copy")}
              onMoveTo={(targetId) => void sendSelectionToPane(pane.id, targetId, "cut")}
            />
          ))}
        </section>

        <Inspector
          targetPath={previewTarget ?? null}
          api={api}
          hashLine={hashLine}
          onHash={() => void calculateSelectedHash("sha256")}
          onReveal={() => previewTarget && void perform("Reveal", () => api.revealPath(previewTarget), [])}
        />
      </section>

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          actionIds={contextMenuActionIds}
          onCopy={() => copySelection("copy", contextMenu.paneId)}
          onCopyPaths={() => void copySelectedPaths(contextMenu.paneId)}
          onSelectSameType={() => selectSameType(contextMenu.paneId)}
          onCut={() => copySelection("cut", contextMenu.paneId)}
          onPaste={() => void pasteInto(contextMenu.paneId)}
          onRename={() => void renameSelected(contextMenu.paneId)}
          onDelete={() => void deleteSelected(contextMenu.paneId)}
          onHash={() => void calculateSelectedHash("sha256", contextMenu.paneId)}
          onAddToShelf={() => addSelectionToShelf(contextMenu.paneId)}
          onReveal={() => {
            const pane = paneById(contextMenu.paneId);
            if (pane?.selectedPaths[0]) void perform("Reveal", () => api.revealPath(pane.selectedPaths[0]), []);
          }}
          onOpenTerminal={() => {
            const pane = panes.find((item) => item.id === contextMenu.paneId);
            if (pane) void perform("Terminal", () => api.openTerminal(pane.path), []);
          }}
          onQuickLaunch={() => {
            setActivePaneId(contextMenu.paneId);
            setContextMenu(null);
            setQuickLaunchMenuOpen(true);
          }}
          canPaste={!!clipboard?.paths.length}
          canAct={!!paneById(contextMenu.paneId)?.selectedPaths.length}
          canSelectSameType={selectedEntriesForPane(paneById(contextMenu.paneId)).length > 0}
        />
      )}

      {newFileOpen && activePane && (
        <NewFileModal
          templates={[...defaultFileTemplates, ...fileTemplates]}
          destinationPath={activePane.path}
          onClose={() => setNewFileOpen(false)}
          onCreate={(request) => void createTemplatedFile(request)}
          onDeleteTemplate={(templateId) => setFileTemplates((current) => current.filter((template) => template.id !== templateId))}
        />
      )}

      {colorRulesOpen && (
        <ColorRulesModal
          rules={colorRules}
          onClose={() => setColorRulesOpen(false)}
          onSave={(rules) => {
            setColorRules(rules);
            setColorRulesOpen(false);
            showToast("success", "Color rules saved.");
          }}
        />
      )}

      {quickLaunchEditorOpen && (
        <QuickLaunchModal
          items={quickLaunchItems}
          onClose={() => setQuickLaunchEditorOpen(false)}
          onSave={(items) => {
            setQuickLaunchItems(items);
            setQuickLaunchEditorOpen(false);
            showToast("success", "Quick Launch items saved.");
          }}
        />
      )}

      {actionSettingsOpen && (
        <ActionSettingsModal
          toolbarIds={toolbarActionIds}
          contextMenuIds={contextMenuActionIds}
          hotkeyBindings={hotkeyBindings}
          onClose={() => setActionSettingsOpen(false)}
          onSave={(nextToolbarIds, nextContextMenuIds, nextHotkeyBindings) => {
            const nextSnapshot: WorkspaceSnapshot = {
              ...getCurrentWorkspaceSnapshot(),
              toolbarActionIds: nextToolbarIds,
              contextMenuActionIds: nextContextMenuIds,
              hotkeyBindings: nextHotkeyBindings,
              savedAt: Date.now()
            };
            setToolbarActionIds(nextToolbarIds);
            setContextMenuActionIds(nextContextMenuIds);
            setHotkeyBindings(nextHotkeyBindings);
            persistCurrentWorkspaceSnapshot(nextSnapshot);
            setActionSettingsOpen(false);
            showToast("success", "Action settings saved.");
          }}
        />
      )}

      {batchRenameOpen && activePane && (
        <BatchRenameModal
          api={api}
          paths={activePane.selectedPaths}
          presets={batchRenamePresets}
          history={batchRenameHistory}
          onSavePresets={saveBatchRenamePresets}
          onClearHistory={() => saveBatchRenameHistory([])}
          onClose={() => setBatchRenameOpen(false)}
          onApply={(rule) => void applyBatchRename(rule)}
        />
      )}

      {folderSyncOpen && activePane && (
        <FolderSyncModal
          api={api}
          panes={panes}
          activePaneId={activePane.id}
          presets={folderSyncPresets}
          onSavePresets={saveFolderSyncPresets}
          onClose={() => setFolderSyncOpen(false)}
          onApply={(request) => void applyFolderSync(request)}
        />
      )}

      {workspaceSearchOpen && (
        <WorkspaceSearchModal
          api={api}
          panes={panes}
          activePaneId={activePaneId}
          onClose={() => setWorkspaceSearchOpen(false)}
          onOpen={(entry) => void openWorkspaceSearchResult(entry)}
          onReveal={(entry) => void perform("Reveal", () => api.revealPath(entry.path), [])}
          onAddToShelf={addFileEntryToShelf}
        />
      )}

      {hashCompareOpen && (
        <HashCompareModal
          api={api}
          entries={selectedEntries.filter((entry) => entry.isFile)}
          onClose={() => setHashCompareOpen(false)}
        />
      )}

      {archiveBrowser && (
        <ArchiveBrowserModal
          api={api}
          archivePath={archiveBrowser.archivePath}
          destinationPath={archiveBrowser.destinationPath}
          onClose={() => setArchiveBrowser(null)}
          onExtracted={() => void refreshPane(activePaneId)}
        />
      )}

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.message}</div>}
    </main>
  );
}

function QuickLaunchPanel({
  items,
  currentPath,
  selectedCount,
  onRun,
  onManage
}: {
  items: QuickLaunchItem[];
  currentPath: string;
  selectedCount: number;
  onRun: (item: QuickLaunchItem) => void;
  onManage: () => void;
}) {
  const enabledItems = items.filter((item) => item.enabled);
  return (
    <section className="quick-launch-panel" aria-label="Quick Launch">
      <div className="quick-launch-summary">
        <strong>Quick Launch</strong>
        <span title={currentPath}>{selectedCount ? `${selectedCount} selected` : pathName(currentPath)}</span>
      </div>
      <div className="quick-launch-actions">
        {enabledItems.map((item) => (
          <button key={item.id} onClick={() => onRun(item)} title={item.command}>
            <Rocket size={15} />
            <span>{item.label}</span>
          </button>
        ))}
        {enabledItems.length === 0 && <span className="quick-launch-empty">No enabled launch items.</span>}
      </div>
      <button className="quick-launch-manage" onClick={onManage}>
        Manage
      </button>
    </section>
  );
}

function QuickLaunchModal({
  items,
  onClose,
  onSave
}: {
  items: QuickLaunchItem[];
  onClose: () => void;
  onSave: (items: QuickLaunchItem[]) => void;
}) {
  const [draftItems, setDraftItems] = useState<QuickLaunchItem[]>(items.map((item) => ({ ...item })));
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const selectedItem = draftItems.find((item) => item.id === selectedId) ?? draftItems[0] ?? null;

  function addItem() {
    const nextItem = createQuickLaunchItem(`Launch ${draftItems.length + 1}`);
    setDraftItems((current) => [...current, nextItem]);
    setSelectedId(nextItem.id);
  }

  function updateItem<K extends keyof QuickLaunchItem>(key: K, value: QuickLaunchItem[K]) {
    if (!selectedItem) return;
    setDraftItems((current) => current.map((item) => (item.id === selectedItem.id ? { ...item, [key]: value } : item)));
  }

  function deleteItem() {
    if (!selectedItem) return;
    const remaining = draftItems.filter((item) => item.id !== selectedItem.id);
    setDraftItems(remaining);
    setSelectedId(remaining[0]?.id ?? "");
  }

  function saveItems() {
    onSave(
      draftItems.map((item) => ({
        ...item,
        label: item.label.trim() || "Untitled launch",
        command: item.command.trim(),
        arguments: item.arguments.trim(),
        openFiles: item.openFiles.trim()
      }))
    );
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal quick-launch-modal" role="dialog" aria-modal="true" aria-label="Quick Launch settings">
        <header className="modal-header">
          <div>
            <h2>Quick Launch</h2>
            <span>Run apps, commands, or shortcuts from the active pane.</span>
          </div>
          <button onClick={onClose}>Close</button>
        </header>

        <div className="quick-launch-body">
          <div className="quick-launch-list" aria-label="Quick Launch items">
            <button className="add-rule-button" onClick={addItem}>
              Add Item
            </button>
            {draftItems.length === 0 && <p className="empty-note">No launch items configured.</p>}
            {draftItems.map((item) => (
              <button
                key={item.id}
                className={item.id === selectedItem?.id ? "active" : ""}
                onClick={() => setSelectedId(item.id)}
              >
                <Rocket size={16} />
                <span>{item.label || "Untitled launch"}</span>
                <small>{item.enabled ? item.type : "Disabled"}</small>
              </button>
            ))}
          </div>

          {selectedItem ? (
            <div className="quick-launch-editor">
              <label className="check-row launch-enabled">
                <input
                  type="checkbox"
                  checked={selectedItem.enabled}
                  onChange={(event) => updateItem("enabled", event.target.checked)}
                />
                Enabled
              </label>
              <label>
                Name
                <input value={selectedItem.label} onChange={(event) => updateItem("label", event.target.value)} />
              </label>
              <label>
                Type
                <select value={selectedItem.type} onChange={(event) => updateItem("type", event.target.value as QuickLaunchType)}>
                  <option value="app">App</option>
                  <option value="command">Command Line</option>
                  <option value="shortcut">Shortcut</option>
                </select>
              </label>
              <label>
                Icon
                <input value={selectedItem.icon} onChange={(event) => updateItem("icon", event.target.value)} />
              </label>
              <label className="launch-command-label">
                Command
                <input value={selectedItem.command} onChange={(event) => updateItem("command", event.target.value)} spellCheck={false} />
              </label>
              <label className="launch-arguments-label">
                Arguments
                <textarea value={selectedItem.arguments} onChange={(event) => updateItem("arguments", event.target.value)} spellCheck={false} />
              </label>
              <label className="launch-files-label">
                Open files
                <textarea value={selectedItem.openFiles} onChange={(event) => updateItem("openFiles", event.target.value)} spellCheck={false} />
              </label>
              <div className="variable-token-list" aria-label="Quick Launch variables">
                {quickLaunchVariableTokens.map((token) => (
                  <code key={token}>{token}</code>
                ))}
              </div>
            </div>
          ) : (
            <div className="color-rule-empty">
              <p className="empty-note">Add a launch item to run apps or commands.</p>
            </div>
          )}
        </div>

        <footer className="modal-footer">
          <button disabled={!selectedItem} onClick={deleteItem}>
            Delete Item
          </button>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={saveItems}>
            Save Items
          </button>
        </footer>
      </section>
    </div>
  );
}

function Sidebar({
  bootstrap,
  bookmarks,
  stashItems,
  canAddSelection,
  onOpen,
  onRemoveBookmark,
  onAddSelectionToShelf,
  onPreviewShelfItem,
  onRemoveShelfItem,
  onClearShelf,
  onCopyShelf,
  onMoveShelf,
  onHashShelf
}: {
  bootstrap: BootstrapPayload;
  bookmarks: KnownLocation[];
  stashItems: StashShelfItem[];
  canAddSelection: boolean;
  onOpen: (path: string) => void;
  onRemoveBookmark: (id: string) => void;
  onAddSelectionToShelf: () => void;
  onPreviewShelfItem: (path: string) => void;
  onRemoveShelfItem: (path: string) => void;
  onClearShelf: () => void;
  onCopyShelf: () => void;
  onMoveShelf: () => void;
  onHashShelf: () => void;
}) {
  return (
    <aside className="sidebar">
      <section>
        <h2>Quick Access</h2>
        {bootstrap.knownLocations.map((location) => (
          <SidebarItem key={location.id} location={location} onOpen={onOpen} />
        ))}
      </section>
      <section>
        <h2>Drives</h2>
        {bootstrap.drives.map((drive) => (
          <button key={drive.path} className="sidebar-item" onClick={() => onOpen(drive.path)}>
            <HardDrive size={16} />
            <span>{drive.name}</span>
            <small>{drive.path}</small>
          </button>
        ))}
      </section>
      <StashShelf
        items={stashItems}
        canAddSelection={canAddSelection}
        onAddSelection={onAddSelectionToShelf}
        onPreviewItem={onPreviewShelfItem}
        onRemoveItem={onRemoveShelfItem}
        onClear={onClearShelf}
        onCopy={onCopyShelf}
        onMove={onMoveShelf}
        onHash={onHashShelf}
      />
      <section>
        <h2>Bookmarks</h2>
        {bookmarks.length === 0 && <p className="empty-note">Add current pane folders with the star button.</p>}
        {bookmarks.map((bookmark) => (
          <div key={bookmark.id} className="bookmark-row">
            <SidebarItem location={bookmark} onOpen={onOpen} />
            <button className="ghost-mini" title="Remove bookmark" onClick={() => onRemoveBookmark(bookmark.id)}>
              x
            </button>
          </div>
        ))}
      </section>
    </aside>
  );
}

function StashShelf({
  items,
  canAddSelection,
  onAddSelection,
  onPreviewItem,
  onRemoveItem,
  onClear,
  onCopy,
  onMove,
  onHash
}: {
  items: StashShelfItem[];
  canAddSelection: boolean;
  onAddSelection: () => void;
  onPreviewItem: (path: string) => void;
  onRemoveItem: (path: string) => void;
  onClear: () => void;
  onCopy: () => void;
  onMove: () => void;
  onHash: () => void;
}) {
  const fileCount = items.filter((item) => !item.isDirectory).length;
  return (
    <section className="stash-section" aria-label="Stash Shelf">
      <div className="section-heading-row">
        <h2>Stash Shelf</h2>
        <span>{items.length}</span>
      </div>
      <div className="stash-actions">
        <button onClick={onAddSelection} disabled={!canAddSelection}>Add</button>
        <button onClick={onCopy} disabled={!items.length}>Copy</button>
        <button onClick={onMove} disabled={!items.length}>Move</button>
        <button onClick={onHash} disabled={!fileCount}>Hash</button>
        <button onClick={onClear} disabled={!items.length}>Clear</button>
      </div>
      {items.length === 0 && <p className="empty-note">Collect files from any pane, then copy or move them together.</p>}
      <div className="stash-list">
        {items.map((item) => (
          <div key={item.path} className="stash-row">
            <button className="stash-item" title={item.path} onClick={() => onPreviewItem(item.path)}>
              {item.isDirectory ? <Folder size={15} /> : <File size={15} />}
              <span>{item.label}</span>
              <small>{item.isDirectory ? "Folder" : formatBytes(item.size)}</small>
            </button>
            <button className="ghost-mini" title="Remove from shelf" onClick={() => onRemoveItem(item.path)}>
              x
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkspaceTabs({
  workspaces,
  activeWorkspaceId,
  onSwitch,
  onNew,
  onClone,
  onRename,
  onDelete
}: {
  workspaces: WorkspaceRecord[];
  activeWorkspaceId: string;
  onSwitch: (workspaceId: string) => void;
  onNew: () => void;
  onClone: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <nav className="workspace-tabs" aria-label="Workspaces">
      <div className="workspace-tab-list" role="tablist">
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            className={`workspace-tab ${workspace.id === activeWorkspaceId ? "active" : ""}`}
            role="tab"
            aria-selected={workspace.id === activeWorkspaceId}
            onClick={() => onSwitch(workspace.id)}
            title={workspace.name}
          >
            <span>{workspace.name}</span>
          </button>
        ))}
      </div>
      <div className="workspace-tab-actions">
        <IconButton title="New workspace" onClick={onNew} icon={Plus} />
        <IconButton title="Clone workspace" onClick={onClone} icon={Copy} disabled={!activeWorkspaceId} />
        <IconButton title="Rename workspace" onClick={onRename} icon={Pencil} disabled={!activeWorkspaceId} />
        <IconButton title="Delete workspace" onClick={onDelete} icon={Trash2} disabled={workspaces.length <= 1} />
      </div>
    </nav>
  );
}

function SidebarItem({ location, onOpen }: { location: KnownLocation; onOpen: (path: string) => void }) {
  const Icon = iconByName[location.icon] ?? Star;
  return (
    <button className="sidebar-item" title={location.path} onClick={() => onOpen(location.path)}>
      <Icon size={16} />
      <span>{location.label}</span>
      <small>{location.path}</small>
    </button>
  );
}

function ExplorerPane({
  pane,
  entries,
  colorRules,
  addressSuggestions,
  active,
  onActivate,
  onNavigate,
  onBack,
  onForward,
  onUp,
  onRefresh,
  onAddressChange,
  onAddressSubmit,
  onFilterChange,
  onRecursiveChange,
  onSearch,
  onSort,
  onViewMode,
  onSelect,
  onOpen,
  onContextMenu,
  onDrop,
  onDragStart,
  onCopyTo,
  onMoveTo
}: {
  pane: PaneState;
  entries: FileEntry[];
  colorRules: ColorRule[];
  addressSuggestions: PathSuggestion[];
  active: boolean;
  onActivate: () => void;
  onNavigate: (path: string) => void;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onRefresh: () => void;
  onAddressChange: (value: string) => void;
  onAddressSubmit: () => void;
  onFilterChange: (value: string) => void;
  onRecursiveChange: (value: boolean) => void;
  onSearch: () => void;
  onSort: (sortKey: SortKey) => void;
  onViewMode: (mode: ViewMode) => void;
  onSelect: (entry: FileEntry, event: React.MouseEvent, entries: FileEntry[]) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (event: React.MouseEvent, entry?: FileEntry) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragStart: (event: React.DragEvent, entry: FileEntry) => void;
  onCopyTo: (paneId: number) => void;
  onMoveTo: (paneId: number) => void;
}) {
  const canBack = pane.historyIndex > 0;
  const canForward = pane.historyIndex < pane.history.length - 1;
  const selectedCount = pane.selectedPaths.length;
  const selectedBytes = entries
    .filter((entry) => containsPath(pane.selectedPaths, entry.path))
    .reduce((sum, entry) => sum + entry.size, 0);

  return (
    <article
      className={`explorer-pane ${active ? "active" : ""}`}
      aria-label={`Pane ${pane.id}`}
      onClick={onActivate}
      onContextMenu={(event) => onContextMenu(event)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <header className="pane-titlebar">
        <div className="pane-title">
          <span className="pane-index">P{pane.id}</span>
          <strong title={pane.path}>{pathName(pane.path)}</strong>
        </div>
        <div className="pane-tools">
          <IconButton title="Details view" icon={List} active={pane.viewMode === "details"} onClick={() => onViewMode("details")} />
          <IconButton title="Icon view" icon={LayoutGrid} active={pane.viewMode === "icons"} onClick={() => onViewMode("icons")} />
          <IconButton title="Refresh pane" icon={RefreshCcw} onClick={onRefresh} />
        </div>
      </header>

      <div className="pane-nav">
        <IconButton title="Back" icon={ArrowLeft} onClick={onBack} disabled={!canBack} />
        <IconButton title="Forward" icon={ArrowRight} onClick={onForward} disabled={!canForward} />
        <IconButton title="Up" icon={ArrowUp} onClick={onUp} />
        <div className="breadcrumbs">
          {breadcrumbs(pane.path).map((part) => (
            <button key={part.path} title={part.path} onClick={() => onNavigate(part.path)}>
              {part.label}
            </button>
          ))}
        </div>
      </div>

      <form
        className="address-row"
        onSubmit={(event) => {
          event.preventDefault();
          onAddressSubmit();
        }}
      >
        <input
          value={pane.addressDraft}
          list={`path-suggestions-${pane.id}`}
          onChange={(event) => onAddressChange(event.target.value)}
          spellCheck={false}
        />
        <datalist id={`path-suggestions-${pane.id}`}>
          {addressSuggestions.map((suggestion) => (
            <option key={suggestion.path} value={suggestion.path}>
              {suggestion.isDirectory ? "Folder" : "File"} - {suggestion.label}
            </option>
          ))}
        </datalist>
        <button type="submit">Go</button>
      </form>

      <div className="search-row">
        <Search size={15} />
        <input
          value={pane.filter}
          placeholder="Filter or search"
          onChange={(event) => onFilterChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSearch();
          }}
        />
        <label>
          <input
            type="checkbox"
            checked={pane.recursiveSearch}
            onChange={(event) => onRecursiveChange(event.target.checked)}
          />
          Subfolders
        </label>
        <button type="button" onClick={onSearch}>
          Search
        </button>
      </div>

      <div className="pane-transfer">
        <span>Copy to</span>
        {paneIds
          .filter((id) => id !== pane.id)
          .map((id) => (
            <button key={`copy-${id}`} disabled={!selectedCount} onClick={() => onCopyTo(id)}>
              P{id}
            </button>
          ))}
        <span>Move to</span>
        {paneIds
          .filter((id) => id !== pane.id)
          .map((id) => (
            <button key={`move-${id}`} disabled={!selectedCount} onClick={() => onMoveTo(id)}>
              P{id}
            </button>
          ))}
      </div>

      <section className="file-region">
        {pane.viewMode === "details" ? (
          <DetailsList
            pane={pane}
            entries={entries}
            colorRules={colorRules}
            onSort={onSort}
            onSelect={onSelect}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
            onDragStart={onDragStart}
          />
        ) : (
          <IconGrid
            pane={pane}
            entries={entries}
            colorRules={colorRules}
            onSelect={onSelect}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
            onDragStart={onDragStart}
          />
        )}
        {pane.loading && <div className="pane-overlay">Loading...</div>}
        {pane.error && <div className="pane-error">{pane.error}</div>}
      </section>

      <footer className="pane-status">
        <span>{entries.length} items</span>
        <span>{selectedCount ? `${selectedCount} selected, ${formatBytes(selectedBytes)}` : "No selection"}</span>
      </footer>
    </article>
  );
}

function DetailsList({
  pane,
  entries,
  colorRules,
  onSort,
  onSelect,
  onOpen,
  onContextMenu,
  onDragStart
}: {
  pane: PaneState;
  entries: FileEntry[];
  colorRules: ColorRule[];
  onSort: (sortKey: SortKey) => void;
  onSelect: (entry: FileEntry, event: React.MouseEvent, entries: FileEntry[]) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (event: React.MouseEvent, entry?: FileEntry) => void;
  onDragStart: (event: React.DragEvent, entry: FileEntry) => void;
}) {
  return (
    <div className="details-list">
      <div className="details-header">
        {(["name", "size", "modifiedAt", "type"] as SortKey[]).map((key) => (
          <button key={key} onClick={() => onSort(key)}>
            {sortLabels[key]}
            {pane.sortKey === key && <span>{pane.sortDirection === "asc" ? " ^" : " v"}</span>}
          </button>
        ))}
      </div>
      <div className="details-body">
        {entries.map((entry) => {
          const selected = containsPath(pane.selectedPaths, entry.path);
          const colorRule = getEntryColorRule(entry, colorRules);
          return (
            <button
              key={entry.path}
              className={`details-row ${selected ? "selected" : ""} ${colorRule ? "colorized" : ""}`}
              style={colorRule?.style}
              title={colorRule ? `${entry.path}\nRule: ${colorRule.label}` : entry.path}
              draggable
              onClick={(event) => onSelect(entry, event, entries)}
              onDoubleClick={() => onOpen(entry)}
              onContextMenu={(event) => onContextMenu(event, entry)}
              onDragStart={(event) => onDragStart(event, entry)}
            >
              <span className="file-name-cell">
                {entry.isDirectory ? <Folder size={16} /> : <File size={16} />}
                <span>{entry.name}</span>
              </span>
              <span>{entry.isDirectory ? "" : formatBytes(entry.size)}</span>
              <span>{formatDate(entry.modifiedAt)}</span>
              <span>{entry.typeLabel}</span>
            </button>
          );
        })}
        {entries.length === 0 && <div className="empty-folder">No items match this view.</div>}
      </div>
    </div>
  );
}

function IconGrid({
  pane,
  entries,
  colorRules,
  onSelect,
  onOpen,
  onContextMenu,
  onDragStart
}: {
  pane: PaneState;
  entries: FileEntry[];
  colorRules: ColorRule[];
  onSelect: (entry: FileEntry, event: React.MouseEvent, entries: FileEntry[]) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (event: React.MouseEvent, entry?: FileEntry) => void;
  onDragStart: (event: React.DragEvent, entry: FileEntry) => void;
}) {
  return (
    <div className="icon-grid">
      {entries.map((entry) => {
        const selected = containsPath(pane.selectedPaths, entry.path);
        const colorRule = getEntryColorRule(entry, colorRules);
        return (
          <button
            key={entry.path}
            className={`icon-tile ${selected ? "selected" : ""} ${colorRule ? "colorized" : ""}`}
            style={colorRule?.style}
            title={colorRule ? `${entry.path}\nRule: ${colorRule.label}` : entry.path}
            draggable
            onClick={(event) => onSelect(entry, event, entries)}
            onDoubleClick={() => onOpen(entry)}
            onContextMenu={(event) => onContextMenu(event, entry)}
            onDragStart={(event) => onDragStart(event, entry)}
          >
            {entry.isDirectory ? <Folder size={28} /> : <File size={28} />}
            <span>{entry.name}</span>
          </button>
        );
      })}
      {entries.length === 0 && <div className="empty-folder">No items match this view.</div>}
    </div>
  );
}

interface EntryColorRuleStyle {
  label: string;
  style: CSSProperties;
}

function getEntryColorRule(entry: FileEntry, colorRules: ColorRule[]): EntryColorRuleStyle | null {
  const matchedRule = colorRules.find((rule) => colorRuleMatches(rule, entry));
  if (!matchedRule) return null;
  return {
    label: matchedRule.label,
    style: {
      "--space-rule-text": matchedRule.textColor,
      "--space-rule-bg": matchedRule.backgroundColor
    } as CSSProperties
  };
}

function colorRuleMatches(rule: ColorRule, entry: FileEntry, now = Date.now()): boolean {
  if (!rule.enabled) return false;
  if (rule.target === "files" && !entry.isFile) return false;
  if (rule.target === "folders" && !entry.isDirectory) return false;
  if (!matchesNameRule(rule, entry.name)) return false;
  if (!matchesExtensionRule(rule.extensions, entry.extension)) return false;
  if (!matchesNumberComparison(entry.size / (1024 * 1024), rule.sizeComparison, rule.sizeValueMB)) return false;
  if (!matchesAgeComparison(now - entry.modifiedAt, rule.modifiedComparison, rule.modifiedValue, rule.modifiedUnit)) return false;
  if (!matchesAgeComparison(now - entry.createdAt, rule.createdComparison, rule.createdValue, rule.createdUnit)) return false;
  return true;
}

function matchesNameRule(rule: ColorRule, name: string): boolean {
  const pattern = rule.namePattern.trim();
  if (!pattern) return true;
  const haystack = name.toLowerCase();
  const needle = pattern.toLowerCase();
  if (rule.nameMatch === "startsWith") return haystack.startsWith(needle);
  if (rule.nameMatch === "endsWith") return haystack.endsWith(needle);
  if (rule.nameMatch === "equals") return haystack === needle;
  if (rule.nameMatch === "regex") {
    try {
      return new RegExp(pattern, "i").test(name);
    } catch {
      return false;
    }
  }
  return haystack.includes(needle);
}

function matchesExtensionRule(rawExtensions: string, entryExtension: string): boolean {
  const extensions = rawExtensions
    .split(/[\s,;]+/)
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean)
    .map((extension) => (extension.startsWith(".") ? extension : `.${extension}`));
  if (extensions.length === 0) return true;
  return extensions.includes(entryExtension.toLowerCase());
}

function matchesNumberComparison(value: number, comparison: ColorRuleComparison, threshold: number): boolean {
  if (comparison === "any") return true;
  if (!Number.isFinite(threshold) || threshold < 0) return false;
  return comparison === "greaterThan" ? value > threshold : value < threshold;
}

function matchesAgeComparison(ageMs: number, comparison: ColorRuleComparison, value: number, unit: ColorRuleTimeUnit): boolean {
  if (comparison === "any") return true;
  if (!Number.isFinite(value) || value < 0) return false;
  const thresholdMs = value * timeUnitMs(unit);
  return comparison === "greaterThan" ? ageMs > thresholdMs : ageMs < thresholdMs;
}

function timeUnitMs(unit: ColorRuleTimeUnit): number {
  if (unit === "minutes") return 60 * 1000;
  if (unit === "hours") return 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function Inspector({
  targetPath,
  api,
  hashLine,
  onHash,
  onReveal
}: {
  targetPath: string | null;
  api: SpaceApi;
  hashLine: string;
  onHash: () => void;
  onReveal: () => void;
}) {
  const [preview, setPreview] = useState<Awaited<ReturnType<SpaceApi["preview"]>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!targetPath) {
      setPreview(null);
      return;
    }
    api
      .preview(targetPath)
      .then((payload) => {
        if (!cancelled) setPreview(payload);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [api, targetPath]);

  return (
    <aside className="inspector">
      <h2>Inspector</h2>
      {!preview && <p className="empty-note">Select a file to preview details.</p>}
      {preview && (
        <>
          <div className="preview-card">
            {preview.kind === "image" && preview.dataUrl && <img src={preview.dataUrl} alt={preview.name} />}
            {preview.kind === "text" && <pre>{preview.text}</pre>}
            {preview.kind !== "image" && preview.kind !== "text" && (
              <div className="preview-fallback">
                {preview.kind === "directory" ? <Folder size={42} /> : <File size={42} />}
                <span>{preview.kind}</span>
              </div>
            )}
          </div>
          <dl className="metadata">
            <dt>Name</dt>
            <dd>{preview.name}</dd>
            <dt>Path</dt>
            <dd title={preview.path}>{preview.path}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(preview.size)}</dd>
            <dt>Modified</dt>
            <dd>{formatDate(preview.modifiedAt)}</dd>
          </dl>
          <div className="inspector-actions">
            <button onClick={onReveal}>
              <ExternalLink size={14} />
              Reveal
            </button>
            <button onClick={onHash} disabled={preview.kind === "directory"}>
              SHA-256
            </button>
          </div>
          {hashLine && <p className="hash-line">{hashLine}</p>}
        </>
      )}
    </aside>
  );
}

function HashCompareModal({
  api,
  entries,
  onClose
}: {
  api: SpaceApi;
  entries: FileEntry[];
  onClose: () => void;
}) {
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>("sha256");
  const [results, setResults] = useState<HashCompareResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculated, setCalculated] = useState(false);
  const [error, setError] = useState("");
  const files = useMemo(() => {
    const seen = new Set<string>();
    return entries.filter((entry) => {
      const key = entry.path.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [entries]);

  const groups = useMemo(() => {
    const grouped = new Map<string, HashCompareResult[]>();
    for (const result of results) {
      if (!result.value) continue;
      grouped.set(result.value, [...(grouped.get(result.value) ?? []), result]);
    }
    return [...grouped.entries()]
      .map(([value, items]) => ({ value, items }))
      .sort((a, b) => b.items.length - a.items.length || a.value.localeCompare(b.value));
  }, [results]);
  const duplicateGroups = groups.filter((group) => group.items.length > 1);
  const uniqueGroups = groups.filter((group) => group.items.length === 1);
  const failedResults = results.filter((result) => result.error);

  async function calculate() {
    if (files.length === 0) {
      setError("Select one or more files to compare.");
      return;
    }
    setLoading(true);
    setCalculated(true);
    setError("");
    const nextResults = await Promise.all(
      files.map(async (entry) => {
        try {
          const payload = await api.calculateHash({ path: entry.path, algorithm });
          return { entry, value: payload.value };
        } catch (caught) {
          return { entry, error: getErrorMessage(caught) };
        }
      })
    );
    setResults(nextResults);
    setLoading(false);
  }

  useEffect(() => {
    setResults([]);
    setCalculated(false);
    setError("");
  }, [algorithm, files]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal hash-compare-modal" role="dialog" aria-modal="true" aria-label="Hash compare">
        <header className="modal-header">
          <div>
            <h2>Hash Compare</h2>
            <span>{files.length} selected file(s)</span>
          </div>
          <button onClick={onClose}>Close</button>
        </header>

        <div className="hash-compare-toolbar">
          <label>
            Algorithm
            <select value={algorithm} onChange={(event) => setAlgorithm(event.target.value as HashAlgorithm)}>
              {hashAlgorithms.map((item) => (
                <option key={item} value={item}>
                  {item.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={() => void calculate()} disabled={loading || files.length === 0}>
            Calculate
          </button>
          <span>
            {loading
              ? "Calculating..."
              : calculated
                ? `${duplicateGroups.length} matching group(s) · ${uniqueGroups.length} unique file(s)`
                : "Ready"}
          </span>
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="hash-compare-results">
          {!calculated && <p className="empty-folder">Choose an algorithm and calculate selected file hashes.</p>}
          {duplicateGroups.map((group) => (
            <section className="hash-group duplicate" key={group.value}>
              <div className="hash-group-header">
                <strong>{group.items.length} matching files</strong>
                <code>{group.value}</code>
              </div>
              {group.items.map((result) => (
                <HashCompareRow key={result.entry.path} result={result} />
              ))}
            </section>
          ))}
          {uniqueGroups.length > 0 && (
            <section className="hash-group">
              <div className="hash-group-header">
                <strong>{uniqueGroups.length} unique file(s)</strong>
                <span>{algorithm.toUpperCase()}</span>
              </div>
              {uniqueGroups.map((group) => (
                <HashCompareRow key={group.items[0].entry.path} result={group.items[0]} hashValue={group.value} />
              ))}
            </section>
          )}
          {failedResults.length > 0 && (
            <section className="hash-group failed">
              <div className="hash-group-header">
                <strong>{failedResults.length} failed item(s)</strong>
                <span>Skipped</span>
              </div>
              {failedResults.map((result) => (
                <HashCompareRow key={result.entry.path} result={result} />
              ))}
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

function HashCompareRow({ result, hashValue }: { result: HashCompareResult; hashValue?: string }) {
  return (
    <div className="hash-row">
      <span className="file-name-cell">
        <File size={16} />
        <span>{result.entry.name}</span>
      </span>
      <span title={result.entry.parentPath}>{result.entry.parentPath}</span>
      <span>{formatBytes(result.entry.size)}</span>
      <code title={result.error ?? result.value ?? hashValue}>{result.error ?? result.value ?? hashValue}</code>
    </div>
  );
}

function ArchiveBrowserModal({
  api,
  archivePath,
  destinationPath,
  onClose,
  onExtracted
}: {
  api: SpaceApi;
  archivePath: string;
  destinationPath: string;
  onClose: () => void;
  onExtracted: () => void;
}) {
  const [internalPath, setInternalPath] = useState("");
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [preview, setPreview] = useState<ArchivePreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setMessage("");
    api
      .listArchive({ archivePath, internalPath })
      .then((payload) => {
        if (cancelled) return;
        setEntries(payload.entries);
        setSelectedPaths([]);
        setPreview(null);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(getErrorMessage(caught));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, archivePath, internalPath]);

  async function selectEntry(entry: ArchiveEntry, event: React.MouseEvent) {
    if (event.ctrlKey || event.metaKey) {
      setSelectedPaths((current) =>
        current.includes(entry.internalPath)
          ? current.filter((item) => item !== entry.internalPath)
          : [...current, entry.internalPath]
      );
    } else {
      setSelectedPaths([entry.internalPath]);
    }
    if (entry.isDirectory) {
      setPreview({
        archivePath,
        internalPath: entry.internalPath,
        name: entry.name,
        kind: "directory",
        size: 0,
        modifiedAt: entry.modifiedAt
      });
      return;
    }
    try {
      setPreview(await api.previewArchiveEntry({ archivePath, internalPath: entry.internalPath }));
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  function openEntry(entry: ArchiveEntry) {
    if (entry.isDirectory) {
      setInternalPath(entry.internalPath);
    }
  }

  function goUp() {
    if (!internalPath) return;
    const trimmed = internalPath.replace(/\/$/, "");
    const parent = trimmed.includes("/") ? `${trimmed.slice(0, trimmed.lastIndexOf("/") + 1)}` : "";
    setInternalPath(parent);
  }

  async function extractSelected(all: boolean) {
    try {
      const result = await api.extractArchive({
        archivePath,
        destinationPath,
        internalPaths: all ? [] : selectedPaths
      });
      setMessage(result.message);
      onExtracted();
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal archive-modal" role="dialog" aria-modal="true" aria-label="Archive browser">
        <header className="modal-header">
          <div>
            <h2>{pathName(archivePath)}</h2>
            <span>{internalPath || "Archive root"}</span>
          </div>
          <button onClick={onClose}>Close</button>
        </header>

        <div className="archive-toolbar">
          <button onClick={goUp} disabled={!internalPath}>
            Up
          </button>
          <button onClick={() => void extractSelected(false)} disabled={!selectedPaths.length}>
            Extract Selected
          </button>
          <button onClick={() => void extractSelected(true)}>Extract All</button>
          <span title={destinationPath}>Destination: {destinationPath}</span>
        </div>

        {error && <p className="modal-error">{error}</p>}
        {message && <p className="modal-help">{message}</p>}
        <div className="archive-body">
          <div className="archive-list">
            <div className="preview-header archive-header">
              <span>Name</span>
              <span>Size</span>
              <span>Modified</span>
            </div>
            {entries.map((entry) => (
              <button
                key={entry.internalPath}
                className={`archive-row ${selectedPaths.includes(entry.internalPath) ? "selected" : ""}`}
                onClick={(event) => void selectEntry(entry, event)}
                onDoubleClick={() => openEntry(entry)}
              >
                <span className="file-name-cell">
                  {entry.isDirectory ? <Folder size={16} /> : <File size={16} />}
                  <span>{entry.name}</span>
                </span>
                <span>{entry.isDirectory ? "" : formatBytes(entry.size)}</span>
                <span>{formatDate(entry.modifiedAt)}</span>
              </button>
            ))}
            {loading && <div className="empty-folder">Loading archive...</div>}
            {!loading && entries.length === 0 && <div className="empty-folder">Archive folder is empty.</div>}
          </div>

          <div className="archive-preview">
            {!preview && <p className="empty-note">Select an archive entry to preview it.</p>}
            {preview?.kind === "image" && preview.dataUrl && <img src={preview.dataUrl} alt={preview.name} />}
            {preview?.kind === "text" && <pre>{preview.text}</pre>}
            {preview && preview.kind !== "image" && preview.kind !== "text" && (
              <div className="preview-fallback">
                {preview.kind === "directory" ? <Folder size={42} /> : <File size={42} />}
                <span>{preview.kind}</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function NewFileModal({
  templates,
  destinationPath,
  onClose,
  onCreate,
  onDeleteTemplate
}: {
  templates: NewFileTemplate[];
  destinationPath: string;
  onClose: () => void;
  onCreate: (request: { name: string; content: string; saveTemplateName?: string }) => void;
  onDeleteTemplate: (templateId: string) => void;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const [fileName, setFileName] = useState(selectedTemplate?.fileName ?? "New File.txt");
  const [content, setContent] = useState(selectedTemplate?.content ?? "");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const previewName = expandDatePreview(fileName);
  const canDeleteTemplate = !!selectedTemplate && selectedTemplate.createdAt > 0;

  function chooseTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setSelectedTemplateId(template.id);
    setFileName(template.fileName);
    setContent(template.content);
    setSaveAsTemplate(false);
    setTemplateName("");
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal new-file-modal" role="dialog" aria-modal="true" aria-label="New file">
        <header className="modal-header">
          <div>
            <h2>New File</h2>
            <span title={destinationPath}>{destinationPath}</span>
          </div>
          <button onClick={onClose}>Close</button>
        </header>

        <div className="new-file-body">
          <div className="template-list" aria-label="File templates">
            {templates.map((template) => (
              <button
                key={template.id}
                className={template.id === selectedTemplateId ? "active" : ""}
                onClick={() => chooseTemplate(template.id)}
              >
                <span>{template.label}</span>
                <small>{template.fileName}</small>
              </button>
            ))}
          </div>

          <div className="template-editor">
            <label>
              Name
              <input value={fileName} onChange={(event) => setFileName(event.target.value)} spellCheck={false} />
            </label>
            <label>
              Preview
              <input value={previewName} readOnly spellCheck={false} />
            </label>
            <label className="template-content-label">
              Content
              <textarea value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={(event) => setSaveAsTemplate(event.target.checked)}
              />
              Save as template
            </label>
            {saveAsTemplate && (
              <label>
                Template name
                <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
              </label>
            )}
          </div>
        </div>

        <footer className="modal-footer">
          <button onClick={onClose}>Cancel</button>
          <button
            disabled={!canDeleteTemplate}
            onClick={() => {
              if (!selectedTemplate) return;
              onDeleteTemplate(selectedTemplate.id);
              if (templates[0]) chooseTemplate(templates[0].id);
            }}
          >
            Delete Template
          </button>
          <button
            className="primary"
            disabled={!fileName.trim()}
            onClick={() => onCreate({ name: fileName, content, saveTemplateName: saveAsTemplate ? templateName : undefined })}
          >
            Create
          </button>
        </footer>
      </section>
    </div>
  );
}

function WorkspaceSearchModal({
  api,
  panes,
  activePaneId,
  onClose,
  onOpen,
  onReveal,
  onAddToShelf
}: {
  api: SpaceApi;
  panes: PaneState[];
  activePaneId: number;
  onClose: () => void;
  onOpen: (entry: FileEntry) => void;
  onReveal: (entry: FileEntry) => void;
  onAddToShelf: (entry: FileEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [recursive, setRecursive] = useState(true);
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const roots = useMemo(() => {
    const seen = new Set<string>();
    return panes.filter((pane) => {
      const key = pane.path.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [panes]);

  async function runWorkspaceSearch() {
    const searchQuery = query.trim();
    if (!searchQuery) {
      setError("Enter a search term.");
      return;
    }
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const perRootLimit = Math.max(50, Math.floor(500 / Math.max(roots.length, 1)));
      const responses = await Promise.all(
        roots.map(async (pane) => ({
          pane,
          entries: await api.searchFiles({
            rootPath: pane.path,
            query: searchQuery,
            recursive,
            limit: perRootLimit
          })
        }))
      );
      const resultMap = new Map<string, WorkspaceSearchResult>();
      for (const response of responses) {
        const sourceLabel = `P${response.pane.id} ${pathName(response.pane.path)}`;
        for (const entry of response.entries) {
          const key = entry.path.toLowerCase();
          const existing = resultMap.get(key);
          if (existing) {
            if (!existing.sourceLabels.includes(sourceLabel)) existing.sourceLabels.push(sourceLabel);
          } else {
            resultMap.set(key, { entry, sourceLabels: [sourceLabel] });
          }
        }
      }
      setResults(
        [...resultMap.values()]
          .sort((a, b) => a.entry.name.localeCompare(b.entry.name, undefined, { sensitivity: "base", numeric: true }))
          .slice(0, 500)
      );
    } catch (caught) {
      setError(getErrorMessage(caught));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal workspace-search-modal" role="dialog" aria-modal="true" aria-label="Workspace search">
        <header className="modal-header">
          <div>
            <h2>Workspace Search</h2>
            <span>{roots.length} pane root(s)</span>
          </div>
          <button onClick={onClose}>Close</button>
        </header>

        <form
          className="workspace-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            void runWorkspaceSearch();
          }}
        >
          <label>
            Query
            <input value={query} autoFocus onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={recursive} onChange={(event) => setRecursive(event.target.checked)} />
            Subfolders
          </label>
          <button className="primary" type="submit" disabled={loading}>
            Search
          </button>
        </form>

        <div className="workspace-search-roots">
          {roots.map((pane) => (
            <span key={pane.id} className={pane.id === activePaneId ? "active" : ""} title={pane.path}>
              P{pane.id}: {pathName(pane.path)}
            </span>
          ))}
        </div>

        {error && <p className="modal-error">{error}</p>}
        <div className="workspace-search-summary">
          {loading ? "Searching..." : searched ? `${results.length} result(s)` : "Ready"}
        </div>

        <div className="workspace-search-results">
          <div className="workspace-search-header">
            <span>Name</span>
            <span>Size</span>
            <span>Found In</span>
            <span>Actions</span>
          </div>
          {results.map((result) => (
            <div className="workspace-search-row" key={result.entry.path}>
              <button className="workspace-search-file" onClick={() => onOpen(result.entry)}>
                {result.entry.isDirectory ? <Folder size={16} /> : <File size={16} />}
                <span>
                  <strong>{result.entry.name}</strong>
                  <small title={result.entry.path}>{result.entry.parentPath}</small>
                </span>
              </button>
              <span>{result.entry.isDirectory ? "" : formatBytes(result.entry.size)}</span>
              <span title={result.sourceLabels.join(", ")}>{result.sourceLabels.join(", ")}</span>
              <div className="workspace-search-actions">
                <button onClick={() => onOpen(result.entry)}>Open {result.entry.name}</button>
                <button onClick={() => onReveal(result.entry)}>Reveal {result.entry.name}</button>
                <button onClick={() => onAddToShelf(result.entry)}>Shelf {result.entry.name}</button>
              </div>
            </div>
          ))}
          {!loading && searched && results.length === 0 && <div className="empty-folder">No matches found.</div>}
        </div>
      </section>
    </div>
  );
}

function ColorRulesModal({
  rules,
  onClose,
  onSave
}: {
  rules: ColorRule[];
  onClose: () => void;
  onSave: (rules: ColorRule[]) => void;
}) {
  const [draftRules, setDraftRules] = useState<ColorRule[]>(rules.map((rule) => ({ ...rule })));
  const [selectedId, setSelectedId] = useState(rules[0]?.id ?? "");
  const selectedRule = draftRules.find((rule) => rule.id === selectedId) ?? draftRules[0] ?? null;

  function addRule() {
    const nextRule = createColorRule(`Rule ${draftRules.length + 1}`);
    setDraftRules((current) => [...current, nextRule]);
    setSelectedId(nextRule.id);
  }

  function updateRule<K extends keyof ColorRule>(key: K, value: ColorRule[K]) {
    if (!selectedRule) return;
    setDraftRules((current) => current.map((rule) => (rule.id === selectedRule.id ? { ...rule, [key]: value } : rule)));
  }

  function deleteRule() {
    if (!selectedRule) return;
    const remaining = draftRules.filter((rule) => rule.id !== selectedRule.id);
    setDraftRules(remaining);
    setSelectedId(remaining[0]?.id ?? "");
  }

  function saveRules() {
    onSave(
      draftRules.map((rule) => ({
        ...rule,
        label: rule.label.trim() || "Untitled rule",
        extensions: rule.extensions.trim(),
        namePattern: rule.namePattern.trim(),
        sizeValueMB: Math.max(0, rule.sizeValueMB || 0),
        modifiedValue: Math.max(0, rule.modifiedValue || 0),
        createdValue: Math.max(0, rule.createdValue || 0)
      }))
    );
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal color-rules-modal" role="dialog" aria-modal="true" aria-label="Color rules">
        <header className="modal-header">
          <div>
            <h2>Color Rules</h2>
            <span>Highlight matching files and folders in every pane.</span>
          </div>
          <button onClick={onClose}>Close</button>
        </header>

        <div className="color-rules-body">
          <div className="color-rule-list" aria-label="Color rule list">
            <button className="add-rule-button" onClick={addRule}>
              Add Rule
            </button>
            {draftRules.length === 0 && <p className="empty-note">No color rules configured.</p>}
            {draftRules.map((rule) => (
              <button
                key={rule.id}
                className={rule.id === selectedRule?.id ? "active" : ""}
                onClick={() => setSelectedId(rule.id)}
              >
                <span className="rule-swatch" style={{ background: rule.backgroundColor, color: rule.textColor }}>
                  Aa
                </span>
                <span>{rule.label || "Untitled rule"}</span>
                <small>{rule.enabled ? "Enabled" : "Disabled"}</small>
              </button>
            ))}
          </div>

          {selectedRule ? (
            <div className="color-rule-editor">
              <label className="check-row rule-enabled">
                <input
                  type="checkbox"
                  checked={selectedRule.enabled}
                  onChange={(event) => updateRule("enabled", event.target.checked)}
                />
                Enabled
              </label>
              <label>
                Rule name
                <input value={selectedRule.label} onChange={(event) => updateRule("label", event.target.value)} />
              </label>
              <label>
                Target
                <select value={selectedRule.target} onChange={(event) => updateRule("target", event.target.value as ColorRuleTarget)}>
                  <option value="all">Files and folders</option>
                  <option value="files">Files only</option>
                  <option value="folders">Folders only</option>
                </select>
              </label>
              <label>
                Text color
                <input type="color" value={selectedRule.textColor} onChange={(event) => updateRule("textColor", event.target.value)} />
              </label>
              <label>
                Background
                <input type="color" value={selectedRule.backgroundColor} onChange={(event) => updateRule("backgroundColor", event.target.value)} />
              </label>
              <label>
                Name match
                <select value={selectedRule.nameMatch} onChange={(event) => updateRule("nameMatch", event.target.value as ColorRuleNameMatch)}>
                  <option value="contains">Contains</option>
                  <option value="startsWith">Starts with</option>
                  <option value="endsWith">Ends with</option>
                  <option value="equals">Equals</option>
                  <option value="regex">Regex</option>
                </select>
              </label>
              <label>
                Name pattern
                <input value={selectedRule.namePattern} onChange={(event) => updateRule("namePattern", event.target.value)} spellCheck={false} />
              </label>
              <label>
                Extensions
                <input
                  value={selectedRule.extensions}
                  onChange={(event) => updateRule("extensions", event.target.value)}
                  placeholder="zip, psd, png"
                  spellCheck={false}
                />
              </label>
              <label>
                Size
                <select value={selectedRule.sizeComparison} onChange={(event) => updateRule("sizeComparison", event.target.value as ColorRuleComparison)}>
                  <option value="any">Any size</option>
                  <option value="greaterThan">Greater than</option>
                  <option value="lessThan">Less than</option>
                </select>
              </label>
              <label>
                Size MB
                <input
                  type="number"
                  min="0"
                  value={selectedRule.sizeValueMB}
                  onChange={(event) => updateRule("sizeValueMB", Number(event.target.value))}
                />
              </label>
              <label>
                Modified age
                <select value={selectedRule.modifiedComparison} onChange={(event) => updateRule("modifiedComparison", event.target.value as ColorRuleComparison)}>
                  <option value="any">Any time</option>
                  <option value="greaterThan">Older than</option>
                  <option value="lessThan">Within</option>
                </select>
              </label>
              <label>
                Modified value
                <input
                  type="number"
                  min="0"
                  value={selectedRule.modifiedValue}
                  onChange={(event) => updateRule("modifiedValue", Number(event.target.value))}
                />
              </label>
              <label>
                Modified unit
                <select value={selectedRule.modifiedUnit} onChange={(event) => updateRule("modifiedUnit", event.target.value as ColorRuleTimeUnit)}>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </label>
              <label>
                Created age
                <select value={selectedRule.createdComparison} onChange={(event) => updateRule("createdComparison", event.target.value as ColorRuleComparison)}>
                  <option value="any">Any time</option>
                  <option value="greaterThan">Older than</option>
                  <option value="lessThan">Within</option>
                </select>
              </label>
              <label>
                Created value
                <input
                  type="number"
                  min="0"
                  value={selectedRule.createdValue}
                  onChange={(event) => updateRule("createdValue", Number(event.target.value))}
                />
              </label>
              <label>
                Created unit
                <select value={selectedRule.createdUnit} onChange={(event) => updateRule("createdUnit", event.target.value as ColorRuleTimeUnit)}>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="color-rule-empty">
              <p className="empty-note">Add a rule to start highlighting files.</p>
            </div>
          )}
        </div>

        <footer className="modal-footer">
          <button disabled={!selectedRule} onClick={deleteRule}>
            Delete Rule
          </button>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={saveRules}>
            Save Rules
          </button>
        </footer>
      </section>
    </div>
  );
}

function ActionSettingsModal({
  toolbarIds,
  contextMenuIds,
  hotkeyBindings,
  onClose,
  onSave
}: {
  toolbarIds: string[];
  contextMenuIds: string[];
  hotkeyBindings: HotkeyBinding[];
  onClose: () => void;
  onSave: (toolbarIds: string[], contextMenuIds: string[], hotkeyBindings: HotkeyBinding[]) => void;
}) {
  const [draftToolbarIds, setDraftToolbarIds] = useState(() => normalizeActionIds(toolbarIds, defaultToolbarActionIds, toolbarActionCatalog));
  const [draftContextIds, setDraftContextIds] = useState(() => normalizeActionIds(contextMenuIds, defaultContextMenuActionIds, contextMenuActionCatalog));
  const [draftHotkeys, setDraftHotkeys] = useState<Record<string, string>>(() => {
    const entries = normalizeHotkeyBindings(hotkeyBindings).map((binding) => [binding.actionId, binding.shortcut]);
    return Object.fromEntries(entries);
  });
  const normalizedHotkeys = hotkeyActionCatalog
    .map((item) => ({ actionId: item.id, shortcut: normalizeShortcut(draftHotkeys[item.id] ?? "") }))
    .filter((binding) => binding.shortcut);
  const duplicateHotkeys = normalizedHotkeys
    .filter((binding, index, list) => list.findIndex((item) => item.shortcut === binding.shortcut) !== index)
    .map((binding) => binding.shortcut);
  const invalidHotkeys = hotkeyActionCatalog
    .filter((item) => (draftHotkeys[item.id] ?? "").trim() && !normalizeShortcut(draftHotkeys[item.id] ?? ""))
    .map((item) => item.label);
  const canSave = duplicateHotkeys.length === 0 && invalidHotkeys.length === 0;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal action-settings-modal" role="dialog" aria-modal="true" aria-label="Customize actions">
        <header className="modal-header">
          <div>
            <h2>Customize Actions</h2>
            <span>Choose and arrange workspace toolbar and context menu actions.</span>
          </div>
          <button onClick={onClose}>Close</button>
        </header>

        <div className="action-settings-body">
          <ActionSurfaceEditor
            title="Toolbar"
            catalog={toolbarActionCatalog}
            selectedIds={draftToolbarIds}
            onChange={setDraftToolbarIds}
          />
          <ActionSurfaceEditor
            title="Context Menu"
            catalog={contextMenuActionCatalog}
            selectedIds={draftContextIds}
            onChange={setDraftContextIds}
          />
          <HotkeyEditor catalog={hotkeyActionCatalog} values={draftHotkeys} onChange={setDraftHotkeys} />
        </div>
        {(duplicateHotkeys.length > 0 || invalidHotkeys.length > 0) && (
          <div className="action-settings-warning" role="alert">
            {duplicateHotkeys.length > 0 && <span>Duplicate shortcuts: {[...new Set(duplicateHotkeys)].join(", ")}</span>}
            {invalidHotkeys.length > 0 && <span>Invalid shortcuts: {invalidHotkeys.join(", ")}</span>}
          </div>
        )}

        <footer className="modal-footer">
          <button
            onClick={() => {
              setDraftToolbarIds(defaultToolbarActionIds);
              setDraftContextIds(defaultContextMenuActionIds);
              setDraftHotkeys({});
            }}
          >
            Restore Defaults
          </button>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!canSave} onClick={() => onSave(draftToolbarIds, draftContextIds, normalizeHotkeyBindings(normalizedHotkeys))}>
            Save Settings
          </button>
        </footer>
      </section>
    </div>
  );
}

function HotkeyEditor({
  catalog,
  values,
  onChange
}: {
  catalog: ActionCatalogItem[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  return (
    <fieldset className="hotkey-editor">
      <legend>Hotkeys</legend>
      {catalog.map((item) => {
        const value = values[item.id] ?? "";
        const normalized = normalizeShortcut(value);
        return (
          <label key={item.id} className="hotkey-row">
            <span>{item.label}</span>
            <input
              aria-label={`${item.label} hotkey`}
              value={value}
              placeholder="Ctrl+Alt+K"
              onChange={(event) => onChange({ ...values, [item.id]: event.target.value })}
              onBlur={() => {
                if (normalized || !value.trim()) onChange({ ...values, [item.id]: normalized });
              }}
              spellCheck={false}
            />
          </label>
        );
      })}
    </fieldset>
  );
}

function ActionSurfaceEditor({
  title,
  catalog,
  selectedIds,
  onChange
}: {
  title: string;
  catalog: ActionCatalogItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string, enabled: boolean) {
    if (enabled) {
      onChange(selectedIds.includes(id) ? selectedIds : [...selectedIds, id]);
    } else {
      const nextIds = selectedIds.filter((item) => item !== id);
      onChange(nextIds);
    }
  }

  return (
    <fieldset className="action-surface-editor">
      <legend>{title}</legend>
      {catalog.map((item) => {
        const enabled = selectedIds.includes(item.id);
        const index = selectedIds.indexOf(item.id);
        return (
          <div key={item.id} className={`action-row ${enabled ? "enabled" : ""}`}>
            <label>
              <input type="checkbox" checked={enabled} onChange={(event) => toggle(item.id, event.target.checked)} />
              <span>{item.label}</span>
            </label>
            <div className="action-row-buttons">
              <button disabled={!enabled || index <= 0} onClick={() => onChange(moveActionId(selectedIds, item.id, -1))}>
                Up
              </button>
              <button disabled={!enabled || index === selectedIds.length - 1} onClick={() => onChange(moveActionId(selectedIds, item.id, 1))}>
                Down
              </button>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}

function moveActionId(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return ids;
  const nextIds = [...ids];
  const [item] = nextIds.splice(index, 1);
  nextIds.splice(nextIndex, 0, item);
  return nextIds;
}

function expandDatePreview(value: string, date = new Date()): string {
  return value.replace(/\$date\(([^)]+)\)/g, (_match, format: string) => formatDatePreview(format, date));
}

function formatDatePreview(format: string, date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  const replacements: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    yy: String(date.getFullYear()).slice(-2),
    MM: pad(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    dd: pad(date.getDate()),
    d: String(date.getDate()),
    HH: pad(date.getHours()),
    H: String(date.getHours()),
    mm: pad(date.getMinutes()),
    m: String(date.getMinutes()),
    ss: pad(date.getSeconds()),
    s: String(date.getSeconds())
  };
  return format.replace(/yyyy|yy|MM|M|dd|d|HH|H|mm|m|ss|s/g, (token) => replacements[token]);
}

function BatchRenameModal({
  api,
  paths,
  presets,
  history,
  onSavePresets,
  onClearHistory,
  onClose,
  onApply
}: {
  api: SpaceApi;
  paths: string[];
  presets: BatchRenamePreset[];
  history: BatchRenameHistoryEntry[];
  onSavePresets: (presets: BatchRenamePreset[]) => void;
  onClearHistory: () => void;
  onClose: () => void;
  onApply: (rule: BatchRenameRule) => void;
}) {
  const [rule, setRule] = useState<BatchRenameRule>(defaultBatchRenameRule);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [preview, setPreview] = useState<BatchRenamePreview | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    if (!paths.length) {
      setPreview({ items: [], canApply: false });
      return;
    }
    api
      .previewBatchRename({ paths, rule })
      .then((payload) => {
        if (!cancelled) setPreview(payload);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(getErrorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [api, paths, rule]);

  function updateRule<K extends keyof BatchRenameRule>(key: K, value: BatchRenameRule[K]) {
    setRule((current) => ({ ...current, [key]: value }));
  }

  function loadPreset(presetId: string) {
    setSelectedPresetId(presetId);
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) {
      setPresetName("");
      return;
    }
    setPresetName(preset.name);
    setRule(cloneBatchRenameRule(preset.rule));
  }

  function savePreset() {
    const name = presetName.trim() || `Preset ${presets.length + 1}`;
    if (selectedPresetId) {
      const now = Date.now();
      const nextPresets = presets.map((preset) =>
        preset.id === selectedPresetId
          ? { ...preset, name, rule: cloneBatchRenameRule(rule), updatedAt: now }
          : preset
      );
      onSavePresets(nextPresets);
      setPresetName(name);
      return;
    }
    const preset = createBatchRenamePreset(name, rule);
    onSavePresets([...presets, preset]);
    setSelectedPresetId(preset.id);
    setPresetName(preset.name);
  }

  function deletePreset() {
    if (!selectedPresetId) return;
    onSavePresets(presets.filter((preset) => preset.id !== selectedPresetId));
    setSelectedPresetId("");
    setPresetName("");
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal rename-modal" role="dialog" aria-modal="true" aria-label="Batch rename">
        <header className="modal-header">
          <div>
            <h2>Batch Rename</h2>
            <span>{paths.length} selected item(s)</span>
          </div>
          <button onClick={onClose}>Close</button>
        </header>

        <div className="rename-preset-bar">
          <label>
            Preset
            <select value={selectedPresetId} onChange={(event) => loadPreset(event.target.value)}>
              <option value="">Custom rule</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Preset name
            <input
              value={presetName}
              placeholder="Reusable rule name"
              onChange={(event) => {
                setPresetName(event.target.value);
                if (selectedPresetId && presets.every((preset) => preset.id !== selectedPresetId)) {
                  setSelectedPresetId("");
                }
              }}
            />
          </label>
          <button onClick={savePreset}>Save Preset</button>
          <button disabled={!selectedPresetId} onClick={deletePreset}>
            Delete Preset
          </button>
        </div>

        <div className="rename-form">
          <label>
            Format
            <input value={rule.pattern} onChange={(event) => updateRule("pattern", event.target.value)} />
          </label>
          <label>
            Prefix
            <input value={rule.prefix} onChange={(event) => updateRule("prefix", event.target.value)} />
          </label>
          <label>
            Suffix
            <input value={rule.suffix} onChange={(event) => updateRule("suffix", event.target.value)} />
          </label>
          <label>
            Find
            <input value={rule.find} onChange={(event) => updateRule("find", event.target.value)} />
          </label>
          <label>
            Replace
            <input value={rule.replace} onChange={(event) => updateRule("replace", event.target.value)} />
          </label>
          <label>
            Case
            <select value={rule.caseMode} onChange={(event) => updateRule("caseMode", event.target.value as BatchRenameRule["caseMode"])}>
              <option value="none">Keep</option>
              <option value="lower">Lower</option>
              <option value="upper">Upper</option>
              <option value="title">Title</option>
            </select>
          </label>
          <label>
            Start
            <input
              type="number"
              value={rule.startNumber}
              onChange={(event) => updateRule("startNumber", Number(event.target.value))}
            />
          </label>
          <label>
            Step
            <input type="number" value={rule.step} onChange={(event) => updateRule("step", Number(event.target.value))} />
          </label>
          <label>
            Padding
            <input
              type="number"
              min={1}
              max={12}
              value={rule.padLength}
              onChange={(event) => updateRule("padLength", Number(event.target.value))}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={rule.useRegex}
              onChange={(event) => updateRule("useRegex", event.target.checked)}
            />
            Regex find
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={rule.caseSensitive}
              onChange={(event) => updateRule("caseSensitive", event.target.checked)}
            />
            Case sensitive
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={rule.includeExtension}
              onChange={(event) => updateRule("includeExtension", event.target.checked)}
            />
            Process extension
          </label>
        </div>

        <p className="modal-help">Tokens: {"{name}"} original name, {"{ext}"} extension, {"{n}"} sequence, {"{date}"} today.</p>
        {error && <p className="modal-error">{error}</p>}

        <div className="preview-table">
          <div className="preview-header">
            <span>Current</span>
            <span>New</span>
            <span>Status</span>
          </div>
          {preview?.items.map((item) => (
            <div key={item.sourcePath} className={`preview-row status-${item.status}`}>
              <span title={item.sourceName}>{item.sourceName}</span>
              <span title={item.targetName}>{item.targetName}</span>
              <span>{item.message ?? item.status}</span>
            </div>
          ))}
        </div>

        <section className="rename-history" aria-label="Rename history">
          <div className="rename-history-header">
            <div>
              <strong>Rename History</strong>
              <span>{history.length} recorded operation(s)</span>
            </div>
            <button disabled={history.length === 0} onClick={onClearHistory}>
              Clear History
            </button>
          </div>
          {history.length === 0 && <p className="rename-history-empty">No batch rename operations recorded yet.</p>}
          {history.slice(0, 8).map((entry) => (
            <div key={entry.id} className="rename-history-row">
              <div>
                <strong>{formatDate(entry.performedAt)}</strong>
                <span>{entry.message}</span>
              </div>
              <span>{entry.changedCount}/{entry.itemCount} changed</span>
              <code>{entry.rule.pattern}</code>
              <small title={entry.items[0] ? `${entry.items[0].sourceName} -> ${entry.items[0].targetName}` : undefined}>
                {entry.items[0] ? `${entry.items[0].sourceName} -> ${entry.items[0].targetName}` : "No changed items"}
              </small>
            </div>
          ))}
        </section>

        <footer className="modal-footer">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!preview?.canApply} onClick={() => onApply(rule)}>
            Rename
          </button>
        </footer>
      </section>
    </div>
  );
}

function FolderSyncModal({
  api,
  panes,
  activePaneId,
  presets,
  onSavePresets,
  onClose,
  onApply
}: {
  api: SpaceApi;
  panes: PaneState[];
  activePaneId: number;
  presets: FolderSyncPreset[];
  onSavePresets: (presets: FolderSyncPreset[]) => void;
  onClose: () => void;
  onApply: (request: {
    leftPath: string;
    rightPath: string;
    refreshPaneIds: number[];
    direction: FolderSyncDirection;
    includeHidden: boolean;
    filter: string;
  }) => void;
}) {
  const defaultRightPaneId = panes.find((pane) => pane.id !== activePaneId)?.id ?? activePaneId;
  const [leftPaneId, setLeftPaneId] = useState(activePaneId);
  const [rightPaneId, setRightPaneId] = useState(defaultRightPaneId);
  const [leftPath, setLeftPath] = useState(panes.find((pane) => pane.id === activePaneId)?.path ?? "");
  const [rightPath, setRightPath] = useState(panes.find((pane) => pane.id === defaultRightPaneId)?.path ?? "");
  const [direction, setDirection] = useState<FolderSyncDirection>("updateRight");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [plan, setPlan] = useState<FolderSyncPlan | null>(null);
  const [error, setError] = useState("");

  const leftPane = panes.find((pane) => pane.id === leftPaneId);
  const rightPane = panes.find((pane) => pane.id === rightPaneId);
  const sameFolder = !!leftPath && !!rightPath && leftPath.toLowerCase() === rightPath.toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setError("");
    if (!leftPath || !rightPath || sameFolder) {
      setPlan(null);
      return;
    }
    api
      .previewFolderSync({
        leftPath,
        rightPath,
        direction,
        includeHidden,
        filter
      })
      .then((payload) => {
        if (!cancelled) setPlan(payload);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(getErrorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [api, direction, filter, includeHidden, leftPath, rightPath, sameFolder]);

  function selectPane(side: "left" | "right", paneId: number) {
    const pane = panes.find((item) => item.id === paneId);
    if (side === "left") {
      setLeftPaneId(paneId);
      if (pane) setLeftPath(pane.path);
    } else {
      setRightPaneId(paneId);
      if (pane) setRightPath(pane.path);
    }
  }

  function matchPaneId(targetPath: string, fallbackPaneId: number) {
    return panes.find((pane) => pane.path.toLowerCase() === targetPath.toLowerCase())?.id ?? fallbackPaneId;
  }

  function loadPreset(presetId: string) {
    setSelectedPresetId(presetId);
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) {
      setPresetName("");
      return;
    }
    setPresetName(preset.name);
    setLeftPath(preset.leftPath);
    setRightPath(preset.rightPath);
    setLeftPaneId(matchPaneId(preset.leftPath, leftPaneId));
    setRightPaneId(matchPaneId(preset.rightPath, rightPaneId));
    setDirection(preset.direction);
    setIncludeHidden(preset.includeHidden);
    setFilter(preset.filter);
  }

  function currentSettings() {
    return { leftPath, rightPath, direction, includeHidden, filter };
  }

  function savePreset() {
    const name = presetName.trim() || `Sync Preset ${presets.length + 1}`;
    if (selectedPresetId) {
      const now = Date.now();
      const nextPresets = presets.map((preset) =>
        preset.id === selectedPresetId ? { ...preset, ...currentSettings(), name, updatedAt: now } : preset
      );
      onSavePresets(nextPresets);
      setPresetName(name);
      return;
    }
    const preset = createFolderSyncPreset(name, currentSettings());
    onSavePresets([...presets, preset]);
    setSelectedPresetId(preset.id);
    setPresetName(preset.name);
  }

  function deletePreset() {
    if (!selectedPresetId) return;
    onSavePresets(presets.filter((preset) => preset.id !== selectedPresetId));
    setSelectedPresetId("");
    setPresetName("");
  }

  function refreshPaneIds() {
    const ids = new Set<number>();
    const matchedLeft = panes.find((pane) => pane.path.toLowerCase() === leftPath.toLowerCase());
    const matchedRight = panes.find((pane) => pane.path.toLowerCase() === rightPath.toLowerCase());
    if (matchedLeft) ids.add(matchedLeft.id);
    if (matchedRight) ids.add(matchedRight.id);
    if (leftPane) ids.add(leftPane.id);
    if (rightPane) ids.add(rightPane.id);
    return [...ids];
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal sync-modal" role="dialog" aria-modal="true" aria-label="Folder sync">
        <header className="modal-header">
          <div>
            <h2>Folder Sync</h2>
            <span>Compare two panes and copy newer or missing files.</span>
          </div>
          <button onClick={onClose}>Close</button>
        </header>

        <div className="sync-preset-bar">
          <label>
            Preset
            <select value={selectedPresetId} onChange={(event) => loadPreset(event.target.value)}>
              <option value="">Custom sync</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Preset name
            <input
              value={presetName}
              placeholder="Reusable sync name"
              onChange={(event) => setPresetName(event.target.value)}
            />
          </label>
          <button onClick={savePreset}>Save Preset</button>
          <button disabled={!selectedPresetId} onClick={deletePreset}>
            Delete Preset
          </button>
        </div>

        <div className="sync-form">
          <label>
            Left
            <select value={leftPaneId} onChange={(event) => selectPane("left", Number(event.target.value))}>
              {panes.map((pane) => (
                <option key={pane.id} value={pane.id}>
                  P{pane.id} {pathName(pane.path)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Right
            <select value={rightPaneId} onChange={(event) => selectPane("right", Number(event.target.value))}>
              {panes.map((pane) => (
                <option key={pane.id} value={pane.id}>
                  P{pane.id} {pathName(pane.path)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Left path
            <input value={leftPath} onChange={(event) => setLeftPath(event.target.value)} />
          </label>
          <label>
            Right path
            <input value={rightPath} onChange={(event) => setRightPath(event.target.value)} />
          </label>
          <label>
            Direction
            <select value={direction} onChange={(event) => setDirection(event.target.value as FolderSyncDirection)}>
              <option value="updateRight">Update right from left</option>
              <option value="updateLeft">Update left from right</option>
              <option value="updateBoth">Update both</option>
            </select>
          </label>
          <label>
            Filter
            <input value={filter} placeholder="Optional path text" onChange={(event) => setFilter(event.target.value)} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={includeHidden} onChange={(event) => setIncludeHidden(event.target.checked)} />
            Include hidden items
          </label>
        </div>

        {sameFolder && <p className="modal-error">Choose two different folders.</p>}
        {error && <p className="modal-error">{error}</p>}

        <div className="sync-summary">
          <span>{plan?.actions.length ?? 0} action(s)</span>
          <span>{plan?.skipped ?? 0} skipped</span>
        </div>

        <div className="preview-table">
          <div className="preview-header sync-header">
            <span>Action</span>
            <span>Path</span>
            <span>Reason</span>
          </div>
          {plan?.actions.slice(0, 200).map((action) => (
            <div key={`${action.type}-${action.relativePath}`} className="preview-row sync-row">
              <span>{action.type === "copyLeftToRight" ? "Left -> Right" : "Right -> Left"}</span>
              <span title={action.relativePath}>{action.relativePath}</span>
              <span>{action.reason}, {formatBytes(action.size)}</span>
            </div>
          ))}
          {plan && plan.actions.length > 200 && <p className="modal-help">Showing first 200 actions.</p>}
        </div>

        <footer className="modal-footer">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={!plan || plan.actions.length === 0 || sameFolder}
            onClick={() => onApply({ ...currentSettings(), refreshPaneIds: refreshPaneIds() })}
          >
            Sync
          </button>
        </footer>
      </section>
    </div>
  );
}

function ContextMenu({
  state,
  actionIds,
  onCopy,
  onCopyPaths,
  onSelectSameType,
  onCut,
  onPaste,
  onRename,
  onDelete,
  onHash,
  onAddToShelf,
  onReveal,
  onOpenTerminal,
  onQuickLaunch,
  canPaste,
  canAct,
  canSelectSameType
}: {
  state: ContextMenuState;
  actionIds: string[];
  onCopy: () => void;
  onCopyPaths: () => void;
  onSelectSameType: () => void;
  onCut: () => void;
  onPaste: () => void;
  onRename: () => void;
  onDelete: () => void;
  onHash: () => void;
  onAddToShelf: () => void;
  onReveal: () => void;
  onOpenTerminal: () => void;
  onQuickLaunch: () => void;
  canPaste: boolean;
  canAct: boolean;
  canSelectSameType: boolean;
}) {
  const actions: Record<string, { label: string; disabled?: boolean; onClick: () => void }> = {
    copy: { label: "Copy", disabled: !canAct, onClick: onCopy },
    copyPaths: { label: "Copy paths", disabled: !canAct, onClick: onCopyPaths },
    selectSameType: { label: "Select same type", disabled: !canSelectSameType, onClick: onSelectSameType },
    cut: { label: "Cut", disabled: !canAct, onClick: onCut },
    paste: { label: `Paste into Pane ${state.paneId}`, disabled: !canPaste, onClick: onPaste },
    rename: { label: "Rename", disabled: !canAct, onClick: onRename },
    delete: { label: "Delete", disabled: !canAct, onClick: onDelete },
    hash: { label: "Calculate SHA-256", disabled: !canAct, onClick: onHash },
    addShelf: { label: "Add to Shelf", disabled: !canAct, onClick: onAddToShelf },
    quickLaunch: { label: "Quick Launch...", onClick: onQuickLaunch },
    terminal: { label: "Open Terminal", onClick: onOpenTerminal },
    reveal: { label: "Reveal in Explorer", disabled: !canAct, onClick: onReveal }
  };
  return (
    <div className="context-menu" style={{ left: state.x, top: state.y }}>
      {actionIds.map((actionId) => {
        const action = actions[actionId];
        if (!action) return null;
        return (
          <button key={actionId} disabled={action.disabled} onClick={action.onClick}>
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

function IconButton({
  title,
  icon: Icon,
  onClick,
  disabled,
  active
}: {
  title: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""}`}
      type="button"
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
    >
      <Icon size={16} />
    </button>
  );
}
