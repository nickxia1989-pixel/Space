import fs from "node:fs";
import path from "node:path";
import type { OperationResult, WorkspaceSnapshot } from "../src/shared.js";

const fsp = fs.promises;

export class WorkspaceStore {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "workspace.json");
  }

  async read(): Promise<WorkspaceSnapshot | null> {
    try {
      const raw = await fsp.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as WorkspaceSnapshot;
      if (!parsed || !Array.isArray(parsed.panes)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async write(snapshot: WorkspaceSnapshot): Promise<OperationResult> {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    await fsp.writeFile(this.filePath, JSON.stringify(snapshot, null, 2), "utf8");
    return { ok: true, message: "Workspace saved." };
  }
}
