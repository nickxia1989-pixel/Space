import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
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
  SortDirection,
  SortKey,
  SpaceApi,
  ViewMode,
  WorkspacePaneSnapshot,
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

function normalizeWorkspace(saved: WorkspaceSnapshot | null, bootstrap: BootstrapPayload): WorkspaceSnapshot {
  if (!saved || saved.panes.length !== 4) {
    return {
      layout: "grid",
      activePaneId: 1,
      panes: getDefaultSnapshots(bootstrap),
      bookmarks: [],
      savedAt: Date.now()
    };
  }
  return {
    layout: saved.layout ?? "grid",
    activePaneId: paneIds.includes(saved.activePaneId) ? saved.activePaneId : 1,
    panes: paneIds.map((id) => saved.panes.find((pane) => pane.id === id) ?? defaultPaneSnapshot(id, bootstrap.homePath)),
    bookmarks: saved.bookmarks ?? [],
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

export default function App() {
  const api = useMemo<SpaceApi>(() => getSpaceApi(), []);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [panes, setPanes] = useState<PaneState[]>([]);
  const [layout, setLayout] = useState<LayoutMode>("grid");
  const [activePaneId, setActivePaneId] = useState(1);
  const [bookmarks, setBookmarks] = useState<KnownLocation[]>([]);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [hashLine, setHashLine] = useState<string>("");
  const toastCounter = useRef(0);

  const activePane = panes.find((pane) => pane.id === activePaneId) ?? panes[0];
  const selectedEntries = activePane
    ? activePane.entries.filter((entry) => containsPath(activePane.selectedPaths, entry.path))
    : [];
  const previewTarget = selectedEntries[0]?.path ?? previewPath;

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const bootPayload = await api.bootstrap();
        const workspace = normalizeWorkspace(await api.getWorkspace(), bootPayload);
        const hydrated = workspace.panes.map(hydratePane);

        setBootstrap(bootPayload);
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
    if (!initialized || panes.length !== 4) return;
    const timer = window.setTimeout(() => {
      const snapshot: WorkspaceSnapshot = {
        layout,
        activePaneId,
        panes: panes.map(snapshotFromPane),
        bookmarks,
        savedAt: Date.now()
      };
      void api.saveWorkspace(snapshot);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activePaneId, api, bookmarks, initialized, layout, panes]);

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
