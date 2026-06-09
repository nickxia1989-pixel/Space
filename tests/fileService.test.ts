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
  listDirectory,
  moveItems,
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

  it("does not move an item when the destination is already its parent directory", async () => {
    const file = await createFile({ parentPath: tempRoot, name: "same-place.txt" });
    const result = await moveItems({ sources: [file.path], destination: tempRoot });

    expect(result.message).toBe("No items moved.");
    expect(result.affectedPaths).toEqual([]);
    await expect(fs.access(file.path)).resolves.toBeUndefined();
    await expect(fs.access(path.join(tempRoot, "same-place copy.txt"))).rejects.toThrow();
  });
});
