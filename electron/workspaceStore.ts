import fs from "node:fs";
import path from "node:path";
import type { OperationResult, WorkspaceDocument, WorkspaceSnapshot } from "../src/shared.js";

const fsp = fs.promises;

export class WorkspaceStore {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "workspace.json");
  }

  async read(): Promise<WorkspaceDocument | null> {
    try {
      const raw = await fsp.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as WorkspaceDocument | WorkspaceSnapshot;
      if (!parsed) return null;
      if ("workspaces" in parsed && Array.isArray(parsed.workspaces)) {
        return parsed;
      }
      if ("panes" in parsed && Array.isArray(parsed.panes)) {
        return {
          activeWorkspaceId: "default",
          workspaces: [
            {
              ...parsed,
              id: "default",
              name: "Default"
            }
          ],
          savedAt: parsed.savedAt ?? Date.now()
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async write(snapshot: WorkspaceDocument): Promise<OperationResult> {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    await fsp.writeFile(this.filePath, JSON.stringify(snapshot, null, 2), "utf8");
    return { ok: true, message: "Workspaces saved." };
  }
}
