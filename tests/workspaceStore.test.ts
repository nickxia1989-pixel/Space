// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "../electron/workspaceStore";
import type { WorkspaceDocument, WorkspaceSnapshot } from "../src/shared";

let tempRoot = "";

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "space-workspace-store-"));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function oldSnapshot(): WorkspaceSnapshot {
  return {
    layout: "grid",
    activePaneId: 1,
    panes: [1, 2, 3, 4].map((id) => ({
      id,
      path: `C:\\Pane${id}`,
      history: [`C:\\Pane${id}`],
      historyIndex: 0,
      sortKey: "name",
      sortDirection: "asc",
      viewMode: "details"
    })),
    bookmarks: [],
    savedAt: 100
  };
}

describe("WorkspaceStore", () => {
  it("migrates a legacy single-workspace snapshot into a workspace document", async () => {
    await fs.writeFile(path.join(tempRoot, "workspace.json"), JSON.stringify(oldSnapshot()), "utf8");
    const store = new WorkspaceStore(tempRoot);

    const document = await store.read();
    expect(document?.activeWorkspaceId).toBe("default");
    expect(document?.workspaces).toHaveLength(1);
    expect(document?.workspaces[0].name).toBe("Default");
    expect(document?.workspaces[0].panes).toHaveLength(4);
  });

  it("writes and reads a multi-workspace document", async () => {
    const snapshot = oldSnapshot();
    const document: WorkspaceDocument = {
      activeWorkspaceId: "two",
      workspaces: [
        { ...snapshot, id: "one", name: "One" },
        { ...snapshot, id: "two", name: "Two" }
      ],
      savedAt: 200
    };
    const store = new WorkspaceStore(tempRoot);

    await store.write(document);
    const restored = await store.read();
    expect(restored).toEqual(document);
  });
});
