export type SortKey = "name" | "size" | "modifiedAt" | "type";
export type SortDirection = "asc" | "desc";
export type ViewMode = "details" | "icons";
export type LayoutMode = "grid" | "columns" | "rows" | "focus";
export type ClipboardMode = "copy" | "cut";
export type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";
export type RenameCaseMode = "none" | "lower" | "upper" | "title";
export type FolderSyncDirection = "updateRight" | "updateLeft" | "updateBoth";
export type FolderSyncActionType = "copyLeftToRight" | "copyRightToLeft";
export type ArchivePreviewKind = "image" | "text" | "directory" | "binary" | "missing";
export type ColorRuleTarget = "all" | "files" | "folders";
export type ColorRuleNameMatch = "contains" | "startsWith" | "endsWith" | "equals" | "regex";
export type ColorRuleComparison = "any" | "greaterThan" | "lessThan";
export type ColorRuleTimeUnit = "minutes" | "hours" | "days";
export type QuickLaunchType = "app" | "command" | "shortcut";

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

export interface StashShelfItem {
  path: string;
  label: string;
  isDirectory: boolean;
  size: number;
  addedAt: number;
}

export interface NewFileTemplate {
  id: string;
  label: string;
  fileName: string;
  content: string;
  createdAt: number;
}

export interface ColorRule {
  id: string;
  label: string;
  enabled: boolean;
  target: ColorRuleTarget;
  textColor: string;
  backgroundColor: string;
  nameMatch: ColorRuleNameMatch;
  namePattern: string;
  extensions: string;
  sizeComparison: ColorRuleComparison;
  sizeValueMB: number;
  modifiedComparison: ColorRuleComparison;
  modifiedValue: number;
  modifiedUnit: ColorRuleTimeUnit;
  createdComparison: ColorRuleComparison;
  createdValue: number;
  createdUnit: ColorRuleTimeUnit;
  createdAt: number;
}

export interface QuickLaunchItem {
  id: string;
  label: string;
  enabled: boolean;
  type: QuickLaunchType;
  command: string;
  arguments: string;
  openFiles: string;
  icon: string;
  createdAt: number;
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
  stashItems?: StashShelfItem[];
  fileTemplates?: NewFileTemplate[];
  colorRules?: ColorRule[];
  quickLaunchItems?: QuickLaunchItem[];
  batchRenamePresets?: BatchRenamePreset[];
  batchRenameHistory?: BatchRenameHistoryEntry[];
  toolbarActionIds?: string[];
  contextMenuActionIds?: string[];
  savedAt: number;
}

export interface WorkspaceRecord extends WorkspaceSnapshot {
  id: string;
  name: string;
}

export interface WorkspaceDocument {
  activeWorkspaceId: string;
  workspaces: WorkspaceRecord[];
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
  content?: string;
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

export interface BatchRenamePreset {
  id: string;
  name: string;
  rule: BatchRenameRule;
  createdAt: number;
  updatedAt: number;
}

export interface BatchRenameHistoryItem {
  sourcePath: string;
  targetPath: string;
  sourceName: string;
  targetName: string;
}

export interface BatchRenameHistoryEntry {
  id: string;
  performedAt: number;
  itemCount: number;
  changedCount: number;
  message: string;
  rule: BatchRenameRule;
  items: BatchRenameHistoryItem[];
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

export interface ArchiveEntry {
  name: string;
  archivePath: string;
  internalPath: string;
  parentInternalPath: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
  extension: string;
  typeLabel: string;
}

export interface ArchiveDirectoryPayload {
  archivePath: string;
  internalPath: string;
  entries: ArchiveEntry[];
  scannedAt: number;
}

export interface ArchiveListRequest {
  archivePath: string;
  internalPath: string;
}

export interface ArchivePreviewRequest {
  archivePath: string;
  internalPath: string;
}

export interface ArchivePreviewPayload {
  archivePath: string;
  internalPath: string;
  name: string;
  kind: ArchivePreviewKind;
  size: number;
  modifiedAt: number;
  dataUrl?: string;
  text?: string;
  truncated?: boolean;
}

export interface ArchiveExtractRequest {
  archivePath: string;
  destinationPath: string;
  internalPaths: string[];
}

export interface ArchiveCreateRequest {
  sources: string[];
  destinationZipPath: string;
  includeRootFolder: boolean;
}

export interface QuickLaunchRunRequest {
  item: QuickLaunchItem;
  currentPath: string;
  selectedPaths: string[];
  selectedFilePaths: string[];
  selectedFolderPaths: string[];
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
  listArchive(request: ArchiveListRequest): Promise<ArchiveDirectoryPayload>;
  previewArchiveEntry(request: ArchivePreviewRequest): Promise<ArchivePreviewPayload>;
  extractArchive(request: ArchiveExtractRequest): Promise<OperationResult>;
  createArchive(request: ArchiveCreateRequest): Promise<OperationResult>;
  openPath(path: string): Promise<OperationResult>;
  revealPath(path: string): Promise<OperationResult>;
  openTerminal(path: string): Promise<OperationResult>;
  runQuickLaunch(request: QuickLaunchRunRequest): Promise<OperationResult>;
  getWorkspace(): Promise<WorkspaceDocument | null>;
  saveWorkspace(snapshot: WorkspaceDocument): Promise<OperationResult>;
}

declare global {
  interface Window {
    spaceAPI?: SpaceApi;
  }
}
