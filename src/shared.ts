export type SortKey = "name" | "size" | "modifiedAt" | "type";
export type SortDirection = "asc" | "desc";
export type ViewMode = "details" | "icons";
export type LayoutMode = "grid" | "columns" | "rows" | "focus";
export type ClipboardMode = "copy" | "cut";
export type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";
export type RenameCaseMode = "none" | "lower" | "upper" | "title";
export type FolderSyncDirection = "updateRight" | "updateLeft" | "updateBoth";
export type FolderSyncActionType = "copyLeftToRight" | "copyRightToLeft";

export interface FileEntry {
  name: string;
  path: string;
  parentPath: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  size: number;
  modifiedAt: number;
  createdAt: number;
  extension: string;
  typeLabel: string;
  hidden: boolean;
}

export interface DirectoryPayload {
  path: string;
  entries: FileEntry[];
  freeBytes?: number;
  totalBytes?: number;
  scannedAt: number;
}

export interface DriveInfo {
  name: string;
  path: string;
  freeBytes?: number;
  totalBytes?: number;
}

export interface KnownLocation {
  id: string;
  label: string;
  path: string;
  icon: string;
}

export interface BootstrapPayload {
  homePath: string;
  knownLocations: KnownLocation[];
  drives: DriveInfo[];
}

export interface PreviewPayload {
  path: string;
  name: string;
  kind: "image" | "text" | "directory" | "binary" | "missing";
  size: number;
  modifiedAt: number;
  dataUrl?: string;
  text?: string;
  truncated?: boolean;
}

export interface WorkspacePaneSnapshot {
  id: number;
  path: string;
  history: string[];
  historyIndex: number;
  sortKey: SortKey;
  sortDirection: SortDirection;
  viewMode: ViewMode;
}

export interface WorkspaceSnapshot {
  layout: LayoutMode;
  activePaneId: number;
  panes: WorkspacePaneSnapshot[];
  bookmarks: KnownLocation[];
  savedAt: number;
}

export interface OperationResult {
  ok: boolean;
  message: string;
  affectedPaths?: string[];
}

export interface SearchOptions {
  rootPath: string;
  query: string;
  recursive: boolean;
  limit: number;
}

export interface FileOperationRequest {
  sources: string[];
  destination: string;
}

export interface RenameRequest {
  path: string;
  newName: string;
}

export interface CreateItemRequest {
  parentPath: string;
  name: string;
}

export interface DeleteRequest {
  paths: string[];
  permanent?: boolean;
}

export interface HashRequest {
  path: string;
  algorithm: HashAlgorithm;
}

export interface HashPayload {
  path: string;
  algorithm: HashAlgorithm;
  value: string;
}

export interface BatchRenameRule {
  pattern: string;
  startNumber: number;
  step: number;
  padLength: number;
  prefix: string;
  suffix: string;
  find: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
  caseMode: RenameCaseMode;
  includeExtension: boolean;
}

export interface BatchRenameRequest {
  paths: string[];
  rule: BatchRenameRule;
}

export interface BatchRenamePreviewItem {
  sourcePath: string;
  targetPath: string;
  sourceName: string;
  targetName: string;
  status: "ready" | "unchanged" | "conflict" | "invalid";
  message?: string;
}

export interface BatchRenamePreview {
  items: BatchRenamePreviewItem[];
  canApply: boolean;
}

export interface FolderSyncRequest {
  leftPath: string;
  rightPath: string;
  direction: FolderSyncDirection;
  includeHidden: boolean;
  filter: string;
}

export interface FolderSyncAction {
  type: FolderSyncActionType;
  relativePath: string;
  sourcePath: string;
  destinationPath: string;
  reason: "missing" | "newer";
  size: number;
  modifiedAt: number;
}

export interface FolderSyncPlan {
  leftPath: string;
  rightPath: string;
  actions: FolderSyncAction[];
  skipped: number;
}

export interface SpaceApi {
  bootstrap(): Promise<BootstrapPayload>;
  listDirectory(path: string): Promise<DirectoryPayload>;
  searchFiles(options: SearchOptions): Promise<FileEntry[]>;
  createFolder(request: CreateItemRequest): Promise<FileEntry>;
  createFile(request: CreateItemRequest): Promise<FileEntry>;
  renameItem(request: RenameRequest): Promise<FileEntry>;
  deleteItems(request: DeleteRequest): Promise<OperationResult>;
  copyItems(request: FileOperationRequest): Promise<OperationResult>;
  moveItems(request: FileOperationRequest): Promise<OperationResult>;
  preview(path: string): Promise<PreviewPayload>;
  calculateHash(request: HashRequest): Promise<HashPayload>;
  previewBatchRename(request: BatchRenameRequest): Promise<BatchRenamePreview>;
  applyBatchRename(request: BatchRenameRequest): Promise<OperationResult>;
  previewFolderSync(request: FolderSyncRequest): Promise<FolderSyncPlan>;
  applyFolderSync(request: FolderSyncRequest): Promise<OperationResult>;
  openPath(path: string): Promise<OperationResult>;
  revealPath(path: string): Promise<OperationResult>;
  openTerminal(path: string): Promise<OperationResult>;
  getWorkspace(): Promise<WorkspaceSnapshot | null>;
  saveWorkspace(snapshot: WorkspaceSnapshot): Promise<OperationResult>;
}

declare global {
  interface Window {
    spaceAPI?: SpaceApi;
  }
}
