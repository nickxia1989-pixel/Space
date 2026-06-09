// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getSpaceApi } from "../src/api";

describe("browser mock API", () => {
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
});
