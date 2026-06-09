// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  calculateHash,
  copyItems,
  createFile,
  createFolder,
  deleteItems,
  applyBatchRename,
  applyFolderSync,
  buildQuickLaunchInvocation,
  createArchive,
  extractArchive,
  expandQuickLaunchVariables,
  expandDateVariables,
  listDirectory,
  listArchive,
  moveItems,
  previewBatchRename,
  previewArchiveEntry,
  previewFolderSync,
  previewPath,
  renameItem,
  searchFiles
} from "../electron/fileService";

let tempRoot = "";

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "space-file-service-"));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe("fileService", () => {
  it("creates, lists, renames, searches, hashes, copies, moves, previews, and deletes files", async () => {
    const folder = await createFolder({ parentPath: tempRoot, name: "Alpha" });
    expect(folder.isDirectory).toBe(true);

    const file = await createFile({ parentPath: folder.path, name: "note.txt" });
    await fs.writeFile(file.path, "hello space", "utf8");

    const renamed = await renameItem({ path: file.path, newName: "notes.md" });
    expect(renamed.name).toBe("notes.md");

    const listed = await listDirectory(folder.path);
    expect(listed.entries.map((entry) => entry.name)).toContain("notes.md");

    const found = await searchFiles({ rootPath: tempRoot, query: "notes", recursive: true, limit: 25 });
    expect(found.map((entry) => entry.path)).toContain(renamed.path);

    const hash = await calculateHash({ path: renamed.path, algorithm: "sha256" });
    expect(hash.value).toBe("611c18c01d7c00df07569d689a719fec4a5ffdef4e465c7952e01d5b7ac42c36");

    const copyTarget = await createFolder({ parentPath: tempRoot, name: "CopyTarget" });
    const copyResult = await copyItems({ sources: [renamed.path], destination: copyTarget.path });
    expect(copyResult.affectedPaths?.[0]).toMatch(/notes\.md$/);
    await expect(fs.access(copyResult.affectedPaths![0])).resolves.toBeUndefined();

    const moveTarget = await createFolder({ parentPath: tempRoot, name: "MoveTarget" });
    const moveResult = await moveItems({ sources: [copyResult.affectedPaths![0]], destination: moveTarget.path });
    await expect(fs.access(moveResult.affectedPaths![0])).resolves.toBeUndefined();
    await expect(fs.access(copyResult.affectedPaths![0])).rejects.toThrow();

    const preview = await previewPath(renamed.path);
    expect(preview.kind).toBe("text");
    expect(preview.text).toContain("hello space");

    await deleteItems({ paths: [folder.path, copyTarget.path, moveTarget.path], permanent: true });
    await expect(fs.access(folder.path)).rejects.toThrow();
  });

  it("creates collision-safe copies", async () => {
    const file = await createFile({ parentPath: tempRoot, name: "report.txt" });
    await fs.writeFile(file.path, "content", "utf8");

    const firstCopy = await copyItems({ sources: [file.path], destination: tempRoot });
    const secondCopy = await copyItems({ sources: [file.path], destination: tempRoot });

    expect(path.basename(firstCopy.affectedPaths![0])).toBe("report copy.txt");
    expect(path.basename(secondCopy.affectedPaths![0])).toBe("report copy 2.txt");
  });

  it("creates files from template content and expands date variables", async () => {
    expect(expandDateVariables("note-$date(yyyy-MM-dd).md", new Date("2026-06-09T10:11:12"))).toBe(
      "note-2026-06-09.md"
    );

    const year = String(new Date().getFullYear());
    const file = await createFile({
      parentPath: tempRoot,
      name: "report-$date(yyyy).md",
      content: "# Report $date(yyyy)\n"
    });

    expect(path.basename(file.path)).toBe(`report-${year}.md`);
    await expect(fs.readFile(file.path, "utf8")).resolves.toBe(`# Report ${year}\n`);
  });

  it("expands Quick Launch variables and builds app invocations", async () => {
    const selectedFile = path.join(tempRoot, "note.txt");
    const selectedFolder = path.join(tempRoot, "Folder");
    const context = {
      currentPath: tempRoot,
      selectedPaths: [selectedFile, selectedFolder],
      selectedFilePaths: [selectedFile],
      selectedFolderPaths: [selectedFolder]
    };

    expect(expandQuickLaunchVariables("{firstName} in {currentPath}", context)).toBe(`note.txt in ${tempRoot}`);

    const invocation = buildQuickLaunchInvocation({
      item: {
        id: "ql-test",
        label: "Editor",
        enabled: true,
        type: "app",
        command: "code",
        arguments: "--reuse-window \"{currentPath}\"",
        openFiles: "{selectedFiles}",
        icon: "code",
        createdAt: 1
      },
      ...context
    });

    expect(invocation.command).toBe("code");
    expect(invocation.args).toEqual(["--reuse-window", tempRoot, selectedFile]);

    const commandInvocation = buildQuickLaunchInvocation({
      item: {
        id: "ql-terminal",
        label: "Terminal",
        enabled: true,
        type: "command",
        command: "powershell.exe",
        arguments: "Set-Location {currentPath}",
        openFiles: "",
        icon: "terminal",
        createdAt: 1
      },
      ...context
    });
    expect(commandInvocation.args.join(" ")).not.toContain("note.txt");
  });

  it("does not move an item when the destination is already its parent directory", async () => {
    const file = await createFile({ parentPath: tempRoot, name: "same-place.txt" });
    const result = await moveItems({ sources: [file.path], destination: tempRoot });

    expect(result.message).toBe("No items moved.");
    expect(result.affectedPaths).toEqual([]);
    await expect(fs.access(file.path)).resolves.toBeUndefined();
    await expect(fs.access(path.join(tempRoot, "same-place copy.txt"))).rejects.toThrow();
  });

  it("previews and applies batch rename rules with sequence tokens", async () => {
    const first = await createFile({ parentPath: tempRoot, name: "alpha.txt" });
    const second = await createFile({ parentPath: tempRoot, name: "beta.txt" });
    const rule = {
      pattern: "asset-{n}-{name}",
      startNumber: 3,
      step: 2,
      padLength: 3,
      prefix: "",
      suffix: "",
      find: "",
      replace: "",
      useRegex: false,
      caseSensitive: false,
      caseMode: "upper" as const,
      includeExtension: false
    };

    const preview = await previewBatchRename({ paths: [first.path, second.path], rule });
    expect(preview.canApply).toBe(true);
    expect(preview.items.map((item) => item.targetName)).toEqual(["asset-003-ALPHA.txt", "asset-005-BETA.txt"]);

    const result = await applyBatchRename({ paths: [first.path, second.path], rule });
    expect(result.affectedPaths?.map((targetPath) => path.basename(targetPath))).toEqual([
      "asset-003-ALPHA.txt",
      "asset-005-BETA.txt"
    ]);
    await expect(fs.access(path.join(tempRoot, "asset-003-ALPHA.txt"))).resolves.toBeUndefined();
  });

  it("blocks batch rename conflicts before applying changes", async () => {
    const first = await createFile({ parentPath: tempRoot, name: "one.txt" });
    const second = await createFile({ parentPath: tempRoot, name: "two.txt" });
    const preview = await previewBatchRename({
      paths: [first.path, second.path],
      rule: {
        pattern: "same",
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
      }
    });

    expect(preview.canApply).toBe(false);
    expect(preview.items.every((item) => item.status === "conflict")).toBe(true);
    await expect(fs.access(first.path)).resolves.toBeUndefined();
    await expect(fs.access(second.path)).resolves.toBeUndefined();
  });

  it("allows batch rename previews with unchanged items and applies only changed items", async () => {
    const unchanged = await createFile({ parentPath: tempRoot, name: "keep.txt" });
    const changed = await createFile({ parentPath: tempRoot, name: "rename.md" });
    const preview = await previewBatchRename({
      paths: [unchanged.path, changed.path],
      rule: {
        pattern: "{name}",
        startNumber: 1,
        step: 1,
        padLength: 2,
        prefix: "",
        suffix: "",
        find: "rename",
        replace: "renamed",
        useRegex: false,
        caseSensitive: false,
        caseMode: "none",
        includeExtension: false
      }
    });

    expect(preview.canApply).toBe(true);
    expect(preview.items.map((item) => item.status)).toEqual(["unchanged", "ready"]);
    const result = await applyBatchRename({ paths: [unchanged.path, changed.path], rule: previewRuleFromTest() });
    expect(result.affectedPaths?.map((targetPath) => path.basename(targetPath))).toEqual(["renamed.md"]);
    await expect(fs.access(unchanged.path)).resolves.toBeUndefined();
  });

  it("previews and applies one-way folder sync for missing and newer files", async () => {
    const left = await createFolder({ parentPath: tempRoot, name: "Left" });
    const right = await createFolder({ parentPath: tempRoot, name: "Right" });
    const leftNew = path.join(left.path, "new.txt");
    const leftShared = path.join(left.path, "shared.txt");
    const rightShared = path.join(right.path, "shared.txt");
    await fs.writeFile(leftNew, "new file", "utf8");
    await fs.writeFile(leftShared, "newer", "utf8");
    await fs.writeFile(rightShared, "older", "utf8");
    const oldDate = new Date(Date.now() - 60_000);
    const newDate = new Date(Date.now());
    await fs.utimes(rightShared, oldDate, oldDate);
    await fs.utimes(leftShared, newDate, newDate);

    const request = {
      leftPath: left.path,
      rightPath: right.path,
      direction: "updateRight" as const,
      includeHidden: false,
      filter: ""
    };
    const plan = await previewFolderSync(request);
    expect(plan.actions.map((action) => action.relativePath).sort()).toEqual(["new.txt", "shared.txt"]);

    const result = await applyFolderSync(request);
    expect(result.affectedPaths).toHaveLength(2);
    await expect(fs.readFile(path.join(right.path, "new.txt"), "utf8")).resolves.toBe("new file");
    await expect(fs.readFile(rightShared, "utf8")).resolves.toBe("newer");
  });

  it("rejects folder sync when both sides point to the same directory", async () => {
    await expect(
      previewFolderSync({
        leftPath: tempRoot,
        rightPath: tempRoot,
        direction: "updateBoth",
        includeHidden: false,
        filter: ""
      })
    ).rejects.toThrow("Choose two different folders");
  });

  it("creates, lists, previews, and extracts zip archives", async () => {
    const sourceFolder = await createFolder({ parentPath: tempRoot, name: "ArchiveSource" });
    const nestedFolder = await createFolder({ parentPath: sourceFolder.path, name: "docs" });
    await fs.writeFile(path.join(sourceFolder.path, "readme.txt"), "zip preview text", "utf8");
    await fs.writeFile(path.join(nestedFolder.path, "guide.md"), "# Guide", "utf8");
    const destinationZipPath = path.join(tempRoot, "bundle.zip");

    const created = await createArchive({
      sources: [sourceFolder.path],
      destinationZipPath,
      includeRootFolder: true
    });
    expect(created.affectedPaths).toEqual([destinationZipPath]);

    const root = await listArchive({ archivePath: destinationZipPath, internalPath: "" });
    expect(root.entries.map((entry) => entry.name)).toEqual(["ArchiveSource"]);

    const source = await listArchive({ archivePath: destinationZipPath, internalPath: "ArchiveSource/" });
    expect(source.entries.map((entry) => entry.name).sort()).toEqual(["docs", "readme.txt"]);

    const preview = await previewArchiveEntry({
      archivePath: destinationZipPath,
      internalPath: "ArchiveSource/readme.txt"
    });
    expect(preview.kind).toBe("text");
    expect(preview.text).toContain("zip preview text");

    const extractTarget = await createFolder({ parentPath: tempRoot, name: "Extracted" });
    const extracted = await extractArchive({
      archivePath: destinationZipPath,
      destinationPath: extractTarget.path,
      internalPaths: ["ArchiveSource/docs/"]
    });
    expect(extracted.affectedPaths?.map((targetPath) => path.relative(extractTarget.path, targetPath))).toEqual([
      path.join("ArchiveSource", "docs", "guide.md")
    ]);
    await expect(fs.readFile(path.join(extractTarget.path, "ArchiveSource", "docs", "guide.md"), "utf8")).resolves.toBe("# Guide");
  });
});

function previewRuleFromTest() {
  return {
    pattern: "{name}",
    startNumber: 1,
    step: 1,
    padLength: 2,
    prefix: "",
    suffix: "",
    find: "rename",
    replace: "renamed",
    useRegex: false,
    caseSensitive: false,
    caseMode: "none" as const,
    includeExtension: false
  };
}
