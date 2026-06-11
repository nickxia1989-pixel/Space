import type {
  BootstrapPayload,
  ArchiveCreateRequest,
  ArchiveDirectoryPayload,
  ArchiveExtractRequest,
  ArchiveListRequest,
  ArchivePreviewPayload,
  ArchivePreviewRequest,
  BatchRenamePreview,
  BatchRenameRequest,
  CreateItemRequest,
  DeleteRequest,
  DirectoryPayload,
  FileEntry,
  FileOperationRequest,
  FolderSyncPlan,
  FolderSyncRequest,
  HashPayload,
  HashRequest,
  KnownLocation,
  OperationResult,
  PathSuggestion,
  PathSuggestionRequest,
  PreviewPayload,
  RenameRequest,
  SearchOptions,
  SpaceApi,
  WorkspaceDocument
} from "./shared";
import { pathName, parentPath } from "./pathUtils";

const now = Date.now();
const mockHome = "C:\\Users\\Traveler";
const mockKnownLocations: KnownLocation[] = [
  { id: "home", label: "主页", path: mockHome, icon: "home" },
  { id: "desktop", label: "桌面", path: `${mockHome}\\Desktop`, icon: "monitor" },
  { id: "documents", label: "文档", path: `${mockHome}\\Documents`, icon: "file-text" },
  { id: "downloads", label: "下载", path: `${mockHome}\\Downloads`, icon: "download" },
  { id: "pictures", label: "图片", path: `${mockHome}\\Pictures`, icon: "image" }
];

const mockWorkspaceStorageKey = "space.mock.workspace";
let mockWorkspace: WorkspaceDocument | null = null;
const mockEntries = new Map<string, FileEntry[]>();

export function __resetBrowserMockFileSystemForTests(): void {
  mockWorkspace = null;
  mockEntries.clear();
}

function getMockStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadMockWorkspace(): WorkspaceDocument | null {
  const storage = getMockStorage();
  if (!storage) return mockWorkspace;
  const raw = storage.getItem(mockWorkspaceStorageKey);
  if (!raw) {
    mockWorkspace = null;
    return null;
  }
  try {
    mockWorkspace = JSON.parse(raw) as WorkspaceDocument;
    return mockWorkspace;
  } catch {
    storage.removeItem(mockWorkspaceStorageKey);
    mockWorkspace = null;
    return null;
  }
}

function saveMockWorkspace(snapshot: WorkspaceDocument): void {
  mockWorkspace = snapshot;
  const storage = getMockStorage();
  if (!storage) return;
  try {
    storage.setItem(mockWorkspaceStorageKey, JSON.stringify(snapshot));
  } catch {
    // Ignore quota and privacy-mode errors in the browser demo fallback.
  }
}

function createMockEntry(parent: string, name: string, isDirectory: boolean, size = 0): FileEntry {
  const filePath = `${parent}\\${name}`;
  const extension = isDirectory || !name.includes(".") ? "" : `.${name.split(".").pop() ?? ""}`.toLowerCase();
  return {
    name,
    path: filePath,
    parentPath: parent,
    isDirectory,
    isFile: !isDirectory,
    isSymlink: false,
    size,
    modifiedAt: now - Math.floor(Math.random() * 100000000),
    createdAt: now - 200000000,
    extension,
    typeLabel: isDirectory ? "文件夹" : extension ? `${extension.slice(1).toUpperCase()} 文件` : "文件",
    hidden: name.startsWith(".")
  };
}

function expandMockDateVariables(value: string, date = new Date()): string {
  return value.replace(/\$date\(([^)]+)\)/g, (_match, format: string) => {
    const pad = (part: number, length = 2) => String(part).padStart(length, "0");
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
  });
}

function seedMockEntries(): void {
  if (mockEntries.size > 0) return;
  mockEntries.set(mockHome, [
    createMockEntry(mockHome, "Desktop", true),
    createMockEntry(mockHome, "Documents", true),
    createMockEntry(mockHome, "Downloads", true),
    createMockEntry(mockHome, "Pictures", true),
    createMockEntry(mockHome, "Space Notes.md", false, 4820)
  ]);
  mockEntries.set(`${mockHome}\\Desktop`, [
    createMockEntry(`${mockHome}\\Desktop`, "Project Brief.pdf", false, 1280000),
    createMockEntry(`${mockHome}\\Desktop`, "Designs", true),
    createMockEntry(`${mockHome}\\Desktop`, "Todo.txt", false, 1200)
  ]);
  mockEntries.set(`${mockHome}\\Documents`, [
    createMockEntry(`${mockHome}\\Documents`, "Invoices", true),
    createMockEntry(`${mockHome}\\Documents`, "Roadmap.docx", false, 66000)
  ]);
  mockEntries.set(`${mockHome}\\Downloads`, [
    createMockEntry(`${mockHome}\\Downloads`, "Archive.zip", false, 9200000),
    createMockEntry(`${mockHome}\\Downloads`, "Archive.tar", false, 7200000),
    createMockEntry(`${mockHome}\\Downloads`, "Installers", true)
  ]);
  mockEntries.set(`${mockHome}\\Pictures`, [
    createMockEntry(`${mockHome}\\Pictures`, "Screenshots", true),
    createMockEntry(`${mockHome}\\Pictures`, "Mock Preview.png", false, 240000)
  ]);
}

function mockList(path: string): DirectoryPayload {
  seedMockEntries();
  return {
    path,
    entries: [...(mockEntries.get(path) ?? [])],
    scannedAt: Date.now()
  };
}

function mockResult(message: string, affectedPaths: string[] = []): OperationResult {
  return { ok: true, message, affectedPaths };
}

function validateMockItemName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty.");
  if (/[<>:"/\\|?*]/.test(trimmed)) throw new Error("Name contains characters Windows does not allow.");
  if (/[. ]$/.test(trimmed)) throw new Error("Name cannot end with a space or period.");
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(trimmed.split(".")[0])) {
    throw new Error("Name uses a reserved Windows device name.");
  }
  return trimmed;
}

function mockJoin(parent: string, name: string): string {
  return `${parent.replace(/[\\/]+$/, "")}\\${name}`;
}

function mockPathEquals(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function mockIsSameOrChild(candidate: string, parent: string): boolean {
  const normalizedCandidate = candidate.replace(/[\\/]+$/, "").toLowerCase();
  const normalizedParent = parent.replace(/[\\/]+$/, "").toLowerCase();
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}\\`);
}

function findMockEntry(sourcePath: string): FileEntry | null {
  const parent = parentPath(sourcePath);
  return (mockEntries.get(parent) ?? []).find((entry) => mockPathEquals(entry.path, sourcePath)) ?? null;
}

function mockPathExists(targetPath: string): boolean {
  return !!findMockEntry(targetPath) || mockEntries.has(targetPath);
}

function getMockChildren(directoryPath: string): FileEntry[] {
  const directChildren = mockEntries.get(directoryPath);
  if (directChildren) return directChildren;
  const matchingKey = [...mockEntries.keys()].find((key) => mockPathEquals(key, directoryPath));
  return matchingKey ? mockEntries.get(matchingKey) ?? [] : [];
}

function searchMockFiles(options: SearchOptions): FileEntry[] {
  seedMockEntries();
  const query = options.query.trim().toLowerCase();
  if (!query) return [];
  const limit = Math.max(1, Math.min(options.limit || 250, 1000));
  const results: FileEntry[] = [];

  function scan(directoryPath: string): void {
    if (results.length >= limit) return;
    const entries = [...getMockChildren(directoryPath)].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
    );
    for (const entry of entries) {
      if (results.length >= limit) return;
      if (entry.name.toLowerCase().includes(query)) results.push(entry);
      if (options.recursive && entry.isDirectory) scan(entry.path);
    }
  }

  scan(options.rootPath);
  return results;
}

function addMockEntry(parent: string, entry: FileEntry): void {
  const siblings = mockEntries.get(parent) ?? [];
  mockEntries.set(parent, [...siblings.filter((item) => !mockPathEquals(item.path, entry.path)), entry]);
}

function removeMockEntry(sourcePath: string): FileEntry {
  const parent = parentPath(sourcePath);
  const siblings = mockEntries.get(parent) ?? [];
  const entry = siblings.find((item) => mockPathEquals(item.path, sourcePath));
  if (!entry) throw new Error("Item not found.");
  mockEntries.set(parent, siblings.filter((item) => !mockPathEquals(item.path, sourcePath)));
  return entry;
}

function renameMockEntryTree(entry: FileEntry, targetPath: string): FileEntry {
  const renamed: FileEntry = {
    ...entry,
    name: pathName(targetPath),
    path: targetPath,
    parentPath: parentPath(targetPath),
    modifiedAt: Date.now()
  };
  if (entry.isDirectory) {
    const renamedChildren = (mockEntries.get(entry.path) ?? []).map((child) =>
      renameMockEntryTree(child, mockJoin(targetPath, child.name))
    );
    mockEntries.delete(entry.path);
    mockEntries.set(targetPath, renamedChildren);
  }
  return renamed;
}

function deleteMockEntryTree(entry: FileEntry): void {
  if (!entry.isDirectory) return;
  for (const child of mockEntries.get(entry.path) ?? []) {
    deleteMockEntryTree(child);
  }
  mockEntries.delete(entry.path);
}

function mockUniqueTargetPath(targetPath: string): string {
  if (!mockPathExists(targetPath)) return targetPath;
  const parent = parentPath(targetPath);
  const name = pathName(targetPath);
  const extensionIndex = name.lastIndexOf(".");
  const hasExtension = extensionIndex > 0;
  const baseName = hasExtension ? name.slice(0, extensionIndex) : name;
  const extension = hasExtension ? name.slice(extensionIndex) : "";
  for (let index = 1; index < 10000; index += 1) {
    const suffix = index === 1 ? " copy" : ` copy ${index}`;
    const candidate = mockJoin(parent, `${baseName}${suffix}${extension}`);
    if (!mockPathExists(candidate)) return candidate;
  }
  throw new Error("Could not find a unique target name.");
}

function cloneMockEntryTree(entry: FileEntry, targetPath: string): FileEntry {
  const cloned: FileEntry = {
    ...entry,
    name: pathName(targetPath),
    path: targetPath,
    parentPath: parentPath(targetPath),
    createdAt: Date.now(),
    modifiedAt: Date.now()
  };
  if (entry.isDirectory) {
    const clonedChildren = (mockEntries.get(entry.path) ?? []).map((child) =>
      cloneMockEntryTree(child, mockJoin(targetPath, child.name))
    );
    mockEntries.set(targetPath, clonedChildren);
  }
  return cloned;
}

function moveMockEntryTree(entry: FileEntry, targetPath: string): FileEntry {
  const moved: FileEntry = {
    ...entry,
    name: pathName(targetPath),
    path: targetPath,
    parentPath: parentPath(targetPath),
    modifiedAt: Date.now()
  };
  if (entry.isDirectory) {
    const movedChildren = (mockEntries.get(entry.path) ?? []).map((child) =>
      moveMockEntryTree(child, mockJoin(targetPath, child.name))
    );
    mockEntries.delete(entry.path);
    mockEntries.set(targetPath, movedChildren);
  }
  return moved;
}

function getMockPathSuggestionParts(input: string): { parent: string; prefix: string } | null {
  const value = input.trim().replace(/^"|"$/g, "");
  if (!value) return null;
  if (/[\\/]$/.test(value)) {
    return { parent: value.replace(/[\\/]+$/, ""), prefix: "" };
  }
  return { parent: parentPath(value), prefix: pathName(value).toLowerCase() };
}

function mockSuggestPaths(request: PathSuggestionRequest): PathSuggestion[] {
  seedMockEntries();
  const parts = getMockPathSuggestionParts(request.input);
  if (!parts) return [];
  const limit = Math.max(1, Math.min(request.limit || 8, 50));
  return [...(mockEntries.get(parts.parent) ?? [])]
    .filter((entry) => !parts.prefix || entry.name.toLowerCase().startsWith(parts.prefix))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
    })
    .slice(0, limit)
    .map((entry) => ({ path: entry.path, label: entry.name, isDirectory: entry.isDirectory }));
}

function createBrowserMockApi(): SpaceApi {
  return {
    async bootstrap(): Promise<BootstrapPayload> {
      seedMockEntries();
      return {
        homePath: mockHome,
        knownLocations: mockKnownLocations,
        drives: [
          { name: "C:", path: "C:\\", label: "系统", freeBytes: 64 * 1024 ** 3, totalBytes: 256 * 1024 ** 3 },
          { name: "D:", path: "D:\\", label: "数据", freeBytes: 700 * 1024 ** 3, totalBytes: 1024 * 1024 ** 3 }
        ]
      };
    },
    async listDirectory(path: string) {
      return mockList(path || mockHome);
    },
    async searchFiles(options: SearchOptions) {
      return searchMockFiles(options);
    },
    async suggestPaths(request: PathSuggestionRequest) {
      return mockSuggestPaths(request);
    },
    async createFolder(request: CreateItemRequest) {
      const entry = createMockEntry(request.parentPath, validateMockItemName(request.name), true);
      mockEntries.set(request.parentPath, [...(mockEntries.get(request.parentPath) ?? []), entry]);
      mockEntries.set(entry.path, []);
      return entry;
    },
    async createFile(request: CreateItemRequest) {
      const entry = createMockEntry(request.parentPath, validateMockItemName(expandMockDateVariables(request.name)), false);
      mockEntries.set(request.parentPath, [...(mockEntries.get(request.parentPath) ?? []), entry]);
      return entry;
    },
    async renameItem(request: RenameRequest) {
      const parent = parentPath(request.path);
      const newName = validateMockItemName(request.newName);
      const targetPath = mockJoin(parent, newName);
      if (!mockPathEquals(request.path, targetPath) && mockPathExists(targetPath)) {
        throw new Error("A file or folder with that name already exists.");
      }
      const entry = removeMockEntry(request.path);
      const renamed = renameMockEntryTree(entry, targetPath);
      addMockEntry(parent, renamed);
      return renamed;
    },
    async deleteItems(request: DeleteRequest) {
      for (const source of request.paths) {
        const entry = removeMockEntry(source);
        deleteMockEntryTree(entry);
      }
      return mockResult(`Deleted ${request.paths.length} item(s).`, request.paths);
    },
    async copyItems(request: FileOperationRequest) {
      const copied = request.sources.map((source) => {
        const sourceEntry = findMockEntry(source);
        if (!sourceEntry) throw new Error("Item not found.");
        if (sourceEntry.isDirectory && mockIsSameOrChild(request.destination, sourceEntry.path)) {
          throw new Error("Cannot copy a folder into itself.");
        }
        const targetPath = mockUniqueTargetPath(mockJoin(request.destination, sourceEntry.name));
        const cloned = cloneMockEntryTree(sourceEntry, targetPath);
        addMockEntry(request.destination, cloned);
        return targetPath;
      });
      return mockResult(`Copied ${copied.length} item(s).`, copied);
    },
    async moveItems(request: FileOperationRequest) {
      const moved: string[] = [];
      for (const source of request.sources) {
        const sourceEntry = findMockEntry(source);
        if (!sourceEntry) throw new Error("Item not found.");
        if (mockPathEquals(sourceEntry.parentPath, request.destination)) continue;
        if (sourceEntry.isDirectory && mockIsSameOrChild(request.destination, sourceEntry.path)) {
          throw new Error("Cannot move a folder into itself.");
        }
        const removed = removeMockEntry(sourceEntry.path);
        const targetPath = mockUniqueTargetPath(mockJoin(request.destination, removed.name));
        const movedEntry = moveMockEntryTree(removed, targetPath);
        addMockEntry(request.destination, movedEntry);
        moved.push(targetPath);
      }
      return mockResult(`Moved ${moved.length} item(s).`, moved);
    },
    async preview(path: string): Promise<PreviewPayload> {
      return {
        path,
        name: pathName(path),
        kind: path.endsWith(".png") ? "image" : "text",
        size: 1200,
        modifiedAt: Date.now(),
        text: path.endsWith(".png") ? undefined : "Preview is available in the desktop app.",
        dataUrl: path.endsWith(".png")
          ? "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQwIiBoZWlnaHQ9IjE2MCIgdmlld0JveD0iMCAwIDI0MCAxNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjI0MCIgaGVpZ2h0PSIxNjAiIGZpbGw9IiMyMDYzNmYiLz48Y2lyY2xlIGN4PSI4MCIgY3k9IjcwIiByPSIzMiIgZmlsbD0iI2QyZDU5OSIvPjxwYXRoIGQ9Ik0yNSAxMzBsNTUtNDggNDIgMzUgMzAtMjYgNjMgMzloLTE5MHoiIGZpbGw9IiM5NGQyYmQiLz48L3N2Zz4="
          : undefined
      };
    },
    async calculateHash(request: HashRequest): Promise<HashPayload> {
      return { path: request.path, algorithm: request.algorithm, value: "mock-hash-value" };
    },
    async previewBatchRename(request: BatchRenameRequest): Promise<BatchRenamePreview> {
      const items = request.paths.map((sourcePath, index) => {
        const sourceName = pathName(sourcePath);
        const targetName = `${String(request.rule.startNumber + index).padStart(request.rule.padLength, "0")}-${sourceName}`;
        const parent = parentPath(sourcePath);
        return {
          sourcePath,
          targetPath: `${parent}\\${targetName}`,
          sourceName,
          targetName,
          status: "ready" as const
        };
      });
      return { items, canApply: items.length > 0 };
    },
    async applyBatchRename(request: BatchRenameRequest) {
      return mockResult(`Renamed ${request.paths.length} item(s).`, request.paths);
    },
    async previewFolderSync(request: FolderSyncRequest): Promise<FolderSyncPlan> {
      return {
        leftPath: request.leftPath,
        rightPath: request.rightPath,
        actions: [
          {
            type: "copyLeftToRight",
            relativePath: "Mock Sync.txt",
            sourcePath: `${request.leftPath}\\Mock Sync.txt`,
            destinationPath: `${request.rightPath}\\Mock Sync.txt`,
            reason: "missing",
            size: 1200,
            modifiedAt: Date.now()
          }
        ],
        skipped: 0
      };
    },
    async applyFolderSync(request: FolderSyncRequest) {
      return mockResult(`Synchronized ${request.leftPath} with ${request.rightPath}.`, [request.leftPath, request.rightPath]);
    },
    async listArchive(request: ArchiveListRequest): Promise<ArchiveDirectoryPayload> {
      const rootEntries = [
        {
          name: "docs",
          archivePath: request.archivePath,
          internalPath: "docs/",
          parentInternalPath: "",
          isDirectory: true,
          size: 0,
          modifiedAt: Date.now(),
          extension: "",
          typeLabel: "Folder"
        },
        {
          name: "readme.txt",
          archivePath: request.archivePath,
          internalPath: "readme.txt",
          parentInternalPath: "",
          isDirectory: false,
          size: 150,
          modifiedAt: Date.now(),
          extension: ".txt",
          typeLabel: "TXT File"
        }
      ];
      const docsEntries = [
        {
          name: "guide.md",
          archivePath: request.archivePath,
          internalPath: "docs/guide.md",
          parentInternalPath: "docs/",
          isDirectory: false,
          size: 300,
          modifiedAt: Date.now(),
          extension: ".md",
          typeLabel: "MD File"
        }
      ];
      return {
        archivePath: request.archivePath,
        internalPath: request.internalPath,
        entries: request.internalPath === "docs/" ? docsEntries : rootEntries,
        scannedAt: Date.now()
      };
    },
    async previewArchiveEntry(request: ArchivePreviewRequest): Promise<ArchivePreviewPayload> {
      return {
        archivePath: request.archivePath,
        internalPath: request.internalPath,
        name: pathName(request.internalPath),
        kind: "text",
        size: 150,
        modifiedAt: Date.now(),
        text: `Preview for ${request.internalPath}`
      };
    },
    async extractArchive(request: ArchiveExtractRequest) {
      return mockResult(`Extracted ${request.internalPaths.length || 1} item(s).`, [request.destinationPath]);
    },
    async createArchive(request: ArchiveCreateRequest) {
      return mockResult(`Created ${pathName(request.destinationZipPath)}.`, [request.destinationZipPath]);
    },
    async openPath(path: string) {
      return mockResult(`Opened ${path}.`, [path]);
    },
    async revealPath(path: string) {
      return mockResult(`Revealed ${path}.`, [path]);
    },
    async openTerminal(path: string) {
      return mockResult(`Opened Windows Terminal in ${path}.`, [path]);
    },
    async copyTextToClipboard(text: string) {
      const storage = getMockStorage();
      storage?.setItem("space.mock.clipboard", text);
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // The browser fallback can still expose the copied text through localStorage for tests.
        }
      }
      return mockResult("Copied to clipboard.");
    },
    async runQuickLaunch(request) {
      return mockResult(`Launched ${request.item.label}.`, [request.currentPath, ...request.selectedPaths]);
    },
    async runSvnCommand(request) {
      return mockResult(`SVN ${request.command} started for ${request.path}.`, [request.path]);
    },
    async showSystemContextMenu(request) {
      return mockResult(`Opened system context menu for ${request.path}.`, [request.path]);
    },
    async getWorkspace() {
      return loadMockWorkspace();
    },
    async saveWorkspace(snapshot: WorkspaceDocument) {
      saveMockWorkspace(snapshot);
      return mockResult("Workspace saved.");
    },
    async minimizeWindow() {
      return mockResult("Window minimized.");
    },
    async toggleMaximizeWindow() {
      return mockResult("Window toggled.");
    },
    async closeWindow() {
      return mockResult("Window closed.");
    }
  };
}

export function getSpaceApi(): SpaceApi {
  return window.spaceAPI ?? createBrowserMockApi();
}
