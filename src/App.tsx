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
  FileArchive,
  FileBox,
  FileCode,
  FileCog,
  FileDigit,
  FileImage,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FileType,
  Folder,
  FolderPlus,
  Grid2X2,
  GripVertical,
  HardDrive,
  Hash as HashIcon,
  Home,
  Image,
  LayoutGrid,
  List,
  ListFilter,
  Maximize2,
  Minimize2,
  Monitor,
  MoreVertical,
  Music,
  PanelRight,
  Pencil,
  Plus,
  Presentation,
  RefreshCcw,
  Rows3,
  Scissors,
  Search,
  SlidersHorizontal,
  Star,
  Terminal,
  Trash2,
  X,
  Video,
  Braces,
  Database,
  Film
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  DriveInfo,
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
  filterVisible: boolean;
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
  entry?: FileEntry;
}

interface ArchiveBrowserState {
  archivePath: string;
  destinationPath: string;
}

interface HashCompareResult {
  entry: FileEntry;
  value?: string;
  error?: string;
}

interface PaneDragState {
  sourcePaneId: number;
  currentPaneId: number;
  startPath: string;
  startName: string;
  x: number;
  y: number;
  moved: boolean;
}

const paneIds = [1, 2, 3, 4];
const layoutModes: LayoutMode[] = ["grid", "columns", "rows", "focus"];
const sortKeys: SortKey[] = ["name", "size", "modifiedAt", "type"];
const sortLabels: Record<SortKey, string> = {
  name: "名称",
  size: "大小",
  modifiedAt: "修改时间",
  type: "类型"
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
const currentActionLayoutVersion = 6;
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
  "folderSync",
  "addShelf",
  "hashCompare",
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
  "terminal",
  "reveal"
];

type FixedContextMenuAction =
  | "open"
  | "copy"
  | "cut"
  | "paste"
  | "addShelf"
  | "bookmark"
  | "reveal"
  | "svnUpdate"
  | "svnCommit"
  | "newItem";

const fixedContextMenuGroups: Array<Array<{ id: FixedContextMenuAction; label: string }>> = [
  [
    { id: "open", label: "打开" },
    { id: "copy", label: "复制" },
    { id: "cut", label: "剪切" },
    { id: "paste", label: "粘贴" }
  ],
  [
    { id: "addShelf", label: "放入暂存架" },
    { id: "bookmark", label: "添加到快捷入口" },
    { id: "reveal", label: "资源管理器打开所在位置" }
  ],
  [
    { id: "svnUpdate", label: "SVN Update" },
    { id: "svnCommit", label: "SVN Commit" }
  ],
  [{ id: "newItem", label: "新建" }]
];
const toolbarActionCatalog = [
  { id: "newFolder", label: "新建文件夹" },
  { id: "newFile", label: "新建文件" },
  { id: "copy", label: "复制" },
  { id: "copyPaths", label: "复制路径" },
  { id: "cut", label: "剪切" },
  { id: "paste", label: "粘贴" },
  { id: "selectSameType", label: "选择同类型" },
  { id: "delete", label: "删除" },
  { id: "createZip", label: "创建 ZIP" },
  { id: "folderSync", label: "文件夹同步" },
  { id: "addShelf", label: "加入暂存架" },
  { id: "hashCompare", label: "哈希对比" },
  { id: "refresh", label: "刷新" },
  { id: "terminal", label: "Windows Terminal" },
  { id: "bookmark", label: "添加快捷入口" }
];
const primaryToolbarActionIds = new Set(["newFolder", "newFile", "copy", "cut", "paste", "delete", "refresh", "terminal"]);
const contextMenuActionCatalog = [
  { id: "copy", label: "复制" },
  { id: "copyPaths", label: "复制路径" },
  { id: "selectSameType", label: "选择同类型" },
  { id: "cut", label: "剪切" },
  { id: "paste", label: "粘贴" },
  { id: "rename", label: "重命名" },
  { id: "delete", label: "删除" },
  { id: "hash", label: "计算 SHA-256" },
  { id: "addShelf", label: "加入暂存架" },
  { id: "terminal", label: "打开终端" },
  { id: "reveal", label: "在资源管理器中显示" }
];
const hotkeyActionCatalog = [
  ...toolbarActionCatalog
];

type ActionCatalogItem = { id: string; label: string };

const defaultFileTemplates: NewFileTemplate[] = [
  {
    id: "default-blank-text",
    label: "空白文本",
    fileName: "新建文件.txt",
    content: "",
    createdAt: 0
  },
  {
    id: "default-markdown-note",
    label: "Markdown 笔记",
    fileName: "笔记-$date(yyyy-MM-dd).md",
    content: "# $date(yyyy-MM-dd)\n\n",
    createdAt: 0
  },
  {
    id: "default-word",
    label: "Word 文档",
    fileName: "新建文档.docx",
    content: "",
    createdAt: 0
  },
  {
    id: "default-excel",
    label: "Excel 工作簿",
    fileName: "新建工作簿.xlsx",
    content: "",
    createdAt: 0
  },
  {
    id: "default-powerpoint",
    label: "PowerPoint 演示文稿",
    fileName: "新建演示文稿.pptx",
    content: "",
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
    filterVisible: false,
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
  const candidates = [
    bootstrap.homePath,
    locationById.get("desktop") ?? bootstrap.homePath,
    locationById.get("downloads") ?? bootstrap.homePath,
    locationById.get("documents") ?? bootstrap.homePath,
    ...bootstrap.knownLocations.map((location) => location.path)
  ];
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(candidate);
    if (paths.length === 4) break;
  }
  while (paths.length < 4) paths.push(bootstrap.homePath);
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
    const workspace = createWorkspaceRecord("默认", createDefaultWorkspaceSnapshot(bootstrap), "default");
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

function clampPercent(value: number): number {
  return Math.max(25, Math.min(75, value));
}

function fileUrlToPath(value: string): string {
  try {
    return decodeURIComponent(new URL(value).pathname).replace(/^\/([A-Za-z]:\/)/, "$1").replace(/\//g, "\\");
  } catch {
    return value;
  }
}

function dataTransferPaths(dataTransfer: DataTransfer): string[] {
  const rawPaths = dataTransfer.getData("application/x-space-paths");
  if (rawPaths) {
    try {
      return JSON.parse(rawPaths) as string[];
    } catch {
      return [];
    }
  }
  const filePaths = [...dataTransfer.files]
    .map((file) => (file as File & { path?: string }).path || file.webkitRelativePath)
    .filter((path): path is string => !!path);
  if (filePaths.length) return filePaths;
  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    return uriList
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map(fileUrlToPath);
  }
  const plainText = dataTransfer.getData("text/plain");
  return plainText ? plainText.split(/\r?\n/).filter(Boolean) : [];
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
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [colorRulesOpen, setColorRulesOpen] = useState(false);
  const [quickLaunchMenuOpen, setQuickLaunchMenuOpen] = useState(false);
  const [quickLaunchEditorOpen, setQuickLaunchEditorOpen] = useState(false);
  const [actionSettingsOpen, setActionSettingsOpen] = useState(false);
  const [batchRenameOpen, setBatchRenameOpen] = useState(false);
  const [folderSyncOpen, setFolderSyncOpen] = useState(false);
  const [workspaceRenameOpen, setWorkspaceRenameOpen] = useState(false);
  const [toolbarOverflowOpen, setToolbarOverflowOpen] = useState(false);
  const [hashCompareOpen, setHashCompareOpen] = useState(false);
  const [archiveBrowser, setArchiveBrowser] = useState<ArchiveBrowserState | null>(null);
  const [paneDragState, setPaneDragState] = useState<PaneDragState | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [paneGridSize, setPaneGridSize] = useState({ column: 50, row: 50 });
  const toastCounter = useRef(0);
  const addressSuggestionCounters = useRef<Record<number, number>>({});
  const paneLoadCounters = useRef<Record<number, number>>({});
  const paneAreaRef = useRef<HTMLElement | null>(null);

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
    if (!contextMenu) return;
    const closeContextMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeContextMenu();
    };
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!toolbarOverflowOpen) return;
    const closeToolbarOverflow = () => setToolbarOverflowOpen(false);
    window.addEventListener("click", closeToolbarOverflow);
    window.addEventListener("keydown", closeToolbarOverflow);
    return () => {
      window.removeEventListener("click", closeToolbarOverflow);
      window.removeEventListener("keydown", closeToolbarOverflow);
    };
  }, [toolbarOverflowOpen]);

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

  function togglePaneFilter(paneId: number) {
    updatePane(paneId, (pane) => ({ ...pane, filterVisible: !pane.filterVisible }));
  }

  function paneIdAtPoint(clientX: number, clientY: number): number | null {
    const element = document.elementFromPoint(clientX, clientY);
    const paneElement = element?.closest?.(".explorer-pane");
    const rawPaneId = paneElement?.getAttribute("data-pane-id");
    const paneId = rawPaneId ? Number(rawPaneId) : Number(paneElement?.getAttribute("aria-label")?.match(/\d+/)?.[0]);
    return Number.isFinite(paneId) && paneId > 0 ? paneId : null;
  }

  function swapPaneContents(
    sourcePaneId: number,
    targetPaneId: number,
    options: { announce?: boolean; activate?: boolean } = { announce: true, activate: true }
  ) {
    if (sourcePaneId === targetPaneId) return;
    setPanes((current) => {
      const sourcePane = current.find((pane) => pane.id === sourcePaneId);
      const targetPane = current.find((pane) => pane.id === targetPaneId);
      if (!sourcePane || !targetPane) return current;
      return current.map((pane) => {
        if (pane.id === sourcePaneId) return { ...targetPane, id: sourcePaneId };
        if (pane.id === targetPaneId) return { ...sourcePane, id: targetPaneId };
        return pane;
      });
    });
    if (options.activate ?? true) setActivePaneId(targetPaneId);
    setPreviewPath(null);
    setHashLine("");
    if (options.announce ?? true) showToast("success", `已交换 P${sourcePaneId} 和 P${targetPaneId}。`);
  }

  function beginPanePointerSwap(sourcePaneId: number, event: React.MouseEvent | React.PointerEvent) {
    if ("pointerType" in event && event.pointerType === "mouse" && event.type === "pointerdown") return;
    if ("button" in event && event.button !== 0) return;
    const sourcePane = panes.find((pane) => pane.id === sourcePaneId);
    if (!sourcePane) return;
    event.preventDefault();
    event.stopPropagation();
    const moveEventName = "pointerId" in event ? "pointermove" : "mousemove";
    const upEventName = "pointerId" in event ? "pointerup" : "mouseup";
    let targetPaneId = sourcePaneId;
    let moved = false;
    setPaneDragState({
      sourcePaneId,
      currentPaneId: sourcePaneId,
      startPath: sourcePane.path,
      startName: pathName(sourcePane.path),
      x: event.clientX,
      y: event.clientY,
      moved: false
    });

    const move = (moveEvent: PointerEvent | MouseEvent) => {
      targetPaneId = paneIdAtPoint(moveEvent.clientX, moveEvent.clientY) ?? targetPaneId;
      moved = targetPaneId !== sourcePaneId;
      setPaneDragState((current) =>
        current
          ? {
              ...current,
              currentPaneId: targetPaneId,
              x: moveEvent.clientX,
              y: moveEvent.clientY,
              moved
            }
          : current
      );
    };

    const finish = () => {
      window.removeEventListener(moveEventName, move);
      window.removeEventListener(upEventName, finish);
      setPaneDragState(null);
      if (moved) {
        swapPaneContents(sourcePaneId, targetPaneId, { announce: false, activate: true });
        showToast("success", `已移动 P${sourcePaneId} 到 P${targetPaneId}。`);
      }
    };

    window.addEventListener(moveEventName, move);
    window.addEventListener(upEventName, finish, { once: true });
  }

  function beginPaneMouseSwap(sourcePaneId: number, event: React.MouseEvent) {
    beginPanePointerSwap(sourcePaneId, event);
  }

  function beginPaneTouchSwap(sourcePaneId: number, event: React.PointerEvent) {
    beginPanePointerSwap(sourcePaneId, event);
  }

  function beginPaneGridResize(axis: "column" | "row", event: React.PointerEvent | React.MouseEvent) {
    const area = paneAreaRef.current;
    if (!area) return;
    event.preventDefault();
    const rect = area.getBoundingClientRect();
    const moveEventName = "pointerId" in event ? "pointermove" : "mousemove";
    const upEventName = "pointerId" in event ? "pointerup" : "mouseup";
    const updateFromPointer = (pointerEvent: PointerEvent | MouseEvent) => {
      const rawPercent =
        axis === "column"
          ? ((pointerEvent.clientX - rect.left) / rect.width) * 100
          : ((pointerEvent.clientY - rect.top) / rect.height) * 100;
      const percent = clampPercent(rawPercent);
      setPaneGridSize((current) => ({ ...current, [axis]: percent }));
    };
    const stop = () => {
      window.removeEventListener(moveEventName, updateFromPointer);
      window.removeEventListener(upEventName, stop);
    };
    window.addEventListener(moveEventName, updateFromPointer);
    window.addEventListener(upEventName, stop);
  }

  async function addBookmarkPath(targetPath: string) {
    const trimmedPath = targetPath.trim();
    if (!trimmedPath) return;
    try {
      const payload = await api.listDirectory(trimmedPath);
      const systemShortcutExists =
        bootstrap?.knownLocations.some((location) => location.path.toLowerCase() === payload.path.toLowerCase()) ?? false;
      const exists = systemShortcutExists || bookmarks.some((bookmark) => bookmark.path.toLowerCase() === payload.path.toLowerCase());
      if (exists) {
        showToast("info", "快捷入口已存在。");
        return;
      }
      setBookmarks((current) => [
        ...current,
        { id: `bookmark-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, label: pathName(payload.path), path: payload.path, icon: "star" }
      ]);
      showToast("success", "已添加快捷入口。");
    } catch {
      showToast("error", "只能把文件夹添加到快捷入口。");
    }
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
    const record = createWorkspaceRecord(`工作区 ${workspaces.length + 1}`, createDefaultWorkspaceSnapshot(bootstrap));
    setWorkspaces((current) => [...saveCurrentWorkspaceToList(current), record]);
    await loadWorkspaceRecord(record);
    showToast("success", "Workspace created.");
  }

  async function cloneWorkspace() {
    const sourceName = activeWorkspace?.name ?? "Workspace";
    const record = createWorkspaceRecord(`${sourceName} 副本`, getCurrentWorkspaceSnapshot());
    setWorkspaces((current) => [...saveCurrentWorkspaceToList(current), record]);
    await loadWorkspaceRecord(record);
    showToast("success", "Workspace cloned.");
  }

  function requestRenameWorkspace() {
    if (!activeWorkspace) return;
    setWorkspaceRenameOpen(true);
  }

  function saveWorkspaceName(name: string) {
    if (!activeWorkspace) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const nextWorkspaces = workspaces.map((workspace) =>
      workspace.id === activeWorkspace.id ? { ...workspace, name: trimmedName } : workspace
    );
    const document = createWorkspaceDocument(getCurrentWorkspaceSnapshot(), nextWorkspaces);
    if (!document) return;
    setWorkspaces(document.workspaces);
    void api.saveWorkspace(document);
    setWorkspaceRenameOpen(false);
    showToast("success", "工作区已重命名。");
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

  function contextTargetPath(menu: ContextMenuState): string {
    const pane = paneById(menu.paneId);
    return menu.entry?.path ?? pane?.path ?? "";
  }

  function contextBookmarkPath(menu: ContextMenuState): string {
    const pane = paneById(menu.paneId);
    if (menu.entry?.isDirectory) return menu.entry.path;
    return menu.entry?.parentPath ?? pane?.path ?? "";
  }

  function openContextTarget(menu: ContextMenuState) {
    const pane = paneById(menu.paneId);
    if (!pane) return;
    if (menu.entry) {
      openEntry(menu.paneId, menu.entry);
      return;
    }
    void perform("Open", () => api.openPath(pane.path), []);
  }

  function runContextSvnCommand(menu: ContextMenuState, command: "update" | "commit") {
    const targetPath = contextTargetPath(menu);
    if (!targetPath) return;
    const label = command === "update" ? "SVN Update" : "SVN Commit";
    void perform(label, () => api.runSvnCommand({ path: targetPath, command }), [menu.paneId]);
  }

  function runContextMenuAction(actionId: FixedContextMenuAction) {
    const menu = contextMenu;
    if (!menu) return;
    setContextMenu(null);
    setActivePaneId(menu.paneId);
    switch (actionId) {
      case "open":
        openContextTarget(menu);
        break;
      case "copy":
        copySelection("copy", menu.paneId);
        break;
      case "cut":
        copySelection("cut", menu.paneId);
        break;
      case "paste":
        void pasteInto(menu.paneId);
        break;
      case "addShelf":
        addSelectionToShelf(menu.paneId);
        break;
      case "bookmark":
        void addBookmarkPath(contextBookmarkPath(menu));
        break;
      case "reveal": {
        const targetPath = contextTargetPath(menu);
        if (targetPath) void perform("Reveal", () => api.revealPath(targetPath), []);
        break;
      }
      case "svnUpdate":
        runContextSvnCommand(menu, "update");
        break;
      case "svnCommit":
        runContextSvnCommand(menu, "commit");
        break;
      case "newItem":
        setNewFileOpen(true);
        break;
      default:
        break;
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

  async function createFolderFromName(name: string) {
    if (!activePane) return;
    const parentPath = activePane.path;
    const refreshIds = operationRefreshIds([activePane.id], [parentPath]);
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const result = await perform("Create folder", () => api.createFolder({ parentPath, name: trimmedName }), refreshIds);
    if (result) setNewFolderOpen(false);
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
      setInspectorOpen(true);
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

  async function addPathsToShelf(paths: string[]) {
    const normalizedPaths = paths.map((targetPath) => targetPath.trim()).filter(Boolean);
    if (!normalizedPaths.length) return;
    const entryByPath = new Map(panes.flatMap((pane) => pane.entries.map((entry) => [entry.path.toLowerCase(), entry] as const)));
    const seen = new Set(stashItems.map((item) => item.path.toLowerCase()));
    const additions: StashShelfItem[] = [];

    for (const targetPath of normalizedPaths) {
      const key = targetPath.toLowerCase();
      if (seen.has(key)) continue;
      const entry = entryByPath.get(key);
      if (entry) {
        additions.push({
          path: entry.path,
          label: entry.name,
          isDirectory: entry.isDirectory,
          size: entry.size,
          addedAt: Date.now()
        });
        seen.add(key);
        continue;
      }

      try {
        const payload = await api.listDirectory(targetPath);
        additions.push({
          path: payload.path,
          label: pathName(payload.path),
          isDirectory: true,
          size: 0,
          addedAt: Date.now()
        });
        seen.add(payload.path.toLowerCase());
      } catch {
        additions.push({
          path: targetPath,
          label: pathName(targetPath),
          isDirectory: false,
          size: 0,
          addedAt: Date.now()
        });
        seen.add(key);
      }
    }

    if (additions.length) setStashItems((current) => [...current, ...additions]);
    showToast(
      additions.length ? "success" : "info",
      additions.length ? `Added ${additions.length} item(s) to shelf.` : "Dropped item is already on the shelf."
    );
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
    setInspectorOpen(true);
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
    const sourcePaneId = Number(event.dataTransfer.getData("application/x-space-pane-id"));
    if (sourcePaneId) {
      swapPaneContents(sourcePaneId, targetPaneId);
      return;
    }
    const targetPane = panes.find((pane) => pane.id === targetPaneId);
    if (!targetPane) return;
    const sources = dataTransferPaths(event.dataTransfer);
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
    newFolder: { title: "新建文件夹", icon: FolderPlus, onClick: () => setNewFolderOpen(true) },
    newFile: { title: "新建文件", icon: FilePlus2, onClick: () => setNewFileOpen(true) },
    copy: { title: "复制", icon: Copy, onClick: () => copySelection("copy"), disabled: !activePane?.selectedPaths.length },
    copyPaths: { title: "复制路径", icon: ClipboardCopy, onClick: () => void copySelectedPaths(), disabled: !activePane?.selectedPaths.length },
    cut: { title: "剪切", icon: Scissors, onClick: () => copySelection("cut"), disabled: !activePane?.selectedPaths.length },
    paste: { title: "粘贴", icon: FileText, onClick: () => void pasteInto(), disabled: !clipboard?.paths.length },
    selectSameType: { title: "选择同类型", icon: ListFilter, onClick: selectSameType, disabled: selectedEntries.length === 0 },
    delete: { title: "删除", icon: Trash2, onClick: () => void deleteSelected(), disabled: !activePane?.selectedPaths.length },
    createZip: { title: "创建 ZIP", icon: Archive, onClick: () => void createArchiveFromSelection(), disabled: !activePane?.selectedPaths.length },
    folderSync: { title: "文件夹同步", icon: RefreshCcw, onClick: () => setFolderSyncOpen(true), disabled: !activePane },
    addShelf: { title: "加入暂存架", icon: Plus, onClick: addSelectionToShelf, disabled: !activePane?.selectedPaths.length },
    hashCompare: {
      title: "哈希对比",
      icon: HashIcon,
      onClick: () => setHashCompareOpen(true),
      disabled: !selectedEntries.some((entry) => entry.isFile),
      active: hashCompareOpen
    },
    refresh: { title: "刷新", icon: RefreshCcw, onClick: () => void refreshPane() },
    terminal: { title: "Windows Terminal", icon: Terminal, onClick: () => activePane && void perform("Windows Terminal", () => api.openTerminal(activePane.path), []) },
    bookmark: { title: "添加快捷入口", icon: Star, onClick: addBookmark }
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

  const paneAreaStyle: CSSProperties | undefined =
    layout === "grid"
      ? {
          gridTemplateColumns: `minmax(240px, ${paneGridSize.column}fr) minmax(240px, ${100 - paneGridSize.column}fr)`,
          gridTemplateRows: `minmax(220px, ${paneGridSize.row}fr) minmax(220px, ${100 - paneGridSize.row}fr)`
        }
      : undefined;
  const contextMenuPane = contextMenu ? paneById(contextMenu.paneId) : undefined;
  const contextSelectionCount = contextMenuPane?.selectedPaths.length ?? 0;
  const toolbarPrimaryIds = toolbarActionIds.filter((actionId) => primaryToolbarActionIds.has(actionId) && toolbarActions[actionId]);
  const toolbarOverflowIds = toolbarActionIds.filter((actionId) => !primaryToolbarActionIds.has(actionId) && toolbarActions[actionId]);

  return (
    <main className={`app-shell ${inspectorOpen ? "inspector-open" : ""}`} onKeyDown={handleKeyDown} tabIndex={-1}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Grid2X2 size={20} />
          </div>
          <div>
            <h1>Space</h1>
            <span>四窗格资源管理器</span>
          </div>
        </div>

        <div className="toolbar" role="toolbar" aria-label="文件操作">
          {toolbarPrimaryIds.map((actionId) => {
            const action = toolbarActions[actionId];
            return (
              <IconButton
                key={actionId}
                title={action.title}
                onClick={action.onClick}
                icon={action.icon}
                disabled={action.disabled}
                active={action.active}
                showLabel
              />
            );
          })}
          {toolbarOverflowIds.length > 0 && (
            <div className="toolbar-overflow" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className={`icon-button toolbar-more-button ${toolbarOverflowOpen ? "active" : ""}`}
                title="更多操作"
                aria-label="更多操作"
                onClick={(event) => {
                  event.stopPropagation();
                  setToolbarOverflowOpen((open) => !open);
                }}
              >
                <MoreVertical size={16} />
                <span className="icon-button-label">更多</span>
              </button>
              {toolbarOverflowOpen && (
                <div className="toolbar-overflow-menu" role="menu" aria-label="更多文件操作">
                  {toolbarOverflowIds.map((actionId) => {
                    const action = toolbarActions[actionId];
                    const OverflowIcon = action.icon;
                    return (
                      <button
                        key={actionId}
                        type="button"
                        role="menuitem"
                        disabled={action.disabled}
                        onClick={() => {
                          if (action.disabled) return;
                          setToolbarOverflowOpen(false);
                          action.onClick();
                        }}
                      >
                        <OverflowIcon size={15} />
                        <span>{action.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="layout-switcher" aria-label="Layout">
          <IconButton title="自定义动作" onClick={() => setActionSettingsOpen(true)} icon={SlidersHorizontal} />
          <IconButton title="网格布局" onClick={() => setLayout("grid")} icon={Grid2X2} active={layout === "grid"} />
          <IconButton title="列布局" onClick={() => setLayout("columns")} icon={Columns3} active={layout === "columns"} />
          <IconButton title="行布局" onClick={() => setLayout("rows")} icon={Rows3} active={layout === "rows"} />
          <IconButton title="聚焦当前窗格" onClick={() => setLayout("focus")} icon={PanelRight} active={layout === "focus"} />
          <IconButton title="检查器" onClick={() => setInspectorOpen((open) => !open)} icon={MoreVertical} active={inspectorOpen} />
        </div>
        <WindowControls api={api} />
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
        onRename={requestRenameWorkspace}
        onDelete={() => void deleteWorkspace()}
      />

      <section className={`workspace ${inspectorOpen ? "inspector-visible" : ""}`}>
        <Sidebar
          bootstrap={bootstrap}
          bookmarks={bookmarks}
          stashItems={stashItems}
          canAddSelection={!!activePane?.selectedPaths.length}
          onOpen={(targetPath) => activePane && void loadPane(activePane.id, targetPath)}
          onAddBookmarkPath={(targetPath) => void addBookmarkPath(targetPath)}
          onRemoveBookmark={(id) => setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id))}
          onAddSelectionToShelf={addSelectionToShelf}
          onAddPathsToShelf={(paths) => void addPathsToShelf(paths)}
          onPreviewShelfItem={(targetPath) => {
            setPreviewPath(targetPath);
            setHashLine("");
            setInspectorOpen(true);
          }}
          onRemoveShelfItem={(targetPath) =>
            setStashItems((current) => current.filter((item) => item.path.toLowerCase() !== targetPath.toLowerCase()))
          }
          onClearShelf={() => setStashItems([])}
          onCopyShelf={() => void transferShelf("copy")}
          onMoveShelf={() => void transferShelf("cut")}
          onHashShelf={() => void hashShelf()}
        />

        <section ref={paneAreaRef} className={`pane-area layout-${layout}`} aria-label="Explorer panes" style={paneAreaStyle}>
          {panes.map((pane) => (
            <ExplorerPane
              key={pane.id}
              pane={pane}
              entries={visibleEntries(pane)}
              colorRules={colorRules}
              addressSuggestions={addressSuggestions[pane.id] ?? []}
              active={pane.id === activePaneId}
              dragTarget={paneDragState?.currentPaneId === pane.id && paneDragState.sourcePaneId !== pane.id}
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
              onToggleFilter={() => togglePaneFilter(pane.id)}
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
                event.stopPropagation();
                setActivePaneId(pane.id);
                if (entry && !containsPath(pane.selectedPaths, entry.path)) {
                  selectEntry(pane.id, entry, event, visibleEntries(pane));
                }
                setContextMenu({ x: event.clientX, y: event.clientY, paneId: pane.id, entry });
              }}
              onDrop={(event) => handleDrop(event, pane.id)}
              onPaneDragStart={(event) => {
                event.dataTransfer.setData("application/x-space-pane-id", String(pane.id));
                event.dataTransfer.effectAllowed = "move";
              }}
              onPaneMouseDown={(event) => beginPaneMouseSwap(pane.id, event)}
              onPanePointerDown={(event) => beginPaneTouchSwap(pane.id, event)}
              onDragStart={(event, entry) => {
                const payload = containsPath(pane.selectedPaths, entry.path) ? pane.selectedPaths : [entry.path];
                event.dataTransfer.setData("application/x-space-paths", JSON.stringify(payload));
              }}
            />
          ))}
          {layout === "grid" && (
            <>
              <div
                className="pane-grid-splitter pane-grid-splitter-vertical"
                style={{ left: `${paneGridSize.column}%` }}
                onPointerDown={(event) => beginPaneGridResize("column", event)}
                onMouseDown={(event) => beginPaneGridResize("column", event)}
                role="separator"
                aria-label="调整窗格列宽"
              />
              <div
                className="pane-grid-splitter pane-grid-splitter-horizontal"
                style={{ top: `${paneGridSize.row}%` }}
                onPointerDown={(event) => beginPaneGridResize("row", event)}
                onMouseDown={(event) => beginPaneGridResize("row", event)}
                role="separator"
                aria-label="调整窗格行高"
              />
            </>
          )}
        </section>

        {inspectorOpen && (
          <Inspector
            targetPath={previewTarget ?? null}
            api={api}
            hashLine={hashLine}
            onHash={() => void calculateSelectedHash("sha256")}
            onReveal={() => previewTarget && void perform("Reveal", () => api.revealPath(previewTarget), [])}
          />
        )}
      </section>

      {paneDragState && (
        <div className="pane-drag-ghost" style={{ transform: `translate3d(${paneDragState.x + 14}px, ${paneDragState.y + 14}px, 0)` }}>
          <span>P{paneDragState.sourcePaneId}</span>
          <strong>{paneDragState.startName}</strong>
          <small>{paneDragState.startPath}</small>
        </div>
      )}

      {contextMenu && (
        <FixedContextMenu
          menu={contextMenu}
          selectedCount={contextSelectionCount}
          canPaste={!!clipboard?.paths.length}
          onAction={runContextMenuAction}
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

      {newFolderOpen && activePane && (
        <NewFolderModal
          destinationPath={activePane.path}
          onClose={() => setNewFolderOpen(false)}
          onCreate={(name) => void createFolderFromName(name)}
        />
      )}

      {workspaceRenameOpen && activeWorkspace && (
        <WorkspaceRenameModal
          workspace={activeWorkspace}
          onClose={() => setWorkspaceRenameOpen(false)}
          onSave={saveWorkspaceName}
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

function FixedContextMenu({
  menu,
  selectedCount,
  canPaste,
  onAction
}: {
  menu: ContextMenuState;
  selectedCount: number;
  canPaste: boolean;
  onAction: (actionId: FixedContextMenuAction) => void;
}) {
  const left = Math.max(6, Math.min(menu.x, window.innerWidth - 254));
  const top = Math.max(6, Math.min(menu.y, window.innerHeight - 292));
  const disabledByAction: Partial<Record<FixedContextMenuAction, boolean>> = {
    copy: selectedCount === 0,
    cut: selectedCount === 0,
    paste: !canPaste,
    addShelf: selectedCount === 0
  };

  return (
    <div
      className="context-menu"
      style={{ left, top }}
      role="menu"
      aria-label="文件操作菜单"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {fixedContextMenuGroups.map((group, groupIndex) => (
        <Fragment key={`group-${groupIndex}`}>
          {groupIndex > 0 && <hr />}
          {group.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={disabledByAction[item.id]}
              onClick={() => onAction(item.id)}
            >
              {item.label}
            </button>
          ))}
        </Fragment>
      ))}
    </div>
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
    <section className="quick-launch-panel" aria-label="快速启动">
      <div className="quick-launch-summary">
        <strong>快速启动</strong>
        <span title={currentPath}>{selectedCount ? `已选 ${selectedCount} 项` : pathName(currentPath)}</span>
      </div>
      <div className="quick-launch-actions">
        {enabledItems.map((item) => (
          <button key={item.id} onClick={() => onRun(item)} title={item.command}>
            <Terminal size={15} />
            <span>{item.label}</span>
          </button>
        ))}
        {enabledItems.length === 0 && <span className="quick-launch-empty">没有启用的启动项。</span>}
      </div>
      <button className="quick-launch-manage" onClick={onManage}>
        管理
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
      <section className="modal quick-launch-modal" role="dialog" aria-modal="true" aria-label="快速启动设置">
        <header className="modal-header">
          <div>
            <h2>快速启动</h2>
            <span>从当前窗格运行应用、命令或快捷方式。</span>
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
                <Terminal size={16} />
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
  onAddBookmarkPath,
  onRemoveBookmark,
  onAddSelectionToShelf,
  onAddPathsToShelf,
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
  onAddBookmarkPath: (path: string) => void;
  onRemoveBookmark: (id: string) => void;
  onAddSelectionToShelf: () => void;
  onAddPathsToShelf: (paths: string[]) => void;
  onPreviewShelfItem: (path: string) => void;
  onRemoveShelfItem: (path: string) => void;
  onClearShelf: () => void;
  onCopyShelf: () => void;
  onMoveShelf: () => void;
  onHashShelf: () => void;
}) {
  const systemShortcutKeys = new Set(bootstrap.knownLocations.map((location) => location.path.toLowerCase()));
  const shortcutRows = [
    ...bootstrap.knownLocations.map((location) => ({ location, removable: false })),
    ...bookmarks
      .filter((bookmark) => !systemShortcutKeys.has(bookmark.path.toLowerCase()))
      .map((location) => ({ location, removable: true }))
  ];

  return (
    <aside className="sidebar">
      <StashShelf
        items={stashItems}
        canAddSelection={canAddSelection}
        onAddSelection={onAddSelectionToShelf}
        onAddPaths={onAddPathsToShelf}
        onPreviewItem={onPreviewShelfItem}
        onRemoveItem={onRemoveShelfItem}
        onClear={onClearShelf}
        onCopy={onCopyShelf}
        onMove={onMoveShelf}
        onHash={onHashShelf}
      />
      <section
        className="shortcut-section"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "link";
        }}
        onDrop={(event) => {
          event.preventDefault();
          for (const targetPath of dataTransferPaths(event.dataTransfer)) {
            onAddBookmarkPath(targetPath);
          }
        }}
      >
        <h2>快捷入口</h2>
        {shortcutRows.length === 0 && <p className="empty-note">把任意文件夹拖到这里，或点击星标添加当前窗格。</p>}
        {shortcutRows.map(({ location, removable }) => (
          <div key={`${removable ? "bookmark" : "system"}-${location.id}`} className="bookmark-row">
            <SidebarItem location={location} onOpen={onOpen} />
            {removable ? (
              <button className="ghost-mini" title="移除快捷入口" onClick={() => onRemoveBookmark(location.id)}>
                x
              </button>
            ) : (
              <span className="system-shortcut-tag" title="来自 Windows 快速访问">
                Win
              </span>
            )}
          </div>
        ))}
      </section>
      <section>
        <h2>磁盘</h2>
        {bootstrap.drives.map((drive) => (
          <DriveSidebarItem key={drive.path} drive={drive} onOpen={onOpen} />
        ))}
      </section>
    </aside>
  );
}

function StashShelf({
  items,
  canAddSelection,
  onAddSelection,
  onAddPaths,
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
  onAddPaths: (paths: string[]) => void;
  onPreviewItem: (path: string) => void;
  onRemoveItem: (path: string) => void;
  onClear: () => void;
  onCopy: () => void;
  onMove: () => void;
  onHash: () => void;
}) {
  const fileCount = items.filter((item) => !item.isDirectory).length;
  return (
    <section
      className="stash-section"
      aria-label="Stash Shelf"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        onAddPaths(dataTransferPaths(event.dataTransfer));
      }}
    >
      <div className="section-heading-row">
        <h2>暂存架</h2>
        <span>{items.length}</span>
      </div>
      <div className="stash-actions">
        <button onClick={onAddSelection} disabled={!canAddSelection}>加入</button>
        <button onClick={onCopy} disabled={!items.length}>复制</button>
        <button onClick={onMove} disabled={!items.length}>移动</button>
        <button onClick={onHash} disabled={!fileCount}>哈希</button>
        <button onClick={onClear} disabled={!items.length}>清空</button>
      </div>
      {items.length === 0 && <p className="empty-note">从任意窗格收集文件，再统一复制或移动。</p>}
      <div className="stash-list">
        {items.map((item) => (
          <div key={item.path} className="stash-row">
            <button className="stash-item" title={item.path} onClick={() => onPreviewItem(item.path)}>
              {item.isDirectory ? <Folder size={15} /> : <FileIcon entry={{ extension: fileExtensionFromName(item.label), isDirectory: false, name: item.label }} size={15} />}
              <span>{item.label}</span>
              <small>{item.isDirectory ? "文件夹" : formatBytes(item.size)}</small>
            </button>
            <button className="ghost-mini" title="从暂存架移除" onClick={() => onRemoveItem(item.path)}>
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
        <IconButton title="新建工作区" onClick={onNew} icon={Plus} />
        <IconButton title="复制工作区" onClick={onClone} icon={Copy} disabled={!activeWorkspaceId} />
        <IconButton title="重命名工作区" onClick={onRename} icon={Pencil} disabled={!activeWorkspaceId} />
        <IconButton title="删除工作区" onClick={onDelete} icon={Trash2} disabled={workspaces.length <= 1} />
      </div>
    </nav>
  );
}

function WindowControls({ api }: { api: SpaceApi }) {
  return (
    <div className="window-controls" aria-label="窗口控制">
      <button type="button" title="最小化" aria-label="最小化" onClick={() => void api.minimizeWindow?.()}>
        <Minimize2 size={14} />
      </button>
      <button type="button" title="最大化/还原" aria-label="最大化/还原" onClick={() => void api.toggleMaximizeWindow?.()}>
        <Maximize2 size={14} />
      </button>
      <button type="button" title="关闭" aria-label="关闭" className="window-close" onClick={() => void api.closeWindow?.()}>
        <X size={15} />
      </button>
    </div>
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

function DriveSidebarItem({ drive, onOpen }: { drive: DriveInfo; onOpen: (path: string) => void }) {
  const hasUsage = typeof drive.totalBytes === "number" && drive.totalBytes > 0 && typeof drive.freeBytes === "number";
  const usedBytes = hasUsage ? Math.max(0, (drive.totalBytes ?? 0) - (drive.freeBytes ?? 0)) : 0;
  const usagePercent = hasUsage ? Math.max(0, Math.min(100, (usedBytes / (drive.totalBytes ?? 1)) * 100)) : 0;
  const displayName = drive.label && drive.label !== drive.name ? `${drive.label} (${drive.name})` : drive.name;
  const usageLabel = hasUsage ? `${formatBytes(usedBytes)} / ${formatBytes(drive.totalBytes ?? 0)} 已用` : drive.path;

  return (
    <button className="sidebar-item drive-item" title={`${displayName} ${drive.path}`} onClick={() => onOpen(drive.path)}>
      <HardDrive size={16} />
      <span>{displayName}</span>
      <small>{usageLabel}</small>
      <span className="drive-progress" aria-label={`${displayName} 占用 ${Math.round(usagePercent)}%`}>
        <span style={{ width: `${usagePercent}%` }} />
      </span>
    </button>
  );
}

function fileExtensionFromName(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index).toLowerCase() : "";
}

function FileIcon({
  entry,
  size = 16
}: {
  entry: Pick<FileEntry, "isDirectory" | "name" | "extension"> & Partial<Pick<FileEntry, "isSymlink">>;
  size?: number;
}) {
  if (entry.isDirectory) return <Folder className="file-glyph folder" size={size} />;
  if (entry.isSymlink) return <ExternalLink className="file-glyph shortcut" size={size} />;
  const name = entry.name.toLowerCase();
  const extension = (entry.extension || fileExtensionFromName(entry.name)).toLowerCase();
  const fullExtension = name.endsWith(".tar.gz") ? ".tar.gz" : extension;
  const archiveExtensions = new Set([".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".tar.gz"]);
  const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".ico", ".psd"]);
  const audioExtensions = new Set([".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma"]);
  const videoExtensions = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".wmv", ".m4v"]);
  const spreadsheetExtensions = new Set([".xls", ".xlsx", ".xlsm", ".csv", ".tsv", ".ods"]);
  const documentExtensions = new Set([".txt", ".md", ".doc", ".docx", ".rtf", ".odt", ".pdf"]);
  const presentationExtensions = new Set([".ppt", ".pptx", ".odp"]);
  const codeExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".vue", ".py", ".cs", ".cpp", ".c", ".h", ".hpp", ".java", ".go", ".rs", ".lua", ".php", ".rb", ".swift", ".kt", ".css", ".scss", ".less", ".xml", ".html"]);
  const configExtensions = new Set([".ini", ".cfg", ".conf", ".yaml", ".yml", ".toml", ".env", ".editorconfig"]);
  const executableExtensions = new Set([".exe", ".msi", ".bat", ".cmd", ".ps1", ".com", ".appx"]);
  const databaseExtensions = new Set([".db", ".sqlite", ".sqlite3", ".mdb", ".accdb"]);

  let Icon: LucideIcon = File;
  let kind = "generic";
  if (archiveExtensions.has(fullExtension)) {
    Icon = FileArchive;
    kind = "archive";
  } else if (imageExtensions.has(extension)) {
    Icon = FileImage;
    kind = "image";
  } else if (audioExtensions.has(extension)) {
    Icon = Music;
    kind = "audio";
  } else if (videoExtensions.has(extension)) {
    Icon = Film;
    kind = "video";
  } else if (spreadsheetExtensions.has(extension)) {
    Icon = FileSpreadsheet;
    kind = "spreadsheet";
  } else if (presentationExtensions.has(extension)) {
    Icon = Presentation;
    kind = "presentation";
  } else if (extension === ".json" || extension === ".jsonc") {
    Icon = Braces;
    kind = "json";
  } else if (databaseExtensions.has(extension)) {
    Icon = Database;
    kind = "database";
  } else if (codeExtensions.has(extension)) {
    Icon = FileCode;
    kind = "code";
  } else if (configExtensions.has(extension)) {
    Icon = FileCog;
    kind = "config";
  } else if (executableExtensions.has(extension)) {
    Icon = FileBox;
    kind = "executable";
  } else if (/^\.\d+$/.test(extension)) {
    Icon = FileDigit;
    kind = "numbered";
  } else if (documentExtensions.has(extension)) {
    Icon = extension === ".pdf" ? FileType : FileText;
    kind = extension === ".pdf" ? "pdf" : "document";
  }

  return <Icon className={`file-glyph ${kind}`} size={size} />;
}

function ExplorerPane({
  pane,
  entries,
  colorRules,
  addressSuggestions,
  active,
  dragTarget,
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
  onToggleFilter,
  onSort,
  onViewMode,
  onSelect,
  onOpen,
  onContextMenu,
  onDrop,
  onPaneDragStart,
  onPaneMouseDown,
  onPanePointerDown,
  onDragStart,
}: {
  pane: PaneState;
  entries: FileEntry[];
  colorRules: ColorRule[];
  addressSuggestions: PathSuggestion[];
  active: boolean;
  dragTarget: boolean;
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
  onToggleFilter: () => void;
  onSort: (sortKey: SortKey) => void;
  onViewMode: (mode: ViewMode) => void;
  onSelect: (entry: FileEntry, event: React.MouseEvent, entries: FileEntry[]) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (event: React.MouseEvent, entry?: FileEntry) => void;
  onDrop: (event: React.DragEvent) => void;
  onPaneDragStart: (event: React.DragEvent) => void;
  onPaneMouseDown: (event: React.MouseEvent) => void;
  onPanePointerDown: (event: React.PointerEvent) => void;
  onDragStart: (event: React.DragEvent, entry: FileEntry) => void;
}) {
  const canBack = pane.historyIndex > 0;
  const canForward = pane.historyIndex < pane.history.length - 1;
  const selectedCount = pane.selectedPaths.length;
  const selectedBytes = entries
    .filter((entry) => containsPath(pane.selectedPaths, entry.path))
    .reduce((sum, entry) => sum + entry.size, 0);
  const pathBreadcrumbs = breadcrumbs(pane.path);
  const [pathMenuOpen, setPathMenuOpen] = useState(false);

  useEffect(() => {
    setPathMenuOpen(false);
  }, [pane.path]);

  return (
    <article
      className={`explorer-pane ${active ? "active" : ""} ${dragTarget ? "drop-target" : ""}`}
      aria-label={`Pane ${pane.id}`}
      data-pane-id={pane.id}
      onClick={onActivate}
      onContextMenu={(event) => onContextMenu(event)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <header className="pane-titlebar">
        <div className="pane-title">
          <button
            className="pane-drag-handle"
            type="button"
            title={`拖动交换 P${pane.id}`}
            aria-label={`拖动交换 P${pane.id}`}
            onDragStart={onPaneDragStart}
            onMouseDown={onPaneMouseDown}
            onPointerDown={onPanePointerDown}
          >
            <GripVertical size={14} />
          </button>
          <span className="pane-index">P{pane.id}</span>
          <strong title={pane.path}>{pathName(pane.path)}</strong>
        </div>

        <div className="pane-nav">
          <IconButton title="后退" icon={ArrowLeft} onClick={onBack} disabled={!canBack} />
          <IconButton title="前进" icon={ArrowRight} onClick={onForward} disabled={!canForward} />
          <IconButton title="上一层" icon={ArrowUp} onClick={onUp} />
        </div>

        <div className="pane-tools">
          <IconButton title="过滤/搜索" icon={Search} active={pane.filterVisible || !!pane.filter.trim()} onClick={onToggleFilter} />
          <IconButton title="详细视图" icon={List} active={pane.viewMode === "details"} onClick={() => onViewMode("details")} />
          <IconButton title="图标视图" icon={LayoutGrid} active={pane.viewMode === "icons"} onClick={() => onViewMode("icons")} />
          <IconButton title="刷新窗格" icon={RefreshCcw} onClick={onRefresh} />
        </div>

        <div
          className="pane-location"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setPathMenuOpen(false);
          }}
        >
          <div className="path-menu">
            <button
              type="button"
              className="path-menu-trigger"
              title="打开路径层级"
              aria-label={`P${pane.id} 路径层级`}
              aria-expanded={pathMenuOpen}
              onClick={(event) => {
                event.stopPropagation();
                setPathMenuOpen((open) => !open);
              }}
            >
              <Folder size={14} />
              <span>路径</span>
            </button>
            {pathMenuOpen && (
              <div className="path-menu-list" role="menu" aria-label={`P${pane.id} 路径层级`}>
                {pathBreadcrumbs.map((part, index) => {
                  const current = index === pathBreadcrumbs.length - 1;
                  return (
                    <button
                      key={`${part.path}-${index}`}
                      type="button"
                      role="menuitem"
                      className={current ? "active" : ""}
                      title={part.path}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPathMenuOpen(false);
                        onNavigate(part.path);
                      }}
                    >
                      <span>{part.label}</span>
                      <small>{part.path}</small>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <form
            className="address-row"
            onSubmit={(event) => {
              event.preventDefault();
              onAddressSubmit();
            }}
          >
            <input
              aria-label={`P${pane.id} 地址`}
              value={pane.addressDraft}
              list={`path-suggestions-${pane.id}`}
              onChange={(event) => onAddressChange(event.target.value)}
              spellCheck={false}
            />
            <datalist id={`path-suggestions-${pane.id}`}>
              {addressSuggestions.map((suggestion) => (
                <option key={suggestion.path} value={suggestion.path}>
                  {suggestion.isDirectory ? "文件夹" : "文件"} - {suggestion.label}
                </option>
              ))}
            </datalist>
            <button type="submit" title="转到" aria-label="转到">
              <ArrowRight size={14} />
            </button>
          </form>
        </div>
      </header>

      {(pane.filterVisible || pane.filter.trim() || pane.recursiveSearch) && <div className="search-row">
        <Search size={15} />
        <input
          value={pane.filter}
          placeholder="过滤或搜索"
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
          子文件夹
        </label>
        <button type="button" onClick={onSearch}>
          搜索
        </button>
      </div>}

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
        {pane.loading && <div className="pane-overlay">加载中...</div>}
        {pane.error && <div className="pane-error">{pane.error}</div>}
      </section>

      <footer className="pane-status">
        <span>{entries.length} 项</span>
        <span>{selectedCount ? `已选 ${selectedCount} 项，${formatBytes(selectedBytes)}` : "未选择"}</span>
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
                <FileIcon entry={entry} size={16} />
                <span>{entry.name}</span>
              </span>
              <span>{entry.isDirectory ? "" : formatBytes(entry.size)}</span>
              <span>{formatDate(entry.modifiedAt)}</span>
              <span>{entry.typeLabel}</span>
            </button>
          );
        })}
        {entries.length === 0 && <div className="empty-folder">没有匹配此视图的项目。</div>}
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
            <FileIcon entry={entry} size={28} />
            <span>{entry.name}</span>
          </button>
        );
      })}
      {entries.length === 0 && <div className="empty-folder">没有匹配此视图的项目。</div>}
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
      <h2>检查器</h2>
      {!preview && <p className="empty-note">选择文件后预览详情。</p>}
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
      setError("请选择一个或多个文件进行对比。");
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
      <section className="modal hash-compare-modal" role="dialog" aria-modal="true" aria-label="哈希对比">
        <header className="modal-header">
          <div>
            <h2>哈希对比</h2>
            <span>{files.length} 个已选文件</span>
          </div>
          <button onClick={onClose}>关闭</button>
        </header>

        <div className="hash-compare-toolbar">
          <label>
            算法
            <select value={algorithm} onChange={(event) => setAlgorithm(event.target.value as HashAlgorithm)}>
              {hashAlgorithms.map((item) => (
                <option key={item} value={item}>
                  {item.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={() => void calculate()} disabled={loading || files.length === 0}>
            计算
          </button>
          <span>
            {loading
              ? "计算中..."
              : calculated
                ? `${duplicateGroups.length} 组相同 · ${uniqueGroups.length} 个唯一文件`
                : "待计算"}
          </span>
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="hash-compare-results">
          {!calculated && <p className="empty-folder">选择算法后计算所选文件哈希。</p>}
          {duplicateGroups.map((group) => (
            <section className="hash-group duplicate" key={group.value}>
              <div className="hash-group-header">
                <strong>{group.items.length} 个相同文件</strong>
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
                <strong>{uniqueGroups.length} 个唯一文件</strong>
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
                <strong>{failedResults.length} 个失败项</strong>
                <span>已跳过</span>
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
      <section className="modal archive-modal" role="dialog" aria-modal="true" aria-label="归档浏览器">
        <header className="modal-header">
          <div>
            <h2>{pathName(archivePath)}</h2>
            <span>{internalPath || "归档根目录"}</span>
          </div>
          <button onClick={onClose}>关闭</button>
        </header>

        <div className="archive-toolbar">
          <button onClick={goUp} disabled={!internalPath}>
            上一级
          </button>
          <button onClick={() => void extractSelected(false)} disabled={!selectedPaths.length}>
            解压所选
          </button>
          <button onClick={() => void extractSelected(true)}>全部解压</button>
          <span title={destinationPath}>目标：{destinationPath}</span>
        </div>

        {error && <p className="modal-error">{error}</p>}
        {message && <p className="modal-help">{message}</p>}
        <div className="archive-body">
          <div className="archive-list">
            <div className="preview-header archive-header">
              <span>名称</span>
              <span>大小</span>
              <span>修改时间</span>
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
            {loading && <div className="empty-folder">正在读取归档...</div>}
            {!loading && entries.length === 0 && <div className="empty-folder">归档目录为空。</div>}
          </div>

          <div className="archive-preview">
            {!preview && <p className="empty-note">选择归档条目预览。</p>}
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
      <section className="modal new-file-modal" role="dialog" aria-modal="true" aria-label="新建文件">
        <header className="modal-header">
          <div>
            <h2>新建文件</h2>
            <span title={destinationPath}>{destinationPath}</span>
          </div>
          <button onClick={onClose}>关闭</button>
        </header>

        <div className="new-file-body">
          <div className="template-list" aria-label="文件模板">
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
              文件名
              <input value={fileName} onChange={(event) => setFileName(event.target.value)} spellCheck={false} />
            </label>
            <label>
              预览
              <input value={previewName} readOnly spellCheck={false} />
            </label>
            <label className="template-content-label">
              内容
              <textarea value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={(event) => setSaveAsTemplate(event.target.checked)}
              />
              保存为模板
            </label>
            {saveAsTemplate && (
              <label>
                模板名称
                <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
              </label>
            )}
          </div>
        </div>

        <footer className="modal-footer">
          <button onClick={onClose}>取消</button>
          <button
            disabled={!canDeleteTemplate}
            onClick={() => {
              if (!selectedTemplate) return;
              onDeleteTemplate(selectedTemplate.id);
              if (templates[0]) chooseTemplate(templates[0].id);
            }}
          >
            删除模板
          </button>
          <button
            className="primary"
            disabled={!fileName.trim()}
            onClick={() => onCreate({ name: fileName, content, saveTemplateName: saveAsTemplate ? templateName : undefined })}
          >
            创建
          </button>
        </footer>
      </section>
    </div>
  );
}

function NewFolderModal({
  destinationPath,
  onClose,
  onCreate
}: {
  destinationPath: string;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("新建文件夹");
  const trimmedName = name.trim();

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal simple-name-modal" role="dialog" aria-modal="true" aria-label="新建文件夹">
        <header className="modal-header">
          <div>
            <h2>新建文件夹</h2>
            <span title={destinationPath}>{destinationPath}</span>
          </div>
          <button onClick={onClose}>关闭</button>
        </header>

        <form
          className="simple-name-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmedName) onCreate(trimmedName);
          }}
        >
          <label>
            文件夹名称
            <input value={name} autoFocus onChange={(event) => setName(event.target.value)} spellCheck={false} />
          </label>
          <footer className="modal-footer">
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button className="primary" type="submit" disabled={!trimmedName}>
              创建
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function WorkspaceRenameModal({
  workspace,
  onClose,
  onSave
}: {
  workspace: WorkspaceRecord;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(workspace.name);
  const trimmedName = name.trim();

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal workspace-rename-modal"
        role="dialog"
        aria-modal="true"
        aria-label="重命名工作区"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2>重命名工作区</h2>
            <span>{workspace.name}</span>
          </div>
          <button onClick={onClose}>关闭</button>
        </header>

        <form
          className="workspace-rename-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmedName) onSave(trimmedName);
          }}
        >
          <label>
            工作区名称
            <input
              value={name}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setName(event.target.value)}
              spellCheck={false}
            />
          </label>
          <footer className="modal-footer">
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button className="primary" type="submit" disabled={!trimmedName}>
              保存
            </button>
          </footer>
        </form>
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
      <section className="modal color-rules-modal" role="dialog" aria-modal="true" aria-label="颜色规则">
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
      <section className="modal action-settings-modal" role="dialog" aria-modal="true" aria-label="自定义动作">
        <header className="modal-header">
          <div>
            <h2>自定义动作</h2>
            <span>调整工具栏按钮和快捷键；右键菜单固定使用 Space 分组菜单。</span>
          </div>
          <button onClick={onClose}>关闭</button>
        </header>

        <div className="action-settings-body">
          <ActionSurfaceEditor
            title="工具栏"
            catalog={toolbarActionCatalog}
            selectedIds={draftToolbarIds}
            onChange={setDraftToolbarIds}
          />
          <HotkeyEditor catalog={hotkeyActionCatalog} values={draftHotkeys} onChange={setDraftHotkeys} />
        </div>
        {(duplicateHotkeys.length > 0 || invalidHotkeys.length > 0) && (
          <div className="action-settings-warning" role="alert">
            {duplicateHotkeys.length > 0 && <span>快捷键重复：{[...new Set(duplicateHotkeys)].join(", ")}</span>}
            {invalidHotkeys.length > 0 && <span>快捷键无效：{invalidHotkeys.join(", ")}</span>}
          </div>
        )}

        <footer className="modal-footer">
          <button
            onClick={() => {
              setDraftToolbarIds(defaultToolbarActionIds);
              setDraftHotkeys({});
            }}
          >
            恢复默认
          </button>
          <button onClick={onClose}>取消</button>
          <button className="primary" disabled={!canSave} onClick={() => onSave(draftToolbarIds, contextMenuIds, normalizeHotkeyBindings(normalizedHotkeys))}>
            保存设置
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
      <legend>快捷键</legend>
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
                上移
              </button>
              <button disabled={!enabled || index === selectedIds.length - 1} onClick={() => onChange(moveActionId(selectedIds, item.id, 1))}>
                下移
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
      <section className="modal rename-modal" role="dialog" aria-modal="true" aria-label="批量重命名">
        <header className="modal-header">
          <div>
            <h2>批量重命名</h2>
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
      <section className="modal sync-modal" role="dialog" aria-modal="true" aria-label="文件夹同步">
        <header className="modal-header">
          <div>
            <h2>文件夹同步</h2>
            <span>比较两个窗格，并复制较新或缺失的文件。</span>
          </div>
          <button onClick={onClose}>关闭</button>
        </header>

        <div className="sync-preset-bar">
          <label>
            预设
            <select value={selectedPresetId} onChange={(event) => loadPreset(event.target.value)}>
              <option value="">自定义同步</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            预设名称
            <input
              value={presetName}
              placeholder="可复用同步名称"
              onChange={(event) => setPresetName(event.target.value)}
            />
          </label>
          <button onClick={savePreset}>保存预设</button>
          <button disabled={!selectedPresetId} onClick={deletePreset}>
            删除预设
          </button>
        </div>

        <div className="sync-form">
          <label>
            左侧窗格
            <select value={leftPaneId} onChange={(event) => selectPane("left", Number(event.target.value))}>
              {panes.map((pane) => (
                <option key={pane.id} value={pane.id}>
                  P{pane.id} {pathName(pane.path)}
                </option>
              ))}
            </select>
          </label>
          <label>
            右侧窗格
            <select value={rightPaneId} onChange={(event) => selectPane("right", Number(event.target.value))}>
              {panes.map((pane) => (
                <option key={pane.id} value={pane.id}>
                  P{pane.id} {pathName(pane.path)}
                </option>
              ))}
            </select>
          </label>
          <label>
            左侧路径
            <input value={leftPath} onChange={(event) => setLeftPath(event.target.value)} />
          </label>
          <label>
            右侧路径
            <input value={rightPath} onChange={(event) => setRightPath(event.target.value)} />
          </label>
          <label>
            同步方向
            <select value={direction} onChange={(event) => setDirection(event.target.value as FolderSyncDirection)}>
              <option value="updateRight">用左侧更新右侧</option>
              <option value="updateLeft">用右侧更新左侧</option>
              <option value="updateBoth">双向更新</option>
            </select>
          </label>
          <label>
            过滤
            <input value={filter} placeholder="可选路径文本" onChange={(event) => setFilter(event.target.value)} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={includeHidden} onChange={(event) => setIncludeHidden(event.target.checked)} />
            包含隐藏项目
          </label>
        </div>

        {sameFolder && <p className="modal-error">请选择两个不同文件夹。</p>}
        {error && <p className="modal-error">{error}</p>}

        <div className="sync-summary">
          <span>{plan?.actions.length ?? 0} 项操作</span>
          <span>{plan?.skipped ?? 0} 项已跳过</span>
        </div>

        <div className="preview-table">
          <div className="preview-header sync-header">
            <span>操作</span>
            <span>路径</span>
            <span>原因</span>
          </div>
          {plan?.actions.slice(0, 200).map((action) => (
            <div key={`${action.type}-${action.relativePath}`} className="preview-row sync-row">
              <span>{action.type === "copyLeftToRight" ? "左 -> 右" : "右 -> 左"}</span>
              <span title={action.relativePath}>{action.relativePath}</span>
              <span>{action.reason}, {formatBytes(action.size)}</span>
            </div>
          ))}
          {plan && plan.actions.length > 200 && <p className="modal-help">仅显示前 200 项操作。</p>}
        </div>

        <footer className="modal-footer">
          <button onClick={onClose}>取消</button>
          <button
            className="primary"
            disabled={!plan || plan.actions.length === 0 || sameFolder}
            onClick={() => onApply({ ...currentSettings(), refreshPaneIds: refreshPaneIds() })}
          >
            执行同步
          </button>
        </footer>
      </section>
    </div>
  );
}

function IconButton({
  title,
  icon: Icon,
  onClick,
  disabled,
  active,
  showLabel = false
}: {
  title: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  showLabel?: boolean;
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
      {showLabel && <span className="icon-button-label">{title}</span>}
    </button>
  );
}
