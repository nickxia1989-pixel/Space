import type {
  BootstrapPayload,
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
  { id: "home", label: "Home", path: mockHome, icon: "home" },
  { id: "desktop", label: "Desktop", path: `${mockHome}\\Desktop`, icon: "monitor" },
  { id: "documents", label: "Documents", path: `${mockHome}\\Documents`, icon: "file-text" },
  { id: "downloads", label: "Downloads", path: `${mockHome}\\Downloads`, icon: "download" },
  { id: "pictures", label: "Pictures", path: `${mockHome}\\Pictures`, icon: "image" }
];

let mockWorkspace: WorkspaceDocument | null = null;
const mockEntries = new Map<string, FileEntry[]>();

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
    typeLabel: isDirectory ? "Folder" : extension ? `${extension.slice(1).toUpperCase()} File` : "File",
    hidden: name.startsWith(".")
  };
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

function createBrowserMockApi(): SpaceApi {
  return {
    async bootstrap(): Promise<BootstrapPayload> {
      seedMockEntries();
      return {
        homePath: mockHome,
        knownLocations: mockKnownLocations,
        drives: [{ name: "C:", path: "C:\\" }, { name: "D:", path: "D:\\" }]
      };
    },
    async listDirectory(path: string) {
      return mockList(path || mockHome);
    },
    async searchFiles(options: SearchOptions) {
      seedMockEntries();
      const query = options.query.toLowerCase();
      return [...mockEntries.values()].flat().filter((entry) => entry.name.toLowerCase().includes(query));
    },
    async createFolder(request: CreateItemRequest) {
      const entry = createMockEntry(request.parentPath, request.name, true);
      mockEntries.set(request.parentPath, [...(mockEntries.get(request.parentPath) ?? []), entry]);
      mockEntries.set(entry.path, []);
      return entry;
    },
    async createFile(request: CreateItemRequest) {
      const entry = createMockEntry(request.parentPath, request.name, false);
      mockEntries.set(request.parentPath, [...(mockEntries.get(request.parentPath) ?? []), entry]);
      return entry;
    },
    async renameItem(request: RenameRequest) {
      const parent = parentPath(request.path);
      const entries = mockEntries.get(parent) ?? [];
      const target = entries.find((entry) => entry.path === request.path);
      if (!target) throw new Error("Item not found.");
      target.name = request.newName;
      target.path = `${parent}\\${request.newName}`;
      return target;
    },
    async deleteItems(request: DeleteRequest) {
      for (const source of request.paths) {
        const parent = parentPath(source);
        mockEntries.set(
          parent,
          (mockEntries.get(parent) ?? []).filter((entry) => entry.path !== source)
        );
      }
      return mockResult(`Deleted ${request.paths.length} item(s).`, request.paths);
    },
    async copyItems(request: FileOperationRequest) {
      const copied = request.sources.map((source) => `${request.destination}\\${pathName(source)}`);
      return mockResult(`Copied ${copied.length} item(s).`, copied);
    },
    async moveItems(request: FileOperationRequest) {
      const moved = request.sources.map((source) => `${request.destination}\\${pathName(source)}`);
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
    async openPath(path: string) {
      return mockResult(`Opened ${path}.`, [path]);
    },
    async revealPath(path: string) {
      return mockResult(`Revealed ${path}.`, [path]);
    },
    async openTerminal(path: string) {
      return mockResult(`Opened terminal in ${path}.`, [path]);
    },
    async getWorkspace() {
      return mockWorkspace;
    },
    async saveWorkspace(snapshot: WorkspaceDocument) {
      mockWorkspace = snapshot;
      return mockResult("Workspace saved.");
    }
  };
}

export function getSpaceApi(): SpaceApi {
  return window.spaceAPI ?? createBrowserMockApi();
}
