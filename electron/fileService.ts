import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BootstrapPayload,
  CreateItemRequest,
  DeleteRequest,
  DirectoryPayload,
  DriveInfo,
  FileEntry,
  FileOperationRequest,
  HashPayload,
  HashRequest,
  KnownLocation,
  OperationResult,
  PreviewPayload,
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
  const name = validateItemName(request.name);
  const targetPath = await uniqueTargetPath(path.join(normalizeInputPath(request.parentPath), name));
  const handle = await fsp.open(targetPath, "wx");
  await handle.close();
  return getFileEntry(targetPath);
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

// Allows tests to create temp paths that match runtime normalization.
export const __filenameForTests = fileURLToPath(import.meta.url);
