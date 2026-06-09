import { contextBridge, ipcRenderer } from "electron";
import type {
  CreateItemRequest,
  DeleteRequest,
  FileOperationRequest,
  HashRequest,
  RenameRequest,
  SearchOptions,
  SpaceApi,
  WorkspaceSnapshot
} from "../src/shared.js";

const api: SpaceApi = {
  bootstrap: () => ipcRenderer.invoke("space:bootstrap"),
  listDirectory: (path: string) => ipcRenderer.invoke("space:list-directory", path),
  searchFiles: (options: SearchOptions) => ipcRenderer.invoke("space:search-files", options),
  createFolder: (request: CreateItemRequest) => ipcRenderer.invoke("space:create-folder", request),
  createFile: (request: CreateItemRequest) => ipcRenderer.invoke("space:create-file", request),
  renameItem: (request: RenameRequest) => ipcRenderer.invoke("space:rename-item", request),
  deleteItems: (request: DeleteRequest) => ipcRenderer.invoke("space:delete-items", request),
  copyItems: (request: FileOperationRequest) => ipcRenderer.invoke("space:copy-items", request),
  moveItems: (request: FileOperationRequest) => ipcRenderer.invoke("space:move-items", request),
  preview: (path: string) => ipcRenderer.invoke("space:preview", path),
  calculateHash: (request: HashRequest) => ipcRenderer.invoke("space:calculate-hash", request),
  openPath: (path: string) => ipcRenderer.invoke("space:open-path", path),
  revealPath: (path: string) => ipcRenderer.invoke("space:reveal-path", path),
  openTerminal: (path: string) => ipcRenderer.invoke("space:open-terminal", path),
  getWorkspace: () => ipcRenderer.invoke("space:get-workspace"),
  saveWorkspace: (snapshot: WorkspaceSnapshot) => ipcRenderer.invoke("space:save-workspace", snapshot)
};

contextBridge.exposeInMainWorld("spaceAPI", api);
