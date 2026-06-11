// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { __resetBrowserMockFileSystemForTests, getSpaceApi } from "../src/api";

describe("browser mock API", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetBrowserMockFileSystemForTests();
  });

  it("keeps directory children reachable after rename and removes them after delete", async () => {
    const api = getSpaceApi();
    const desktopPath = "C:\\Users\\Traveler\\Desktop";
    const folder = await api.createFolder({ parentPath: desktopPath, name: "Project" });
    await api.createFile({ parentPath: folder.path, name: "notes.txt" });

    const renamed = await api.renameItem({ path: folder.path, newName: "Archive" });
    expect(renamed.path).toBe(`${desktopPath}\\Archive`);

    const renamedFolder = await api.listDirectory(renamed.path);
    expect(renamedFolder.entries.map((entry) => entry.path)).toEqual([`${desktopPath}\\Archive\\notes.txt`]);

    await api.deleteItems({ paths: [renamed.path] });
    const search = await api.searchFiles({ rootPath: desktopPath, query: "notes", recursive: true, limit: 10 });
    expect(search).toEqual([]);
  });

  it("rejects browser mock rename conflicts like the desktop service", async () => {
    const api = getSpaceApi();
    await api.bootstrap();
    const desktopPath = "C:\\Users\\Traveler\\Desktop";

    await expect(
      api.renameItem({ path: `${desktopPath}\\Todo.txt`, newName: "Project Brief.pdf" })
    ).rejects.toThrow("A file or folder with that name already exists.");
  });

  it("rejects Windows-invalid browser mock item names", async () => {
    const api = getSpaceApi();
    await api.bootstrap();
    const desktopPath = "C:\\Users\\Traveler\\Desktop";

    await expect(api.createFile({ parentPath: desktopPath, name: "bad." })).rejects.toThrow(
      "Name cannot end with a space or period."
    );
    await expect(api.createFolder({ parentPath: desktopPath, name: "NUL" })).rejects.toThrow(
      "Name uses a reserved Windows device name."
    );
    await expect(api.renameItem({ path: `${desktopPath}\\Todo.txt`, newName: "COM1.txt" })).rejects.toThrow(
      "Name uses a reserved Windows device name."
    );
  });

  it("searches only inside the requested root and respects recursion and limits", async () => {
    const api = getSpaceApi();
    const bootstrap = await api.bootstrap();
    const downloadsPath = `${bootstrap.homePath}\\Downloads`;

    await expect(
      api.searchFiles({ rootPath: bootstrap.homePath, query: "Archive", recursive: false, limit: 10 })
    ).resolves.toEqual([]);

    const recursiveResults = await api.searchFiles({
      rootPath: bootstrap.homePath,
      query: "Archive",
      recursive: true,
      limit: 10
    });
    expect(recursiveResults.map((entry) => entry.path)).toEqual([
      `${downloadsPath}\\Archive.tar`,
      `${downloadsPath}\\Archive.zip`
    ]);

    const limitedResults = await api.searchFiles({
      rootPath: downloadsPath,
      query: "Archive",
      recursive: false,
      limit: 1
    });
    expect(limitedResults.map((entry) => entry.path)).toEqual([`${downloadsPath}\\Archive.tar`]);
  });
});
