import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Archive,
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
  Home,
  Image,
  LayoutGrid,
  List,
  Monitor,
  MoreVertical,
  Music,
  PanelRight,
  Pencil,
  Plus,
  RefreshCcw,
  Rows3,
  Scissors,
  Search,
  Star,
  Terminal,
  Trash2,
  Video
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSpaceApi } from "./api";
import {
  breadcrumbs,
  containsPath,
  formatBytes,
  formatDate,
  parentPath,
  pathName
} from "./pathUtils";
import type {
  BootstrapPayload,
  ClipboardMode,
  FileEntry,
  HashAlgorithm,
  KnownLocation,
  LayoutMode,
  OperationResult,
  BatchRenamePreview,
  BatchRenameRule,
  FolderSyncDirection,
  FolderSyncPlan,
  SortDirection,
  SortKey,
  SpaceApi,
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

const paneIds = [1, 2, 3, 4];
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
    savedAt: Date.now()
  };
}

function normalizeWorkspaceRecord(record: WorkspaceRecord, bootstrap: BootstrapPayload): WorkspaceRecord {
  return {
    ...record,
    id: record.id || createWorkspaceId(),
    name: record.name || "Workspace",
    layout: record.layout ?? "grid",
    activePaneId: paneIds.includes(record.activePaneId) ? record.activePaneId : 1,
    panes: paneIds.map((id) => record.panes.find((pane) => pane.id === id) ?? defaultPaneSnapshot(id, bootstrap.homePath)),
    bookmarks: record.bookmarks ?? [],
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
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [hashLine, setHashLine] = useState<string>("");
  const [batchRenameOpen, setBatchRenameOpen] = useState(false);
  const [folderSyncOpen, setFolderSyncOpen] = useState(false);
  const [archiveBrowser, setArchiveBrowser] = useState<ArchiveBrowserState | null>(null);
  const toastCounter = useRef(0);

  const activePane = panes.find((pane) => pane.id === activePaneId) ?? panes[0];
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const selectedEntries = activePane
    ? activePane.entries.filter((entry) => containsPath(activePane.selectedPaths, entry.path))
    : [];
  const previewTarget = selectedEntries[0]?.path ?? previewPath;

  useEffect(() => {
    let cancelled = false;

    async function boot() {
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
        }
      } catch (error) {
        if (!cancelled) showToast("error", `Startup failed: ${getErrorMessage(error)}`);
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
        savedAt: Date.now()
      };
      const workspaceDocument: WorkspaceDocument = {
        activeWorkspaceId,
        workspaces: workspaces.map((workspace) =>
          workspace.id === activeWorkspaceId ? { ...workspace, ...snapshot } : workspace
        ),
        savedAt: Date.now()
      };
      void api.saveWorkspace(workspaceDocument);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activePaneId, activeWorkspaceId, api, bookmarks, initialized, layout, panes, workspaces]);

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

  function getCurrentWorkspaceSnapshot(): WorkspaceSnapshot {
    return {
      layout,
      activePaneId,
      panes: panes.map(snapshotFromPane),
      bookmarks,
      savedAt: Date.now()
    };
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
    setPreviewPath(null);
    setHashLine("");
    setClipboard(null);
    setContextMenu(null);
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

  async function loadPane(paneId: number, targetPath: string, mode: "push" | "replace" = "push") {
    setActivePaneId(paneId);
    updatePane(paneId, (pane) => ({ ...pane, loading: true, error: undefined, addressDraft: targetPath }));
    try {
      const payload = await api.listDirectory(targetPath);
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
        return {
          ...pane,
          path: payload.path,
          addressDraft: payload.path,
          entries: payload.entries,
          selectedPaths: [],
          anchorPath: undefined,
          loading: false,
          error: undefined,
          history,
          historyIndex,
          scannedAt: payload.scannedAt
        };
      });
    } catch (error) {
      updatePane(paneId, (pane) => ({ ...pane, loading: false, error: getErrorMessage(error) }));
      showToast("error", getErrorMessage(error));
    }
  }

  async function refreshPane(paneId = activePaneId) {
    const pane = panes.find((item) => item.id === paneId);
    if (!pane) return;
    if (pane.recursiveSearch && pane.filter.trim()) {
      await runSearch(paneId);
    } else {
      await loadPane(paneId, pane.path, "replace");
    }
  }

  async function runSearch(paneId: number) {
    const pane = panes.find((item) => item.id === paneId);
    if (!pane) return;
    if (!pane.filter.trim()) {
      await refreshPane(paneId);
      return;
    }
    updatePane(paneId, (current) => ({ ...current, loading: true, error: undefined }));
    try {
      const entries = await api.searchFiles({
        rootPath: pane.path,
        query: pane.filter,
        recursive: pane.recursiveSearch,
        limit: 500
      });
      updatePane(paneId, (current) => ({
        ...current,
        entries,
        selectedPaths: [],
        loading: false,
        scannedAt: Date.now()
      }));
    } catch (error) {
      updatePane(paneId, (current) => ({ ...current, loading: false, error: getErrorMessage(error) }));
    }
  }

  function goHistory(paneId: number, direction: -1 | 1) {
    const pane = panes.find((item) => item.id === paneId);
    if (!pane) return;
    const nextIndex = pane.historyIndex + direction;
    const nextPath = pane.history[nextIndex];
    if (!nextPath) return;
    setActivePaneId(paneId);
    updatePane(paneId, (current) => ({ ...current, loading: true, error: undefined, addressDraft: nextPath }));
    api
      .listDirectory(nextPath)
      .then((payload) => {
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
        updatePane(paneId, (current) => ({ ...current, loading: false, error: getErrorMessage(error) }));
        showToast("error", getErrorMessage(error));
      });
  }

  async function perform(label: string, action: () => Promise<OperationResult | unknown>, refreshIds: number[] = [activePaneId]) {
    try {
      const result = await action();
      const message =
        typeof result === "object" && result && "message" in result
          ? String((result as OperationResult).message)
          : `${label} complete.`;
      showToast("success", message);
      await Promise.all([...new Set(refreshIds)].map((id) => refreshPane(id)));
    } catch (error) {
      showToast("error", `${label} failed: ${getErrorMessage(error)}`);
    }
  }

  function selectEntry(paneId: number, entry: FileEntry, event: React.MouseEvent, entries: FileEntry[]) {
    setActivePaneId(paneId);
    updatePane(paneId, (pane) => {
      let selectedPaths: string[];
      if (event.shiftKey && pane.anchorPath) {
        const anchorIndex = entries.findIndex((item) => item.path === pane.anchorPath);
        const entryIndex = entries.findIndex((item) => item.path === entry.path);
        const [start, end] = [anchorIndex, entryIndex].sort((a, b) => a - b);
        selectedPaths = entries.slice(start, end + 1).map((item) => item.path);
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

  function openEntry(paneId: number, entry: FileEntry) {
    setPreviewPath(entry.path);
    if (entry.isDirectory) {
      void loadPane(paneId, entry.path);
    } else if (entry.extension.toLowerCase() === ".zip") {
      const pane = panes.find((item) => item.id === paneId);
      setArchiveBrowser({ archivePath: entry.path, destinationPath: pane?.path ?? entry.parentPath });
    } else {
      void perform("Open", () => api.openPath(entry.path), []);
    }
  }

  function copySelection(mode: ClipboardMode) {
    if (!activePane?.selectedPaths.length) return;
    setClipboard({ mode, paths: activePane.selectedPaths });
    showToast("info", `${mode === "copy" ? "Copied" : "Cut"} ${activePane.selectedPaths.length} item(s).`);
  }

  async function pasteInto(paneId = activePaneId) {
    const pane = panes.find((item) => item.id === paneId);
    if (!pane || !clipboard?.paths.length) return;
    const operation = clipboard.mode === "copy" ? api.copyItems : api.moveItems;
    await perform(
      clipboard.mode === "copy" ? "Paste copy" : "Paste move",
      () => operation({ sources: clipboard.paths, destination: pane.path }),
      paneIds
    );
    if (clipboard.mode === "cut") setClipboard(null);
  }

  async function sendSelectionToPane(targetPaneId: number, mode: ClipboardMode) {
    if (!activePane || !activePane.selectedPaths.length || targetPaneId === activePane.id) return;
    const targetPane = panes.find((pane) => pane.id === targetPaneId);
    if (!targetPane) return;
    await perform(
      mode === "copy" ? "Copy to pane" : "Move to pane",
      () =>
        mode === "copy"
          ? api.copyItems({ sources: activePane.selectedPaths, destination: targetPane.path })
          : api.moveItems({ sources: activePane.selectedPaths, destination: targetPane.path }),
      [activePane.id, targetPaneId]
    );
  }

  async function createItem(kind: "file" | "folder") {
    if (!activePane) return;
    const fallback = kind === "folder" ? "New Folder" : "New File.txt";
    const name = window.prompt(kind === "folder" ? "Folder name" : "File name", fallback);
    if (!name) return;
    await perform(
      kind === "folder" ? "Create folder" : "Create file",
      () =>
        kind === "folder"
          ? api.createFolder({ parentPath: activePane.path, name })
          : api.createFile({ parentPath: activePane.path, name })
    );
  }

  async function renameSelected() {
    if (!activePane || activePane.selectedPaths.length !== 1) return;
    const sourcePath = activePane.selectedPaths[0];
    const name = window.prompt("Rename", pathName(sourcePath));
    if (!name) return;
    await perform("Rename", () => api.renameItem({ path: sourcePath, newName: name }));
  }

  async function deleteSelected() {
    if (!activePane?.selectedPaths.length) return;
    const ok = window.confirm(`Delete ${activePane.selectedPaths.length} selected item(s)?`);
    if (!ok) return;
    await perform("Delete", () => api.deleteItems({ paths: activePane.selectedPaths }));
  }

  async function calculateSelectedHash(algorithm: HashAlgorithm = "sha256") {
    if (!activePane || activePane.selectedPaths.length !== 1) return;
    try {
      const result = await api.calculateHash({ path: activePane.selectedPaths[0], algorithm });
      setHashLine(`${algorithm.toUpperCase()} ${pathName(result.path)}: ${result.value}`);
      showToast("success", "Hash calculated.");
    } catch (error) {
      showToast("error", `Hash failed: ${getErrorMessage(error)}`);
    }
  }

  async function applyBatchRename(rule: BatchRenameRule) {
    if (!activePane?.selectedPaths.length) return;
    await perform(
      "Batch rename",
      () => api.applyBatchRename({ paths: activePane.selectedPaths, rule }),
      [activePane.id]
    );
    setBatchRenameOpen(false);
  }

  async function applyFolderSync(request: {
    leftPaneId: number;
    rightPaneId: number;
    direction: FolderSyncDirection;
    includeHidden: boolean;
    filter: string;
  }) {
    const leftPane = panes.find((pane) => pane.id === request.leftPaneId);
    const rightPane = panes.find((pane) => pane.id === request.rightPaneId);
    if (!leftPane || !rightPane || leftPane.id === rightPane.id) return;
    await perform(
      "Folder sync",
      () =>
        api.applyFolderSync({
          leftPath: leftPane.path,
          rightPath: rightPane.path,
          direction: request.direction,
          includeHidden: request.includeHidden,
          filter: request.filter
        }),
      [leftPane.id, rightPane.id]
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
    );
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

    if (event.ctrlKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAll();
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
          <IconButton title="New folder" onClick={() => void createItem("folder")} icon={FolderPlus} />
          <IconButton title="New file" onClick={() => void createItem("file")} icon={FilePlus2} />
          <span className="toolbar-divider" />
          <IconButton title="Copy" onClick={() => copySelection("copy")} icon={Copy} disabled={!activePane?.selectedPaths.length} />
          <IconButton title="Cut" onClick={() => copySelection("cut")} icon={Scissors} disabled={!activePane?.selectedPaths.length} />
          <IconButton title="Paste" onClick={() => void pasteInto()} icon={FileText} disabled={!clipboard?.paths.length} />
          <IconButton title="Delete" onClick={() => void deleteSelected()} icon={Trash2} disabled={!activePane?.selectedPaths.length} />
          <span className="toolbar-divider" />
          <IconButton title="Create ZIP archive" onClick={() => void createArchiveFromSelection()} icon={Archive} disabled={!activePane?.selectedPaths.length} />
          <IconButton title="Batch rename" onClick={() => setBatchRenameOpen(true)} icon={FileText} disabled={!activePane?.selectedPaths.length} />
          <IconButton title="Folder sync" onClick={() => setFolderSyncOpen(true)} icon={RefreshCcw} disabled={!activePane} />
          <span className="toolbar-divider" />
          <IconButton title="Refresh" onClick={() => void refreshPane()} icon={RefreshCcw} />
          <IconButton title="Open terminal" onClick={() => activePane && void perform("Terminal", () => api.openTerminal(activePane.path), [])} icon={Terminal} />
          <IconButton title="Add bookmark" onClick={addBookmark} icon={Star} />
        </div>

        <div className="layout-switcher" aria-label="Layout">
          <IconButton title="Grid layout" onClick={() => setLayout("grid")} icon={Grid2X2} active={layout === "grid"} />
          <IconButton title="Columns layout" onClick={() => setLayout("columns")} icon={Columns3} active={layout === "columns"} />
          <IconButton title="Rows layout" onClick={() => setLayout("rows")} icon={Rows3} active={layout === "rows"} />
          <IconButton title="Focus active pane" onClick={() => setLayout("focus")} icon={PanelRight} active={layout === "focus"} />
        </div>
      </header>

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
          onOpen={(targetPath) => activePane && void loadPane(activePane.id, targetPath)}
          onRemoveBookmark={(id) => setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id))}
        />

        <section className={`pane-area layout-${layout}`} aria-label="Explorer panes">
          {panes.map((pane) => (
            <ExplorerPane
              key={pane.id}
              pane={pane}
              entries={visibleEntries(pane)}
              active={pane.id === activePaneId}
              onActivate={() => setActivePaneId(pane.id)}
              onNavigate={(targetPath) => void loadPane(pane.id, targetPath)}
              onBack={() => goHistory(pane.id, -1)}
              onForward={() => goHistory(pane.id, 1)}
              onUp={() => void loadPane(pane.id, parentPath(pane.path))}
              onRefresh={() => void refreshPane(pane.id)}
              onAddressChange={(value) => updatePane(pane.id, (current) => ({ ...current, addressDraft: value }))}
              onAddressSubmit={() => void loadPane(pane.id, pane.addressDraft)}
              onFilterChange={(value) => updatePane(pane.id, (current) => ({ ...current, filter: value }))}
              onRecursiveChange={(value) => updatePane(pane.id, (current) => ({ ...current, recursiveSearch: value }))}
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
              onCopyTo={(targetId) => void sendSelectionToPane(targetId, "copy")}
              onMoveTo={(targetId) => void sendSelectionToPane(targetId, "cut")}
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
          onCopy={() => copySelection("copy")}
          onCut={() => copySelection("cut")}
          onPaste={() => void pasteInto(contextMenu.paneId)}
          onRename={() => void renameSelected()}
          onDelete={() => void deleteSelected()}
          onHash={() => void calculateSelectedHash("sha256")}
          onReveal={() => activePane?.selectedPaths[0] && void perform("Reveal", () => api.revealPath(activePane.selectedPaths[0]), [])}
          canPaste={!!clipboard?.paths.length}
          canAct={!!activePane?.selectedPaths.length}
        />
      )}

      {batchRenameOpen && activePane && (
        <BatchRenameModal
          api={api}
          paths={activePane.selectedPaths}
          onClose={() => setBatchRenameOpen(false)}
          onApply={(rule) => void applyBatchRename(rule)}
        />
      )}

      {folderSyncOpen && activePane && (
        <FolderSyncModal
          api={api}
          panes={panes}
          activePaneId={activePane.id}
          onClose={() => setFolderSyncOpen(false)}
          onApply={(request) => void applyFolderSync(request)}
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

function Sidebar({
  bootstrap,
  bookmarks,
  onOpen,
  onRemoveBookmark
}: {
  bootstrap: BootstrapPayload;
  bookmarks: KnownLocation[];
  onOpen: (path: string) => void;
  onRemoveBookmark: (id: string) => void;
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
        <input value={pane.addressDraft} onChange={(event) => onAddressChange(event.target.value)} spellCheck={false} />
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
  onSort,
  onSelect,
  onOpen,
  onContextMenu,
  onDragStart
}: {
  pane: PaneState;
  entries: FileEntry[];
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
        {entries.map((entry) => (
          <button
            key={entry.path}
            className={`details-row ${containsPath(pane.selectedPaths, entry.path) ? "selected" : ""}`}
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
        ))}
        {entries.length === 0 && <div className="empty-folder">No items match this view.</div>}
      </div>
    </div>
  );
}

function IconGrid({
  pane,
  entries,
  onSelect,
  onOpen,
  onContextMenu,
  onDragStart
}: {
  pane: PaneState;
  entries: FileEntry[];
  onSelect: (entry: FileEntry, event: React.MouseEvent, entries: FileEntry[]) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (event: React.MouseEvent, entry?: FileEntry) => void;
  onDragStart: (event: React.DragEvent, entry: FileEntry) => void;
}) {
  return (
    <div className="icon-grid">
      {entries.map((entry) => (
        <button
          key={entry.path}
          className={`icon-tile ${containsPath(pane.selectedPaths, entry.path) ? "selected" : ""}`}
          draggable
          onClick={(event) => onSelect(entry, event, entries)}
          onDoubleClick={() => onOpen(entry)}
          onContextMenu={(event) => onContextMenu(event, entry)}
          onDragStart={(event) => onDragStart(event, entry)}
        >
          {entry.isDirectory ? <Folder size={28} /> : <File size={28} />}
          <span>{entry.name}</span>
        </button>
      ))}
      {entries.length === 0 && <div className="empty-folder">No items match this view.</div>}
    </div>
  );
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

function BatchRenameModal({
  api,
  paths,
  onClose,
  onApply
}: {
  api: SpaceApi;
  paths: string[];
  onClose: () => void;
  onApply: (rule: BatchRenameRule) => void;
}) {
  const [rule, setRule] = useState<BatchRenameRule>(defaultBatchRenameRule);
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
  onClose,
  onApply
}: {
  api: SpaceApi;
  panes: PaneState[];
  activePaneId: number;
  onClose: () => void;
  onApply: (request: {
    leftPaneId: number;
    rightPaneId: number;
    direction: FolderSyncDirection;
    includeHidden: boolean;
    filter: string;
  }) => void;
}) {
  const defaultRightPaneId = panes.find((pane) => pane.id !== activePaneId)?.id ?? activePaneId;
  const [leftPaneId, setLeftPaneId] = useState(activePaneId);
  const [rightPaneId, setRightPaneId] = useState(defaultRightPaneId);
  const [direction, setDirection] = useState<FolderSyncDirection>("updateRight");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [filter, setFilter] = useState("");
  const [plan, setPlan] = useState<FolderSyncPlan | null>(null);
  const [error, setError] = useState("");

  const leftPane = panes.find((pane) => pane.id === leftPaneId);
  const rightPane = panes.find((pane) => pane.id === rightPaneId);
  const sameFolder = !!leftPane && !!rightPane && leftPane.path.toLowerCase() === rightPane.path.toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setError("");
    if (!leftPane || !rightPane || sameFolder) {
      setPlan(null);
      return;
    }
    api
      .previewFolderSync({
        leftPath: leftPane.path,
        rightPath: rightPane.path,
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
  }, [api, direction, filter, includeHidden, leftPane, rightPane, sameFolder]);

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

        <div className="sync-form">
          <label>
            Left
            <select value={leftPaneId} onChange={(event) => setLeftPaneId(Number(event.target.value))}>
              {panes.map((pane) => (
                <option key={pane.id} value={pane.id}>
                  P{pane.id} {pathName(pane.path)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Right
            <select value={rightPaneId} onChange={(event) => setRightPaneId(Number(event.target.value))}>
              {panes.map((pane) => (
                <option key={pane.id} value={pane.id}>
                  P{pane.id} {pathName(pane.path)}
                </option>
              ))}
            </select>
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
            onClick={() => onApply({ leftPaneId, rightPaneId, direction, includeHidden, filter })}
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
  onCopy,
  onCut,
  onPaste,
  onRename,
  onDelete,
  onHash,
  onReveal,
  canPaste,
  canAct
}: {
  state: ContextMenuState;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onRename: () => void;
  onDelete: () => void;
  onHash: () => void;
  onReveal: () => void;
  canPaste: boolean;
  canAct: boolean;
}) {
  return (
    <div className="context-menu" style={{ left: state.x, top: state.y }}>
      <button disabled={!canAct} onClick={onCopy}>Copy</button>
      <button disabled={!canAct} onClick={onCut}>Cut</button>
      <button disabled={!canPaste} onClick={onPaste}>Paste into Pane {state.paneId}</button>
      <button disabled={!canAct} onClick={onRename}>Rename</button>
      <button disabled={!canAct} onClick={onDelete}>Delete</button>
      <button disabled={!canAct} onClick={onHash}>Calculate SHA-256</button>
      <button disabled={!canAct} onClick={onReveal}>Reveal in Explorer</button>
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
