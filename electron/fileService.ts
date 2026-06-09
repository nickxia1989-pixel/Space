import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import JSZip from "jszip";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ArchiveCreateRequest,
  ArchiveDirectoryPayload,
  ArchiveEntry,
  ArchiveExtractRequest,
  ArchiveListRequest,
  ArchivePreviewPayload,
  ArchivePreviewRequest,
  BootstrapPayload,
  BatchRenamePreview,
  BatchRenamePreviewItem,
  BatchRenameRequest,
  CreateItemRequest,
  DeleteRequest,
  DirectoryPayload,
  DriveInfo,
  FileEntry,
  FileOperationRequest,
  FolderSyncAction,
  FolderSyncPlan,
  FolderSyncRequest,
  HashPayload,
  HashRequest,
  KnownLocation,
  OperationResult,
  PreviewPayload,
  QuickLaunchRunRequest,
  RenameRequest,
  SearchOptions
} from "../src/shared.js";

const fsp = fs.promises;
const TEXT_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".css",
  ".csv",
  ".html",
  ".ini",
  ".js",
  ".json",
  ".log",
  ".md",
  ".ps1",
  ".py",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml"
]);
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

export function normalizeInputPath(inputPath: string): string {
  if (!inputPath || inputPath.trim() === "") {
    return os.homedir();
  }
  return path.resolve(inputPath);
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function getFileEntry(targetPath: string): Promise<FileEntry> {
  const parentPath = path.dirname(targetPath);
  const name = path.basename(targetPath) || targetPath;
  const stats = await fsp.lstat(targetPath);
  const extension = stats.isDirectory() ? "" : path.extname(name).toLowerCase();
  return {
    name,
    path: targetPath,
    parentPath,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    isSymlink: stats.isSymbolicLink(),
    size: stats.size,
    modifiedAt: stats.mtimeMs,
    createdAt: stats.birthtimeMs,
    extension,
    typeLabel: getTypeLabel(stats, extension),
    hidden: name.startsWith(".")
  };
}

function getTypeLabel(stats: fs.Stats, extension: string): string {
  if (stats.isDirectory()) return "Folder";
  if (stats.isSymbolicLink()) return "Link";
  if (extension) return `${extension.slice(1).toUpperCase()} File`;
  return "File";
}

export function sortEntries(
  entries: FileEntry[],
  sortKey: keyof Pick<FileEntry, "name" | "size" | "modifiedAt" | "typeLabel"> = "name",
  direction: "asc" | "desc" = "asc"
): FileEntry[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    const aValue = sortKey === "typeLabel" ? a.typeLabel : a[sortKey];
    const bValue = sortKey === "typeLabel" ? b.typeLabel : b[sortKey];
    if (typeof aValue === "number" && typeof bValue === "number") {
      return (aValue - bValue) * factor;
    }
    return String(aValue).localeCompare(String(bValue), undefined, { sensitivity: "base", numeric: true }) * factor;
  });
}

export async function listDirectory(directoryPath: string): Promise<DirectoryPayload> {
  const resolvedPath = normalizeInputPath(directoryPath);
  const names = await fsp.readdir(resolvedPath);
  const entries = await Promise.all(
    names.map(async (name) => {
      const childPath = path.join(resolvedPath, name);
      try {
        return await getFileEntry(childPath);
      } catch {
        return null;
      }
    })
  );

  return {
    path: resolvedPath,
    entries: sortEntries(entries.filter((entry): entry is FileEntry => entry !== null)),
    scannedAt: Date.now()
  };
}

export async function listDrives(): Promise<DriveInfo[]> {
  if (process.platform !== "win32") {
    return [{ name: "/", path: "/" }];
  }

  const checks = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(async (letter) => {
    const rootPath = `${letter}:\\`;
    try {
      await fsp.access(rootPath);
      return { name: `${letter}:`, path: rootPath };
    } catch {
      return null;
    }
  });
  const drives = await Promise.all(checks);
  return drives.filter((drive): drive is DriveInfo => drive !== null);
}

export async function getKnownLocations(): Promise<KnownLocation[]> {
  const homePath = os.homedir();
  const candidates: KnownLocation[] = [
    { id: "home", label: "Home", path: homePath, icon: "home" },
    { id: "desktop", label: "Desktop", path: path.join(homePath, "Desktop"), icon: "monitor" },
    { id: "documents", label: "Documents", path: path.join(homePath, "Documents"), icon: "file-text" },
    { id: "downloads", label: "Downloads", path: path.join(homePath, "Downloads"), icon: "download" },
    { id: "pictures", label: "Pictures", path: path.join(homePath, "Pictures"), icon: "image" },
    { id: "music", label: "Music", path: path.join(homePath, "Music"), icon: "music" },
    { id: "videos", label: "Videos", path: path.join(homePath, "Videos"), icon: "video" }
  ];

  const existing = await Promise.all(
    candidates.map(async (location) => ((await pathExists(location.path)) ? location : null))
  );
  return existing.filter((location): location is KnownLocation => location !== null);
}

export async function getBootstrap(): Promise<BootstrapPayload> {
  return {
    homePath: os.homedir(),
    knownLocations: await getKnownLocations(),
    drives: await listDrives()
  };
}

function validateItemName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty.");
  if (/[<>:"/\\|?*]/.test(trimmed)) throw new Error("Name contains characters Windows does not allow.");
  return trimmed;
}

export async function createFolder(request: CreateItemRequest): Promise<FileEntry> {
  const name = validateItemName(request.name);
  const targetPath = await uniqueTargetPath(path.join(normalizeInputPath(request.parentPath), name));
  await fsp.mkdir(targetPath, { recursive: false });
  return getFileEntry(targetPath);
}

export async function createFile(request: CreateItemRequest): Promise<FileEntry> {
  const name = validateItemName(expandDateVariables(request.name));
  const targetPath = await uniqueTargetPath(path.join(normalizeInputPath(request.parentPath), name));
  await fsp.writeFile(targetPath, expandDateVariables(request.content ?? ""), { encoding: "utf8", flag: "wx" });
  return getFileEntry(targetPath);
}

export function expandDateVariables(value: string, date = new Date()): string {
  return value.replace(/\$date\(([^)]+)\)/g, (_match, format: string) => formatDateTemplate(format, date));
}

function formatDateTemplate(format: string, date: Date): string {
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

export async function renameItem(request: RenameRequest): Promise<FileEntry> {
  const newName = validateItemName(request.newName);
  const sourcePath = normalizeInputPath(request.path);
  const targetPath = path.join(path.dirname(sourcePath), newName);
  if (sourcePath.toLowerCase() !== targetPath.toLowerCase() && (await pathExists(targetPath))) {
    throw new Error("A file or folder with that name already exists.");
  }
  await fsp.rename(sourcePath, targetPath);
  return getFileEntry(targetPath);
}

export async function deleteItems(request: DeleteRequest, trashItem?: (path: string) => Promise<void>): Promise<OperationResult> {
  const affectedPaths: string[] = [];
  for (const source of request.paths) {
    const sourcePath = normalizeInputPath(source);
    if (request.permanent || !trashItem) {
      await fsp.rm(sourcePath, { recursive: true, force: true });
    } else {
      await trashItem(sourcePath);
    }
    affectedPaths.push(sourcePath);
  }
  return { ok: true, message: `Deleted ${affectedPaths.length} item(s).`, affectedPaths };
}

export async function copyItems(request: FileOperationRequest): Promise<OperationResult> {
  const destination = normalizeInputPath(request.destination);
  const affectedPaths: string[] = [];
  for (const source of request.sources) {
    const sourcePath = normalizeInputPath(source);
    const targetPath = await uniqueTargetPath(path.join(destination, path.basename(sourcePath)));
    await copyPath(sourcePath, targetPath);
    affectedPaths.push(targetPath);
  }
  return { ok: true, message: `Copied ${affectedPaths.length} item(s).`, affectedPaths };
}

export async function moveItems(request: FileOperationRequest): Promise<OperationResult> {
  const destination = normalizeInputPath(request.destination);
  const affectedPaths: string[] = [];
  for (const source of request.sources) {
    const sourcePath = normalizeInputPath(source);
    if (path.dirname(sourcePath).toLowerCase() === destination.toLowerCase()) {
      continue;
    }
    if (isSameOrChild(destination, sourcePath)) {
      throw new Error("Cannot move a folder into itself.");
    }
    const targetPath = await uniqueTargetPath(path.join(destination, path.basename(sourcePath)));
    try {
      await fsp.rename(sourcePath, targetPath);
    } catch {
      await copyPath(sourcePath, targetPath);
      await fsp.rm(sourcePath, { recursive: true, force: true });
    }
    affectedPaths.push(targetPath);
  }
  return { ok: true, message: affectedPaths.length ? `Moved ${affectedPaths.length} item(s).` : "No items moved.", affectedPaths };
}

export async function uniqueTargetPath(targetPath: string): Promise<string> {
  if (!(await pathExists(targetPath))) return targetPath;
  const parsed = path.parse(targetPath);
  for (let index = 1; index < 10000; index += 1) {
    const suffix = index === 1 ? " copy" : ` copy ${index}`;
    const candidate = path.join(parsed.dir, `${parsed.name}${suffix}${parsed.ext}`);
    if (!(await pathExists(candidate))) return candidate;
  }
  throw new Error("Could not find a unique target name.");
}

async function copyPath(sourcePath: string, targetPath: string): Promise<void> {
  const stats = await fsp.lstat(sourcePath);
  if (stats.isDirectory()) {
    await fsp.cp(sourcePath, targetPath, { recursive: true, errorOnExist: true });
  } else {
    await fsp.copyFile(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
  }
}

function isSameOrChild(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function searchFiles(options: SearchOptions): Promise<FileEntry[]> {
  const query = options.query.trim().toLowerCase();
  if (!query) return [];
  const rootPath = normalizeInputPath(options.rootPath);
  const limit = Math.max(1, Math.min(options.limit || 250, 1000));
  const results: FileEntry[] = [];

  async function scan(directoryPath: string): Promise<void> {
    if (results.length >= limit) return;
    let childNames: string[];
    try {
      childNames = await fsp.readdir(directoryPath);
    } catch {
      return;
    }

    for (const childName of childNames) {
      if (results.length >= limit) return;
      const childPath = path.join(directoryPath, childName);
      let entry: FileEntry;
      try {
        entry = await getFileEntry(childPath);
      } catch {
        continue;
      }
      if (entry.name.toLowerCase().includes(query)) {
        results.push(entry);
      }
      if (options.recursive && entry.isDirectory) {
        await scan(childPath);
      }
    }
  }

  await scan(rootPath);
  return sortEntries(results);
}

export async function previewPath(targetPath: string): Promise<PreviewPayload> {
  const resolvedPath = normalizeInputPath(targetPath);
  if (!(await pathExists(resolvedPath))) {
    return { path: resolvedPath, name: path.basename(resolvedPath), kind: "missing", size: 0, modifiedAt: 0 };
  }

  const stats = await fsp.lstat(resolvedPath);
  const name = path.basename(resolvedPath);
  if (stats.isDirectory()) {
    return { path: resolvedPath, name, kind: "directory", size: stats.size, modifiedAt: stats.mtimeMs };
  }

  const extension = path.extname(name).toLowerCase();
  const imageMime = IMAGE_MIME_BY_EXTENSION[extension];
  if (imageMime && stats.size <= 8 * 1024 * 1024) {
    const data = await fsp.readFile(resolvedPath);
    return {
      path: resolvedPath,
      name,
      kind: "image",
      size: stats.size,
      modifiedAt: stats.mtimeMs,
      dataUrl: `data:${imageMime};base64,${data.toString("base64")}`
    };
  }

  if (TEXT_EXTENSIONS.has(extension) && stats.size <= 1024 * 1024) {
    const data = await fsp.readFile(resolvedPath, "utf8");
    const truncated = data.length > 12000;
    return {
      path: resolvedPath,
      name,
      kind: "text",
      size: stats.size,
      modifiedAt: stats.mtimeMs,
      text: truncated ? data.slice(0, 12000) : data,
      truncated
    };
  }

  return { path: resolvedPath, name, kind: "binary", size: stats.size, modifiedAt: stats.mtimeMs };
}

export async function calculateHash(request: HashRequest): Promise<HashPayload> {
  const targetPath = normalizeInputPath(request.path);
  const hash = createHash(request.algorithm);
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(targetPath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return {
    path: targetPath,
    algorithm: request.algorithm,
    value: hash.digest("hex")
  };
}

export function buildBatchRenamePreview(request: BatchRenameRequest): BatchRenamePreview {
  const targetCounts = new Map<string, number>();
  const items = request.paths.map((sourcePath, index) => {
    const resolvedPath = normalizeInputPath(sourcePath);
    const sourceName = path.basename(resolvedPath);
    const targetName = buildTargetName(sourceName, request.rule, index);
    const targetPath = path.join(path.dirname(resolvedPath), targetName);
    targetCounts.set(targetPath.toLowerCase(), (targetCounts.get(targetPath.toLowerCase()) ?? 0) + 1);
    return {
      sourcePath: resolvedPath,
      targetPath,
      sourceName,
      targetName,
      status: "ready" as const
    };
  });

  const previewItems: BatchRenamePreviewItem[] = items.map((item) => {
    const invalidMessage = validateTargetFileName(item.targetName);
    if (invalidMessage) {
      return { ...item, status: "invalid", message: invalidMessage };
    }
    if (item.sourcePath.toLowerCase() === item.targetPath.toLowerCase()) {
      return { ...item, status: "unchanged", message: "Name is unchanged." };
    }
    if ((targetCounts.get(item.targetPath.toLowerCase()) ?? 0) > 1) {
      return { ...item, status: "conflict", message: "Another selected item would use the same name." };
    }
    return item;
  });

  return {
    items: previewItems,
    canApply: previewItems.some((item) => item.status === "ready") && previewItems.every((item) => item.status === "ready" || item.status === "unchanged")
  };
}

export async function previewBatchRename(request: BatchRenameRequest): Promise<BatchRenamePreview> {
  const preview = buildBatchRenamePreview(request);
  const checkedItems = await Promise.all(
    preview.items.map(async (item) => {
      if (item.status !== "ready") return item;
      if (await pathExists(item.targetPath)) {
        return { ...item, status: "conflict" as const, message: "A file or folder already exists with this name." };
      }
      return item;
    })
  );
  return {
    items: checkedItems,
    canApply: checkedItems.some((item) => item.status === "ready") && checkedItems.every((item) => item.status === "ready" || item.status === "unchanged")
  };
}

export async function applyBatchRename(request: BatchRenameRequest): Promise<OperationResult> {
  const preview = await previewBatchRename(request);
  if (!preview.canApply) {
    throw new Error("Batch rename has conflicts or invalid names.");
  }
  const affectedPaths: string[] = [];
  for (const item of preview.items) {
    if (item.status === "unchanged") continue;
    await fsp.rename(item.sourcePath, item.targetPath);
    affectedPaths.push(item.targetPath);
  }
  return { ok: true, message: `Renamed ${affectedPaths.length} item(s).`, affectedPaths };
}

function buildTargetName(sourceName: string, rule: BatchRenameRequest["rule"], index: number): string {
  const parsed = path.parse(sourceName);
  const sequenceValue = rule.startNumber + index * rule.step;
  const sequence = String(sequenceValue).padStart(Math.max(1, rule.padLength), "0");
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const extension = parsed.ext.startsWith(".") ? parsed.ext.slice(1) : parsed.ext;
  let workingName = rule.includeExtension ? sourceName : parsed.name;

  if (rule.find) {
    if (rule.useRegex) {
      const flags = rule.caseSensitive ? "g" : "gi";
      workingName = workingName.replace(new RegExp(rule.find, flags), rule.replace);
    } else {
      workingName = replaceLiteral(workingName, rule.find, rule.replace, rule.caseSensitive);
    }
  }

  workingName = applyCaseMode(workingName, rule.caseMode);
  const format = rule.pattern.trim() || "{name}";
  const formatted = format
    .replaceAll("{name}", workingName)
    .replaceAll("{ext}", extension)
    .replaceAll("{n}", sequence)
    .replaceAll("{date}", date);
  const composed = `${rule.prefix}${formatted}${rule.suffix}`;
  return rule.includeExtension ? composed : `${composed}${parsed.ext}`;
}

function replaceLiteral(value: string, find: string, replace: string, caseSensitive: boolean): string {
  if (caseSensitive) return value.split(find).join(replace);
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(escaped, "gi"), replace);
}

function applyCaseMode(value: string, mode: BatchRenameRequest["rule"]["caseMode"]): string {
  if (mode === "lower") return value.toLowerCase();
  if (mode === "upper") return value.toUpperCase();
  if (mode === "title") {
    return value.replace(/\p{L}[\p{L}\p{N}]*/gu, (part) => part[0].toUpperCase() + part.slice(1).toLowerCase());
  }
  return value;
}

function validateTargetFileName(name: string): string | undefined {
  if (!name.trim()) return "Name cannot be empty.";
  if (/[<>:"/\\|?*]/.test(name)) return "Name contains characters Windows does not allow.";
  if (/[. ]$/.test(name)) return "Name cannot end with a space or period.";
  return undefined;
}

export async function previewFolderSync(request: FolderSyncRequest): Promise<FolderSyncPlan> {
  const leftPath = normalizeInputPath(request.leftPath);
  const rightPath = normalizeInputPath(request.rightPath);
  if (leftPath.toLowerCase() === rightPath.toLowerCase()) {
    throw new Error("Choose two different folders to synchronize.");
  }
  const leftFiles = await collectSyncFiles(leftPath, request);
  const rightFiles = await collectSyncFiles(rightPath, request);
  const actions: FolderSyncAction[] = [];

  if (request.direction === "updateRight" || request.direction === "updateBoth") {
    for (const [relativePath, leftFile] of leftFiles.files) {
      const rightFile = rightFiles.files.get(relativePath);
      if (!rightFile || leftFile.modifiedAt > rightFile.modifiedAt + 1000) {
        actions.push({
          type: "copyLeftToRight",
          relativePath,
          sourcePath: leftFile.path,
          destinationPath: path.join(rightPath, relativePath),
          reason: rightFile ? "newer" : "missing",
          size: leftFile.size,
          modifiedAt: leftFile.modifiedAt
        });
      }
    }
  }

  if (request.direction === "updateLeft" || request.direction === "updateBoth") {
    for (const [relativePath, rightFile] of rightFiles.files) {
      const leftFile = leftFiles.files.get(relativePath);
      if (!leftFile || rightFile.modifiedAt > leftFile.modifiedAt + 1000) {
        actions.push({
          type: "copyRightToLeft",
          relativePath,
          sourcePath: rightFile.path,
          destinationPath: path.join(leftPath, relativePath),
          reason: leftFile ? "newer" : "missing",
          size: rightFile.size,
          modifiedAt: rightFile.modifiedAt
        });
      }
    }
  }

  return {
    leftPath,
    rightPath,
    actions: actions.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true })),
    skipped: leftFiles.skipped + rightFiles.skipped
  };
}

export async function applyFolderSync(request: FolderSyncRequest): Promise<OperationResult> {
  const plan = await previewFolderSync(request);
  const affectedPaths: string[] = [];
  for (const action of plan.actions) {
    await fsp.mkdir(path.dirname(action.destinationPath), { recursive: true });
    await fsp.copyFile(action.sourcePath, action.destinationPath);
    await fsp.utimes(action.destinationPath, new Date(), new Date(action.modifiedAt));
    affectedPaths.push(action.destinationPath);
  }
  return {
    ok: true,
    message: plan.actions.length ? `Synchronized ${plan.actions.length} item(s).` : "Folders are already synchronized.",
    affectedPaths
  };
}

async function collectSyncFiles(rootPath: string, request: FolderSyncRequest): Promise<{ files: Map<string, FileEntry>; skipped: number }> {
  const files = new Map<string, FileEntry>();
  let skipped = 0;
  const normalizedFilter = request.filter.trim().toLowerCase();

  async function scan(directoryPath: string): Promise<void> {
    let names: string[];
    try {
      names = await fsp.readdir(directoryPath);
    } catch {
      return;
    }
    for (const name of names) {
      const childPath = path.join(directoryPath, name);
      let entry: FileEntry;
      try {
        entry = await getFileEntry(childPath);
      } catch {
        skipped += 1;
        continue;
      }
      const relativePath = path.relative(rootPath, childPath);
      if (!request.includeHidden && entry.hidden) {
        skipped += 1;
        continue;
      }
      if (entry.isDirectory) {
        await scan(childPath);
      } else if (!normalizedFilter || relativePath.toLowerCase().includes(normalizedFilter)) {
        files.set(relativePath, entry);
      } else {
        skipped += 1;
      }
    }
  }

  await scan(rootPath);
  return { files, skipped };
}

export async function listArchive(request: ArchiveListRequest): Promise<ArchiveDirectoryPayload> {
  const archivePath = normalizeInputPath(request.archivePath);
  const zip = await loadZip(archivePath);
  const internalPath = normalizeArchiveDirectory(request.internalPath);
  const entryMap = new Map<string, ArchiveEntry>();

  for (const [rawPath, zipEntry] of Object.entries(zip.files)) {
    const normalizedPath = normalizeArchivePath(rawPath);
    if (!normalizedPath.startsWith(internalPath)) continue;
    const rest = normalizedPath.slice(internalPath.length);
    if (!rest) continue;
    const segment = rest.split("/")[0];
    if (!segment) continue;
    const childInternalPath = `${internalPath}${segment}${rest.includes("/") || zipEntry.dir ? "/" : ""}`;
    const existing = entryMap.get(childInternalPath);
    if (existing) {
      if (!existing.modifiedAt && zipEntry.date) existing.modifiedAt = zipEntry.date.getTime();
      continue;
    }
    const isDirectory = childInternalPath.endsWith("/");
    const extension = isDirectory ? "" : path.posix.extname(segment).toLowerCase();
    entryMap.set(childInternalPath, {
      name: segment,
      archivePath,
      internalPath: childInternalPath,
      parentInternalPath: internalPath,
      isDirectory,
      size: isDirectory ? 0 : getZipEntrySize(zipEntry),
      modifiedAt: zipEntry.date?.getTime() ?? 0,
      extension,
      typeLabel: isDirectory ? "Folder" : extension ? `${extension.slice(1).toUpperCase()} File` : "File"
    });
  }

  return {
    archivePath,
    internalPath,
    entries: [...entryMap.values()].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
    }),
    scannedAt: Date.now()
  };
}

export async function previewArchiveEntry(request: ArchivePreviewRequest): Promise<ArchivePreviewPayload> {
  const archivePath = normalizeInputPath(request.archivePath);
  const internalPath = normalizeArchivePath(request.internalPath);
  const name = path.posix.basename(internalPath.replace(/\/$/, ""));
  const zip = await loadZip(archivePath);
  const zipEntry = zip.file(internalPath);
  if (!zipEntry) {
    const directoryExists = Object.keys(zip.files).some((entryPath) => normalizeArchivePath(entryPath).startsWith(normalizeArchiveDirectory(internalPath)));
    return {
      archivePath,
      internalPath,
      name,
      kind: directoryExists ? "directory" : "missing",
      size: 0,
      modifiedAt: 0
    };
  }

  const extension = path.posix.extname(name).toLowerCase();
  const size = getZipEntrySize(zipEntry);
  const modifiedAt = zipEntry.date?.getTime() ?? 0;
  const imageMime = IMAGE_MIME_BY_EXTENSION[extension];
  if (imageMime && size <= 8 * 1024 * 1024) {
    const data = await zipEntry.async("nodebuffer");
    return {
      archivePath,
      internalPath,
      name,
      kind: "image",
      size,
      modifiedAt,
      dataUrl: `data:${imageMime};base64,${data.toString("base64")}`
    };
  }

  if (TEXT_EXTENSIONS.has(extension) && size <= 1024 * 1024) {
    const text = await zipEntry.async("string");
    const truncated = text.length > 12000;
    return {
      archivePath,
      internalPath,
      name,
      kind: "text",
      size,
      modifiedAt,
      text: truncated ? text.slice(0, 12000) : text,
      truncated
    };
  }

  return { archivePath, internalPath, name, kind: "binary", size, modifiedAt };
}

export async function extractArchive(request: ArchiveExtractRequest): Promise<OperationResult> {
  const archivePath = normalizeInputPath(request.archivePath);
  const destinationPath = normalizeInputPath(request.destinationPath);
  const zip = await loadZip(archivePath);
  const requestedPaths = request.internalPaths.map(normalizeArchivePath).filter(Boolean);
  const selected = requestedPaths.length ? requestedPaths : [""];
  const affectedPaths: string[] = [];

  for (const [rawPath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    const internalPath = normalizeArchivePath(rawPath);
    const shouldExtract = selected.some((selectedPath) => {
      const selectedDirectory = normalizeArchiveDirectory(selectedPath);
      return !selectedPath || internalPath === selectedPath || internalPath.startsWith(selectedDirectory);
    });
    if (!shouldExtract) continue;
    const targetPath = safeDestinationPath(destinationPath, internalPath);
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    const data = await zipEntry.async("nodebuffer");
    await fsp.writeFile(targetPath, data);
    if (zipEntry.date) await fsp.utimes(targetPath, new Date(), zipEntry.date);
    affectedPaths.push(targetPath);
  }

  return {
    ok: true,
    message: affectedPaths.length ? `Extracted ${affectedPaths.length} item(s).` : "No archive entries extracted.",
    affectedPaths
  };
}

export async function createArchive(request: ArchiveCreateRequest): Promise<OperationResult> {
  if (!request.sources.length) throw new Error("Select files or folders to archive.");
  const zip = new JSZip();
  for (const source of request.sources) {
    const sourcePath = normalizeInputPath(source);
    const stats = await fsp.lstat(sourcePath);
    if (stats.isDirectory()) {
      const baseName = path.basename(sourcePath);
      const rootInArchive = request.includeRootFolder ? baseName : "";
      await addDirectoryToZip(zip, sourcePath, rootInArchive);
    } else {
      const data = await fsp.readFile(sourcePath);
      zip.file(path.basename(sourcePath), data, { date: stats.mtime });
    }
  }

  const destinationZipPath = await uniqueTargetPath(ensureZipExtension(normalizeInputPath(request.destinationZipPath)));
  await fsp.mkdir(path.dirname(destinationZipPath), { recursive: true });
  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  await fsp.writeFile(destinationZipPath, content);
  return { ok: true, message: `Created ${path.basename(destinationZipPath)}.`, affectedPaths: [destinationZipPath] };
}

async function addDirectoryToZip(zip: JSZip, directoryPath: string, archiveRoot: string): Promise<void> {
  const names = await fsp.readdir(directoryPath);
  if (archiveRoot) zip.folder(toArchivePath(archiveRoot));
  for (const name of names) {
    const childPath = path.join(directoryPath, name);
    const stats = await fsp.lstat(childPath);
    const archivePath = archiveRoot ? `${toArchivePath(archiveRoot)}/${name}` : name;
    if (stats.isDirectory()) {
      await addDirectoryToZip(zip, childPath, archivePath);
    } else {
      const data = await fsp.readFile(childPath);
      zip.file(toArchivePath(archivePath), data, { date: stats.mtime });
    }
  }
}

async function loadZip(archivePath: string): Promise<JSZip> {
  if (path.extname(archivePath).toLowerCase() !== ".zip") {
    throw new Error("Only ZIP archives are supported in this build.");
  }
  const data = await fsp.readFile(archivePath);
  return JSZip.loadAsync(data);
}

function getZipEntrySize(entry: JSZip.JSZipObject): number {
  const unsafeEntry = entry as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } };
  return unsafeEntry._data?.uncompressedSize ?? 0;
}

function normalizeArchivePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function normalizeArchiveDirectory(value: string): string {
  const normalized = normalizeArchivePath(value);
  if (!normalized) return "";
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function toArchivePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function ensureZipExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase() === ".zip" ? filePath : `${filePath}.zip`;
}

function safeDestinationPath(destinationRoot: string, archiveInternalPath: string): string {
  const targetPath = path.resolve(destinationRoot, ...normalizeArchivePath(archiveInternalPath).split("/").filter(Boolean));
  const relative = path.relative(destinationRoot, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Archive entry escapes the destination folder.");
  }
  return targetPath;
}

export async function openTerminal(directoryPath: string): Promise<OperationResult> {
  const cwd = normalizeInputPath(directoryPath);
  const command = process.platform === "win32" ? "powershell.exe" : "sh";
  const args =
    process.platform === "win32"
      ? ["-NoExit", "-Command", `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'`]
      : ["-lc", `cd "${cwd.replace(/"/g, '\\"')}" && exec "$SHELL"`];
  const child = spawn(command, args, { cwd, detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
  return { ok: true, message: `Opened terminal in ${cwd}.`, affectedPaths: [cwd] };
}

export async function runQuickLaunch(request: QuickLaunchRunRequest): Promise<OperationResult> {
  const cwd = normalizeInputPath(request.currentPath);
  const item = request.item;
  if (!item.enabled) throw new Error("Quick Launch item is disabled.");
  if (!item.command.trim()) throw new Error("Quick Launch command is empty.");

  const invocation = buildQuickLaunchInvocation(request);
  const child = spawn(invocation.command, invocation.args, {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    shell: false
  });
  const spawnError = await waitForImmediateSpawnError(child);
  if (spawnError) throw spawnError;
  child.unref();
  return {
    ok: true,
    message: `Launched ${item.label || item.command}.`,
    affectedPaths: [cwd, ...request.selectedPaths]
  };
}

export function buildQuickLaunchInvocation(request: QuickLaunchRunRequest): { command: string; args: string[] } {
  const item = request.item;
  const context = normalizeQuickLaunchContext(request);
  const command = expandQuickLaunchVariables(item.command, context, "literal").trim();
  const argumentText = expandQuickLaunchVariables(item.arguments, context, item.type === "command" ? "shell" : "literal");
  const openFiles = expandQuickLaunchOpenFiles(item.openFiles, context);

  if (item.type === "command") {
    const commandLine = [command, argumentText, ...openFiles.map(quoteShellArg)].filter(Boolean).join(" ").trim();
    if (!commandLine) throw new Error("Quick Launch command is empty.");
    return process.platform === "win32"
      ? { command: "cmd.exe", args: ["/d", "/s", "/c", commandLine] }
      : { command: "sh", args: ["-lc", commandLine] };
  }

  if (item.type === "shortcut") {
    if (process.platform === "win32") {
      return {
        command: "cmd.exe",
        args: [
          "/d",
          "/s",
          "/c",
          ["start", "\"\"", quoteShellArg(command), argumentText, ...openFiles.map(quoteShellArg)].filter(Boolean).join(" ")
        ]
      };
    }
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    return { command: "sh", args: ["-lc", [opener, quoteShellArg(command), argumentText, ...openFiles.map(quoteShellArg)].filter(Boolean).join(" ")] };
  }

  return {
    command,
    args: [...parseCommandLine(argumentText), ...openFiles]
  };
}

type QuickLaunchExpandMode = "literal" | "shell";

interface QuickLaunchContext {
  currentPath: string;
  selectedPaths: string[];
  selectedFilePaths: string[];
  selectedFolderPaths: string[];
}

function normalizeQuickLaunchContext(request: QuickLaunchRunRequest): QuickLaunchContext {
  return {
    currentPath: normalizeInputPath(request.currentPath),
    selectedPaths: request.selectedPaths.map(normalizeInputPath),
    selectedFilePaths: request.selectedFilePaths.map(normalizeInputPath),
    selectedFolderPaths: request.selectedFolderPaths.map(normalizeInputPath)
  };
}

export function expandQuickLaunchVariables(value: string, context: QuickLaunchContext, mode: QuickLaunchExpandMode = "literal"): string {
  const selectedPaths = context.selectedPaths;
  const firstSelected = selectedPaths[0] ?? context.currentPath;
  const variables: Record<string, string | string[]> = {
    currentPath: context.currentPath,
    selectedPaths,
    selectedFiles: context.selectedFilePaths,
    selectedFolders: context.selectedFolderPaths,
    firstSelected,
    firstName: path.basename(firstSelected),
    selectedNames: selectedPaths.map((itemPath) => path.basename(itemPath))
  };
  return value.replace(/\{([a-zA-Z]+)\}/g, (match, key: string) => {
    const replacement = variables[key];
    if (replacement == null) return match;
    if (Array.isArray(replacement)) {
      return mode === "shell" ? replacement.map(quoteShellArg).join(" ") : replacement.join(" ");
    }
    return mode === "shell" ? quoteShellArg(replacement) : replacement;
  });
}

function expandQuickLaunchOpenFiles(value: string, context: QuickLaunchContext): string[] {
  if (!value.trim()) return [];
  const result: string[] = [];
  const variables: Record<string, string[]> = {
    selectedPaths: context.selectedPaths,
    selectedFiles: context.selectedFilePaths,
    selectedFolders: context.selectedFolderPaths
  };
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const token = line.match(/^\{([a-zA-Z]+)\}$/);
    if (token && variables[token[1]]) {
      result.push(...variables[token[1]]);
    } else {
      result.push(expandQuickLaunchVariables(line, context, "literal"));
    }
  }
  return result;
}

function waitForImmediateSpawnError(child: ReturnType<typeof spawn>): Promise<Error | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      child.removeListener("error", onError);
      if (!error) child.on("error", () => undefined);
      resolve(error);
    };
    const onError = (error: Error) => finish(error);
    child.once("error", onError);
    setTimeout(() => finish(null), 50);
  });
}

function parseCommandLine(value: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if ((char === "\"" || char === "'") && quote === null) {
      quote = char;
      continue;
    }
    if (quote === char) {
      quote = null;
      continue;
    }
    if (/\s/.test(char) && quote === null) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) args.push(current);
  return args;
}

function quoteShellArg(value: string): string {
  if (process.platform === "win32") return `"${value.replace(/"/g, "\\\"")}"`;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

// Allows tests to create temp paths that match runtime normalization.
export const __filenameForTests = fileURLToPath(import.meta.url);
