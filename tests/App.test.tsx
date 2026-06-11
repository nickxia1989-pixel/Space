import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { getSpaceApi } from "../src/api";
import type { DirectoryPayload, FileEntry, SpaceApi, WorkspaceDocument } from "../src/shared";

function readSavedWorkspace(): WorkspaceDocument | null {
  const raw = window.localStorage.getItem("space.mock.workspace");
  return raw ? (JSON.parse(raw) as WorkspaceDocument) : null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function createTestDataTransfer() {
  const values = new Map<string, string>();
  return {
    files: [],
    effectAllowed: "all",
    dropEffect: "none",
    setData: vi.fn((type: string, value: string) => values.set(type, value)),
    getData: vi.fn((type: string) => values.get(type) ?? "")
  } as unknown as DataTransfer;
}

async function clickToolbarOverflowAction(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByLabelText("更多操作"));
  const overflowMenu = screen.getByRole("menu", { name: "更多文件操作" });
  await user.click(within(overflowMenu).getByRole("menuitem", { name: label }));
}

function testEntry(parentPath: string, name: string, isDirectory = false): FileEntry {
  const path = `${parentPath}\\${name}`;
  return {
    name,
    path,
    parentPath,
    isDirectory,
    isFile: !isDirectory,
    isSymlink: false,
    size: isDirectory ? 0 : 128,
    modifiedAt: 1,
    createdAt: 1,
    extension: isDirectory || !name.includes(".") ? "" : `.${name.split(".").pop()}`,
    typeLabel: isDirectory ? "Folder" : "File",
    hidden: false
  };
}

function testDirectory(path: string, entries: FileEntry[]): DirectoryPayload {
  return { path, entries, scannedAt: 1 };
}

function writeWorkspaceWithPanePaths(panePaths: string[]): void {
  const document: WorkspaceDocument = {
    activeWorkspaceId: "default",
    workspaces: [
      {
        id: "default",
        name: "Default",
        layout: "grid",
        activePaneId: 1,
        panes: panePaths.map((panePath, index) => ({
          id: index + 1,
          path: panePath,
          history: [panePath],
          historyIndex: 0,
          sortKey: "name",
          sortDirection: "asc",
          viewMode: "details"
        })),
        bookmarks: [],
        savedAt: 1
      }
    ],
    savedAt: 1
  };
  window.localStorage.setItem("space.mock.workspace", JSON.stringify(document));
}

function writeLegacyActionWorkspace(): void {
  const homePath = "C:\\Users\\Traveler";
  const panePaths = [
    homePath,
    `${homePath}\\Desktop`,
    `${homePath}\\Downloads`,
    `${homePath}\\Pictures`
  ];
  const document: WorkspaceDocument = {
    activeWorkspaceId: "default",
    workspaces: [
      {
        id: "default",
        name: "Default",
        layout: "grid",
        activePaneId: 1,
        panes: panePaths.map((panePath, index) => ({
          id: index + 1,
          path: panePath,
          history: [panePath],
          historyIndex: 0,
          sortKey: "name",
          sortDirection: "asc",
          viewMode: "details"
        })),
        bookmarks: [],
        toolbarActionIds: [
          "newFolder",
          "newFile",
          "copy",
          "cut",
          "paste",
          "delete",
          "createZip",
          "batchRename",
          "folderSync",
          "addShelf",
          "colorRules",
          "quickLaunch",
          "refresh",
          "terminal",
          "bookmark"
        ],
        contextMenuActionIds: ["copy", "cut", "paste", "rename", "delete", "hash", "addShelf", "quickLaunch", "terminal", "reveal"],
        savedAt: 1
      }
    ],
    savedAt: 1
  };
  window.localStorage.setItem("space.mock.workspace", JSON.stringify(document));
}

describe("App", () => {
  it("shows a recoverable startup error when the desktop API fails", async () => {
    window.spaceAPI = {
      bootstrap: vi.fn().mockRejectedValue(new Error("bootstrap unavailable"))
    } as unknown as SpaceApi;

    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Space could not start");
    expect(alert).toHaveTextContent("bootstrap unavailable");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("falls back to a usable default workspace when saved workspace data is malformed", async () => {
    window.localStorage.setItem(
      "space.mock.workspace",
      JSON.stringify({
        activeWorkspaceId: "broken",
        workspaces: [
          {
            id: "broken",
            name: "",
            layout: "diagonal",
            activePaneId: 42,
            panes: null,
            bookmarks: [],
            savedAt: 1
          }
        ],
        savedAt: 1
      })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText("四窗格资源管理器")).toBeInTheDocument());
    expect(screen.getByLabelText("Pane 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 4")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("C:\\Users\\Traveler")).toHaveLength(4);
  });

  it("renders four explorer panes with default controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("四窗格资源管理器")).toBeInTheDocument());
    expect(screen.getByLabelText("Pane 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 4")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("过滤或搜索")).not.toBeInTheDocument();
    expect(screen.queryByText("Inspector")).not.toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "调整窗格列宽" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "调整窗格行高" })).toBeInTheDocument();
    expect(screen.queryByText("快速访问")).not.toBeInTheDocument();
    const stashHeading = screen.getByText("暂存架");
    const shortcutHeading = screen.getByText("快捷入口");
    const drivesHeading = screen.getByText("磁盘");
    expect(stashHeading.compareDocumentPosition(shortcutHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(shortcutHeading.compareDocumentPosition(drivesHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("系统 (C:)")).toBeInTheDocument();
    expect(screen.getByLabelText("系统 (C:) 占用 75%")).toBeInTheDocument();

    await user.click(within(screen.getByLabelText("Pane 1")).getByLabelText("过滤/搜索"));
    expect(within(screen.getByLabelText("Pane 1")).getByPlaceholderText("过滤或搜索")).toBeInTheDocument();
  });

  it("migrates legacy action layouts to include current default actions", async () => {
    const user = userEvent.setup();
    writeLegacyActionWorkspace();
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("Windows Terminal")).toBeInTheDocument());
    expect(screen.queryByLabelText("工作区搜索")).not.toBeInTheDocument();
    expect(screen.getByLabelText("更多操作")).toBeInTheDocument();
    await user.click(screen.getByLabelText("更多操作"));
    const overflowMenu = screen.getByRole("menu", { name: "更多文件操作" });
    expect(within(overflowMenu).getByRole("menuitem", { name: "哈希对比" })).toBeInTheDocument();
    expect(within(overflowMenu).getByRole("menuitem", { name: "复制路径" })).toBeInTheDocument();
    expect(within(overflowMenu).getByRole("menuitem", { name: "选择同类型" })).toBeInTheDocument();
    expect(screen.queryByLabelText("批量重命名")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("颜色规则")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("快速启动")).not.toBeInTheDocument();
  });

  it("supports switching an individual pane to icon view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("Pane 1")).toBeInTheDocument());
    await user.click(screen.getAllByLabelText("图标视图")[0]);
    expect(screen.getAllByLabelText("图标视图")[0]).toHaveClass("active");
  });

  it("suggests matching paths in the address bar", async () => {
    render(<App />);

    const pane = await screen.findByLabelText("Pane 1");
    const addressInput = within(pane).getByDisplayValue("C:\\Users\\Traveler");
    fireEvent.change(addressInput, { target: { value: "C:\\Users\\Traveler\\D" } });

    await waitFor(() => {
      const values = [...pane.querySelectorAll("datalist option")].map((option) => option.getAttribute("value"));
      expect(values).toEqual([
        "C:\\Users\\Traveler\\Desktop",
        "C:\\Users\\Traveler\\Documents",
        "C:\\Users\\Traveler\\Downloads"
      ]);
    });
  });

  it("keeps the newest pane navigation result when directory loads finish out of order", async () => {
    const homePath = "C:\\Users\\Traveler";
    const slowPath = `${homePath}\\Slow`;
    const fastPath = `${homePath}\\Fast`;
    const slowDirectory = deferred<DirectoryPayload>();
    const fastDirectory = deferred<DirectoryPayload>();
    const listDirectory = vi.fn((path: string) => {
      if (path === slowPath) return slowDirectory.promise;
      if (path === fastPath) return fastDirectory.promise;
      const entries =
        path === homePath
          ? [testEntry(homePath, "Slow", true), testEntry(homePath, "Fast", true)]
          : [];
      return Promise.resolve(testDirectory(path, entries));
    });
    window.spaceAPI = {
      bootstrap: vi.fn().mockResolvedValue({
        homePath,
        knownLocations: [
          { id: "home", label: "Home", path: homePath, icon: "home" },
          { id: "desktop", label: "Desktop", path: `${homePath}\\Desktop`, icon: "monitor" },
          { id: "documents", label: "Documents", path: `${homePath}\\Documents`, icon: "file-text" },
          { id: "downloads", label: "Downloads", path: `${homePath}\\Downloads`, icon: "download" }
        ],
        drives: []
      }),
      getWorkspace: vi.fn().mockResolvedValue(null),
      saveWorkspace: vi.fn().mockResolvedValue({ ok: true, message: "Saved." }),
      listDirectory
    } as unknown as SpaceApi;

    render(<App />);

    const pane = await screen.findByLabelText("Pane 1");
    await waitFor(() => expect(within(pane).getByText("Slow")).toBeInTheDocument());
    const address = within(pane).getByDisplayValue(homePath);
    const addressForm = address.closest("form");
    expect(addressForm).not.toBeNull();

    fireEvent.change(address, { target: { value: slowPath } });
    fireEvent.submit(addressForm!);
    fireEvent.change(address, { target: { value: fastPath } });
    fireEvent.submit(addressForm!);

    await act(async () => {
      fastDirectory.resolve(testDirectory(fastPath, [testEntry(fastPath, "Fast File.txt")]));
    });
    expect(await within(pane).findByText("Fast File.txt")).toBeInTheDocument();

    await act(async () => {
      slowDirectory.resolve(testDirectory(slowPath, [testEntry(slowPath, "Slow File.txt")]));
    });

    await waitFor(() => expect(within(pane).getByDisplayValue(fastPath)).toBeInTheDocument());
    expect(within(pane).getByText("Fast File.txt")).toBeInTheDocument();
    expect(within(pane).queryByText("Slow File.txt")).not.toBeInTheDocument();
  });

  it("creates files from the new file template panel", async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().slice(0, 10);
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("Pane 1")).toBeInTheDocument());
    await user.click(screen.getByLabelText("新建文件"));
    const dialog = screen.getByRole("dialog", { name: "新建文件" });
    expect(within(dialog).getByText("空白文本")).toBeInTheDocument();
    expect(within(dialog).getByText("Word 文档")).toBeInTheDocument();
    expect(within(dialog).getByText("Excel 工作簿")).toBeInTheDocument();
    expect(within(dialog).getByText("PowerPoint 演示文稿")).toBeInTheDocument();
    expect(within(dialog).queryByText("JSON")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("PowerShell 脚本")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("HTML 页面")).not.toBeInTheDocument();
    const markdownButton = within(dialog).getByText("Markdown 笔记").closest("button");
    expect(markdownButton).not.toBeNull();
    await user.click(markdownButton!);

    expect(within(dialog).getByDisplayValue(`笔记-${today}.md`)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "创建" }));

    await waitFor(() => expect(screen.getByText(`笔记-${today}.md`)).toBeInTheDocument());
  });

  it("refreshes every pane showing the same folder after creating a folder", async () => {
    const user = userEvent.setup();
    const homePath = "C:\\Users\\Traveler";
    writeWorkspaceWithPanePaths([homePath, homePath, `${homePath}\\Downloads`, `${homePath}\\Documents`]);
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Shared Folder");
    render(<App />);

    const pane1 = await screen.findByLabelText("Pane 1");
    const pane2 = await screen.findByLabelText("Pane 2");
    await waitFor(() => expect(within(pane1).getByText("Space Notes.md")).toBeInTheDocument());
    await waitFor(() => expect(within(pane2).getByText("Space Notes.md")).toBeInTheDocument());

    await user.click(screen.getByLabelText("新建文件夹"));

    expect(await within(pane1).findByText("Shared Folder")).toBeInTheDocument();
    expect(await within(pane2).findByText("Shared Folder")).toBeInTheDocument();
    promptSpy.mockRestore();
  });

  it("recovers panes that are showing a deleted folder", async () => {
    const user = userEvent.setup();
    const homePath = "C:\\Users\\Traveler";
    const desktopPath = `${homePath}\\Desktop`;
    writeWorkspaceWithPanePaths([homePath, desktopPath, `${homePath}\\Downloads`, `${homePath}\\Documents`]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);

    const pane1 = await screen.findByLabelText("Pane 1");
    const pane2 = await screen.findByLabelText("Pane 2");
    await waitFor(() => expect(within(pane1).getByText("Desktop")).toBeInTheDocument());
    await waitFor(() => expect(within(pane2).getByText("Todo.txt")).toBeInTheDocument());

    await user.click(within(pane1).getByText("Desktop"));
    await user.click(screen.getByLabelText("删除"));

    expect(await screen.findByText("Deleted 1 item(s).")).toBeInTheDocument();
    await waitFor(() => expect(within(pane2).getByDisplayValue(homePath)).toBeInTheDocument());
    expect(within(pane2).queryByText("Todo.txt")).not.toBeInTheDocument();
    expect(pane1).toHaveClass("active");
    confirmSpy.mockRestore();
  });

  it("recovers panes that are showing a moved folder", async () => {
    const user = userEvent.setup();
    const homePath = "C:\\Users\\Traveler";
    const desktopPath = `${homePath}\\Desktop`;
    const downloadsPath = `${homePath}\\Downloads`;
    writeWorkspaceWithPanePaths([homePath, desktopPath, downloadsPath, `${homePath}\\Documents`]);
    render(<App />);

    const pane1 = await screen.findByLabelText("Pane 1");
    const pane2 = await screen.findByLabelText("Pane 2");
    const pane3 = await screen.findByLabelText("Pane 3");
    await waitFor(() => expect(within(pane1).getByText("Desktop")).toBeInTheDocument());
    await waitFor(() => expect(within(pane2).getByText("Todo.txt")).toBeInTheDocument());
    await waitFor(() => expect(within(pane3).getByText("Archive.zip")).toBeInTheDocument());

    await user.click(within(pane1).getByText("Desktop"));
    await user.click(screen.getByLabelText("剪切"));
    await user.click(pane3);
    await user.click(screen.getByLabelText("粘贴"));

    expect(await screen.findByText("Moved 1 item(s).")).toBeInTheDocument();
    await waitFor(() => expect(within(pane2).getByDisplayValue(`${downloadsPath}\\Desktop`)).toBeInTheDocument());
    expect(within(pane2).getByText("Todo.txt")).toBeInTheDocument();
    expect(pane3).toHaveClass("active");
  });

  it("recovers panes that are showing a renamed folder", async () => {
    const user = userEvent.setup();
    const homePath = "C:\\Users\\Traveler";
    const desktopPath = `${homePath}\\Desktop`;
    writeWorkspaceWithPanePaths([homePath, desktopPath, `${homePath}\\Downloads`, `${homePath}\\Documents`]);
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Projects");
    render(<App />);

    const pane1 = await screen.findByLabelText("Pane 1");
    const pane2 = await screen.findByLabelText("Pane 2");
    await waitFor(() => expect(within(pane1).getByText("Desktop")).toBeInTheDocument());
    await waitFor(() => expect(within(pane2).getByText("Todo.txt")).toBeInTheDocument());

    await user.click(within(pane1).getByText("Desktop"));
    const shell = screen.getByText("四窗格资源管理器").closest("main");
    expect(shell).not.toBeNull();
    fireEvent.keyDown(shell!, { key: "F2" });

    expect(await screen.findByText("Rename complete.")).toBeInTheDocument();
    await waitFor(() => expect(within(pane2).getByDisplayValue(`${homePath}\\Projects`)).toBeInTheDocument());
    expect(within(pane2).getByText("Todo.txt")).toBeInTheDocument();
    expect(pane1).toHaveClass("active");
    promptSpy.mockRestore();
  });

  it("selects the renamed item in the source pane", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Renamed Notes.md");
    render(<App />);

    const pane = await screen.findByLabelText("Pane 1");
    await waitFor(() => expect(within(pane).getByText("Space Notes.md")).toBeInTheDocument());
    await user.click(within(pane).getByText("Space Notes.md"));
    const shell = screen.getByText("四窗格资源管理器").closest("main");
    expect(shell).not.toBeNull();
    fireEvent.keyDown(shell!, { key: "F2" });

    expect(await screen.findByText("Rename complete.")).toBeInTheDocument();
    await waitFor(() => expect(within(pane).getByText("已选 1 项，4.7 KB")).toBeInTheDocument());
    expect(within(pane).getByText("Renamed Notes.md").closest("button")).toHaveClass("selected");
    promptSpy.mockRestore();
  });

  it("shows text labels on top actions and opens folder sync without retired utilities", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Space Notes.md")).toBeInTheDocument());
    expect(screen.getByText("新建文件夹")).toBeInTheDocument();
    expect(screen.getByText("Windows Terminal")).toBeInTheDocument();
    expect(screen.getByText("更多")).toBeInTheDocument();
    expect(screen.queryByLabelText("工作区搜索")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("批量重命名")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("颜色规则")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("快速启动")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("更多操作"));
    const overflowMenu = screen.getByRole("menu", { name: "更多文件操作" });
    expect(within(overflowMenu).queryByText("工作区搜索")).not.toBeInTheDocument();
    await user.click(within(overflowMenu).getByRole("menuitem", { name: "文件夹同步" }));
    expect(screen.getByRole("dialog", { name: "文件夹同步" })).toBeInTheDocument();
  });

  it("runs per-pane recursive search and clears the loading state", async () => {
    const user = userEvent.setup();
    render(<App />);

    const pane = await screen.findByLabelText("Pane 3");
    await waitFor(() => expect(within(pane).getByText("Archive.zip")).toBeInTheDocument());
    await user.click(within(pane).getByLabelText("过滤/搜索"));
    await user.type(within(pane).getByPlaceholderText("过滤或搜索"), "Archive");
    await user.click(within(pane).getByLabelText("子文件夹"));
    await user.click(within(pane).getByRole("button", { name: "搜索" }));

    expect(await within(pane).findByText("Archive.tar")).toBeInTheDocument();
    await waitFor(() => expect(within(pane).queryByText("加载中...")).not.toBeInTheDocument());
  });

  it("does not expose the removed workspace search action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Archive.tar")).toBeInTheDocument());
    expect(screen.queryByLabelText("工作区搜索")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("更多操作"));
    expect(within(screen.getByRole("menu", { name: "更多文件操作" })).queryByText("工作区搜索")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "工作区搜索" })).not.toBeInTheDocument();
  });

  it("compares selected file hashes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Archive.zip")).toBeInTheDocument());
    await user.click(screen.getByText("Archive.zip"));
    fireEvent.click(screen.getByText("Archive.tar"), { ctrlKey: true });
    await clickToolbarOverflowAction(user, "哈希对比");

    const dialog = screen.getByRole("dialog", { name: "哈希对比" });
    await user.click(within(dialog).getByRole("button", { name: "计算" }));

    expect(await within(dialog).findByText(/1 组相同/)).toBeInTheDocument();
    expect(within(dialog).getByText("2 个相同文件")).toBeInTheDocument();
    expect(within(dialog).getAllByText("mock-hash-value").length).toBeGreaterThan(0);
  });

  it("copies selected paths and selects matching item types", async () => {
    const user = userEvent.setup();
    render(<App />);

    const pane = await screen.findByLabelText("Pane 1");
    await waitFor(() => expect(within(pane).getByText("Desktop")).toBeInTheDocument());
    await user.click(within(pane).getByText("Desktop"));
    await clickToolbarOverflowAction(user, "复制路径");

    expect(await screen.findByText("Copied 1 path(s).")).toBeInTheDocument();
    expect(window.localStorage.getItem("space.mock.clipboard")).toBe("C:\\Users\\Traveler\\Desktop");

    await clickToolbarOverflowAction(user, "选择同类型");
    expect(await screen.findByText("Selected 4 same type item(s).")).toBeInTheDocument();
    expect(screen.getByText("已选 4 项，0 B")).toBeInTheDocument();

    const shell = screen.getByText("四窗格资源管理器").closest("main");
    expect(shell).not.toBeNull();
    fireEvent.keyDown(shell!, { key: "c", ctrlKey: true, shiftKey: true });
    expect(await screen.findByText("Copied 4 path(s).")).toBeInTheDocument();
    expect(window.localStorage.getItem("space.mock.clipboard")).toBe(
      [
        "C:\\Users\\Traveler\\Desktop",
        "C:\\Users\\Traveler\\Documents",
        "C:\\Users\\Traveler\\Downloads",
        "C:\\Users\\Traveler\\Pictures"
      ].join("\r\n")
    );
  });

  it("keeps existing selections when refreshing a pane", async () => {
    const user = userEvent.setup();
    render(<App />);

    const pane = await screen.findByLabelText("Pane 1");
    await waitFor(() => expect(within(pane).getByText("Space Notes.md")).toBeInTheDocument());
    await user.click(within(pane).getByText("Space Notes.md"));
    expect(within(pane).getByText("已选 1 项，4.7 KB")).toBeInTheDocument();

    await user.click(within(pane).getByLabelText("刷新窗格"));

    await waitFor(() => expect(within(pane).getByText("已选 1 项，4.7 KB")).toBeInTheDocument());
    expect(within(pane).getByText("Space Notes.md").closest("button")).toHaveClass("selected");
  });

  it("falls back to single selection when shift-click anchor is filtered out", async () => {
    const user = userEvent.setup();
    render(<App />);

    const pane = await screen.findByLabelText("Pane 1");
    await waitFor(() => expect(within(pane).getByText("Pictures")).toBeInTheDocument());
    await user.click(within(pane).getByText("Pictures"));
    await user.click(within(pane).getByLabelText("过滤/搜索"));
    fireEvent.change(within(pane).getByPlaceholderText("过滤或搜索"), { target: { value: "D" } });

    fireEvent.click(within(pane).getByText("Desktop"), { shiftKey: true });

    await waitFor(() => expect(within(pane).getByText("已选 1 项，0 B")).toBeInTheDocument());
    expect(within(pane).getByText("Desktop").closest("button")).toHaveClass("selected");
  });

  it("clears hidden selections when filtering a pane", async () => {
    const user = userEvent.setup();
    render(<App />);

    const pane = await screen.findByLabelText("Pane 1");
    await waitFor(() => expect(within(pane).getByText("Pictures")).toBeInTheDocument());
    await user.click(within(pane).getByText("Pictures"));
    expect(within(pane).getByText("已选 1 项，0 B")).toBeInTheDocument();

    await user.click(within(pane).getByLabelText("过滤/搜索"));
    fireEvent.change(within(pane).getByPlaceholderText("过滤或搜索"), { target: { value: "D" } });

    await waitFor(() => expect(within(pane).getByText("未选择")).toBeInTheDocument());
    expect(screen.getByLabelText("删除")).toBeDisabled();
  });

  it("copies and moves files between panes through clipboard paste", async () => {
    const user = userEvent.setup();
    render(<App />);

    const pane1 = await screen.findByLabelText("Pane 1");
    const pane2 = await screen.findByLabelText("Pane 2");
    const pane3 = await screen.findByLabelText("Pane 3");
    await waitFor(() => expect(within(pane1).getByText("Space Notes.md")).toBeInTheDocument());

    await user.click(within(pane1).getByText("Space Notes.md"));
    await user.click(screen.getByLabelText("复制"));
    await user.click(pane2);
    await user.click(screen.getByLabelText("粘贴"));

    expect(await within(pane2).findByText("Space Notes.md")).toBeInTheDocument();
    expect(within(pane1).getByText("Space Notes.md")).toBeInTheDocument();

    await user.click(within(pane2).getByText("Space Notes.md"));
    await user.click(screen.getByLabelText("剪切"));
    await user.click(pane3);
    await user.click(screen.getByLabelText("粘贴"));

    expect(await within(pane3).findByText("Space Notes.md")).toBeInTheDocument();
    await waitFor(() => expect(within(pane2).queryByText("Space Notes.md")).not.toBeInTheDocument());
    expect(within(pane1).getByText("Space Notes.md")).toBeInTheDocument();
  });

  it("keeps cut clipboard contents when paste move fails", async () => {
    const user = userEvent.setup();
    render(<App />);

    const pane1 = await screen.findByLabelText("Pane 1");
    const pane2 = await screen.findByLabelText("Pane 2");
    await waitFor(() => expect(within(pane1).getByText("Desktop")).toBeInTheDocument());

    await user.click(within(pane1).getByText("Desktop"));
    await user.click(screen.getByLabelText("剪切"));
    await user.click(pane2);
    await user.click(screen.getByLabelText("粘贴"));

    expect(await screen.findByText("Paste move failed: Cannot move a folder into itself.")).toBeInTheDocument();
    expect(screen.getByLabelText("粘贴")).not.toBeDisabled();
  });

  it("routes sidebar drops by target section", async () => {
    render(<App />);

    await screen.findByLabelText("Pane 1");
    const shortcuts = screen.getByText("快捷入口").closest("section");
    const shelf = screen.getByRole("region", { name: "Stash Shelf" });
    expect(shortcuts).not.toBeNull();

    const shelfTransfer = createTestDataTransfer();
    shelfTransfer.setData("application/x-space-paths", JSON.stringify(["C:\\Users\\Traveler\\Desktop\\Todo.txt"]));
    fireEvent.drop(shelf, { dataTransfer: shelfTransfer });
    expect(await within(shelf).findByText("Todo.txt")).toBeInTheDocument();

    const shortcutTransfer = createTestDataTransfer();
    shortcutTransfer.setData("application/x-space-paths", JSON.stringify(["C:\\Users\\Traveler\\CustomDrop"]));
    fireEvent.drop(shortcuts!, { dataTransfer: shortcutTransfer });

    expect(await screen.findByText("CustomDrop")).toBeInTheDocument();
    expect(await screen.findByText("已添加快捷入口。")).toBeInTheDocument();
  });

  it("previews pane drag target and swaps pane contents on release", async () => {
    render(<App />);

    const pane1 = await screen.findByLabelText("Pane 1");
    const pane4 = await screen.findByLabelText("Pane 4");
    await waitFor(() => expect(within(pane1).getByDisplayValue("C:\\Users\\Traveler")).toBeInTheDocument());
    await waitFor(() => expect(within(pane4).getByDisplayValue("C:\\Users\\Traveler\\Documents")).toBeInTheDocument());

    const elementFromPoint = vi.fn(() => pane4);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: elementFromPoint });
    fireEvent.mouseDown(within(pane1).getByLabelText("拖动交换 P1"), { button: 0, clientX: 20, clientY: 20 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 300 });

    expect(within(pane1).getByDisplayValue("C:\\Users\\Traveler")).toBeInTheDocument();
    expect(within(pane4).getByDisplayValue("C:\\Users\\Traveler\\Documents")).toBeInTheDocument();
    expect(document.querySelector(".pane-drag-ghost")).toBeInTheDocument();
    expect(pane4).toHaveClass("drop-target");

    fireEvent.mouseUp(window, { clientX: 300, clientY: 300 });
    await waitFor(() => expect(within(pane1).getByDisplayValue("C:\\Users\\Traveler\\Documents")).toBeInTheDocument());
    expect(within(pane4).getByDisplayValue("C:\\Users\\Traveler")).toBeInTheDocument();
    expect(await screen.findByText("已移动 P1 到 P4。")).toBeInTheDocument();
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  it("shows a fixed grouped context menu for the right-clicked item", async () => {
    const user = userEvent.setup();
    const api = getSpaceApi();
    const revealPath = vi.fn().mockResolvedValue({ ok: true, message: "Revealed." });
    const runSvnCommand = vi.fn().mockResolvedValue({ ok: true, message: "SVN command started." });
    const systemContextMenu = vi.fn().mockResolvedValue({ ok: true, message: "Opened system context menu." });
    window.spaceAPI = { ...api, revealPath, runSvnCommand, showSystemContextMenu: systemContextMenu };
    render(<App />);

    const pane1 = await screen.findByLabelText("Pane 1");
    const pane2 = await screen.findByLabelText("Pane 2");
    await waitFor(() => expect(within(pane1).getByText("Space Notes.md")).toBeInTheDocument());
    await waitFor(() => expect(within(pane2).getByText("Todo.txt")).toBeInTheDocument());

    await user.click(within(pane1).getByText("Space Notes.md"));
    fireEvent.contextMenu(within(pane2).getByText("Todo.txt"), {
      clientX: 12,
      clientY: 34,
      screenX: 112,
      screenY: 134
    });

    const menu = await screen.findByRole("menu", { name: "文件操作菜单" });
    await waitFor(() => expect(within(menu).getByRole("menuitem", { name: "复制" })).not.toBeDisabled());
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "打开",
      "复制",
      "剪切",
      "粘贴",
      "放入暂存架",
      "添加到快捷入口",
      "资源管理器打开所在位置",
      "SVN Update",
      "SVN Commit",
      "新建"
    ]);
    expect(menu.querySelectorAll("hr")).toHaveLength(3);
    expect(within(pane2).getByText("Todo.txt").closest("button")).toHaveClass("selected");
    expect(within(pane1).getByText("Space Notes.md")).toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitem", { name: "资源管理器打开所在位置" }));
    await waitFor(() => expect(revealPath).toHaveBeenCalledWith("C:\\Users\\Traveler\\Desktop\\Todo.txt"));
    expect(systemContextMenu).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "文件操作菜单" })).not.toBeInTheDocument();

    fireEvent.contextMenu(within(pane2).getByText("Todo.txt"), { clientX: 16, clientY: 40 });
    await user.click(await screen.findByRole("menuitem", { name: "SVN Update" }));
    await waitFor(() =>
      expect(runSvnCommand).toHaveBeenCalledWith({
        path: "C:\\Users\\Traveler\\Desktop\\Todo.txt",
        command: "update"
      })
    );

    fireEvent.contextMenu(within(pane2).getByText("Todo.txt"), { clientX: 16, clientY: 40 });
    await user.click(await screen.findByRole("menuitem", { name: "SVN Commit" }));
    await waitFor(() =>
      expect(runSvnCommand).toHaveBeenCalledWith({
        path: "C:\\Users\\Traveler\\Desktop\\Todo.txt",
        command: "commit"
      })
    );

    fireEvent.contextMenu(within(pane2).getByText("Todo.txt"), { clientX: 16, clientY: 40 });
    await user.click(await screen.findByRole("menuitem", { name: "新建" }));
    expect(await screen.findByRole("dialog", { name: "新建文件" })).toBeInTheDocument();
  });

  it("saves and loads folder sync presets", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("Pane 1")).toBeInTheDocument());
    await clickToolbarOverflowAction(user, "文件夹同步");

    const dialog = screen.getByRole("dialog", { name: "文件夹同步" });
    fireEvent.change(within(dialog).getByLabelText("同步方向"), { target: { value: "updateBoth" } });
    fireEvent.change(within(dialog).getByLabelText("过滤"), { target: { value: "Mock" } });
    fireEvent.change(within(dialog).getByLabelText("预设名称"), { target: { value: "Mirror Mock" } });
    await user.click(within(dialog).getByRole("button", { name: "保存预设" }));

    await waitFor(() => {
      const presets = readSavedWorkspace()?.workspaces[0]?.folderSyncPresets;
      expect(presets).toHaveLength(1);
      expect(presets?.[0].name).toBe("Mirror Mock");
      expect(presets?.[0].direction).toBe("updateBoth");
      expect(presets?.[0].filter).toBe("Mock");
    });

    const presetId = readSavedWorkspace()?.workspaces[0]?.folderSyncPresets?.[0].id;
    expect(presetId).toBeDefined();
    fireEvent.change(within(dialog).getByLabelText("同步方向"), { target: { value: "updateLeft" } });
    fireEvent.change(within(dialog).getByLabelText("过滤"), { target: { value: "Other" } });
    fireEvent.change(within(dialog).getByLabelText("左侧路径"), { target: { value: "C:\\Changed" } });
    fireEvent.change(within(dialog).getByLabelText("预设"), { target: { value: presetId } });

    expect(within(dialog).getByLabelText("同步方向")).toHaveValue("updateBoth");
    expect(within(dialog).getByLabelText("过滤")).toHaveValue("Mock");
    expect(within(dialog).getByLabelText("左侧路径")).toHaveValue("C:\\Users\\Traveler");

    await user.click(within(dialog).getByRole("button", { name: "删除预设" }));
    await waitFor(() => expect(readSavedWorkspace()?.workspaces[0]?.folderSyncPresets).toHaveLength(0));
  });

  it("collects selected files in the stash shelf and hashes them", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Space Notes.md")).toBeInTheDocument());
    await user.click(screen.getByText("Space Notes.md"));
    await clickToolbarOverflowAction(user, "加入暂存架");

    const shelf = screen.getByRole("region", { name: "Stash Shelf" });
    expect(within(shelf).getByText("Space Notes.md")).toBeInTheDocument();

    await user.click(within(shelf).getByRole("button", { name: "哈希" }));
    expect(await screen.findByText(/Shelf SHA-256/)).toBeInTheDocument();

    await user.click(within(shelf).getByRole("button", { name: "清空" }));
    expect(within(shelf).queryByText("Space Notes.md")).not.toBeInTheDocument();
  });

  it("opens tar archives in the archive browser", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Archive.tar")).toBeInTheDocument());
    await user.dblClick(screen.getByText("Archive.tar"));
    expect(screen.getByRole("dialog", { name: "归档浏览器" })).toBeInTheDocument();
    expect(screen.getByText("readme.txt")).toBeInTheDocument();
  });

  it("creates, renames, and clones workspace tabs", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt");
    render(<App />);

    await waitFor(() => expect(screen.getByRole("tab", { name: "默认" })).toBeInTheDocument());
    await user.click(screen.getByLabelText("新建工作区"));
    await waitFor(() => expect(screen.getByRole("tab", { name: "工作区 2" })).toBeInTheDocument());

    await user.click(screen.getByLabelText("重命名工作区"));
    const renameDialog = screen.getByRole("dialog", { name: "重命名工作区" });
    expect(promptSpy).not.toHaveBeenCalled();
    const nameInput = within(renameDialog).getByLabelText("工作区名称");
    await user.clear(nameInput);
    await user.type(nameInput, "Design");
    await user.click(within(renameDialog).getByRole("button", { name: "保存" }));
    expect(screen.getByRole("tab", { name: "Design" })).toBeInTheDocument();
    await waitFor(() => expect(readSavedWorkspace()?.workspaces.find((workspace) => workspace.name === "Design")).toBeDefined());

    await user.click(screen.getByLabelText("复制工作区"));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Design 副本" })).toBeInTheDocument());
    promptSpy.mockRestore();
  });

  it("opens Windows Terminal from the active pane without the retired quick launch panel", async () => {
    const user = userEvent.setup();
    const api = getSpaceApi();
    const openTerminal = vi.fn().mockResolvedValue({ ok: true, message: "Opened Windows Terminal in C:\\Users\\Traveler." });
    window.spaceAPI = { ...api, openTerminal };
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("Pane 1")).toBeInTheDocument());
    await user.click(screen.getByLabelText("Windows Terminal"));

    await waitFor(() => expect(openTerminal).toHaveBeenCalledWith("C:\\Users\\Traveler"));
    expect(await screen.findByText("Opened Windows Terminal in C:\\Users\\Traveler.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "快速启动" })).not.toBeInTheDocument();
  });

  it("customizes toolbar actions and hotkeys", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("自定义动作")).toBeInTheDocument());
    await user.click(screen.getByLabelText("自定义动作"));

    const dialog = screen.getByRole("dialog", { name: "自定义动作" });
    expect(within(dialog).getByText("调整工具栏按钮和快捷键；右键菜单固定使用 Space 分组菜单。")).toBeInTheDocument();
    const toolbarGroup = within(dialog).getByRole("group", { name: "工具栏" });
    await user.click(within(toolbarGroup).getByLabelText("删除"));
    expect(within(dialog).queryByLabelText("工作区搜索 hotkey")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("文件夹同步 hotkey"), { target: { value: "ctrl+alt+f" } });
    await user.click(within(dialog).getByRole("button", { name: "保存设置" }));

    expect(screen.queryByLabelText("删除")).not.toBeInTheDocument();
    await waitFor(() => {
      const workspace = readSavedWorkspace()?.workspaces[0];
      const toolbarIds = workspace?.toolbarActionIds;
      expect(toolbarIds).toBeDefined();
      expect(toolbarIds).not.toContain("delete");
      expect(workspace?.hotkeyBindings).toContainEqual({ actionId: "folderSync", shortcut: "Ctrl+Alt+F" });
    });

    const shell = screen.getByText("四窗格资源管理器").closest("main");
    expect(shell).not.toBeNull();
    fireEvent.keyDown(shell!, { key: "f", ctrlKey: true, altKey: true });
    const syncDialog = screen.getByRole("dialog", { name: "文件夹同步" });
    expect(syncDialog).toBeInTheDocument();
    await user.click(within(syncDialog).getByRole("button", { name: "关闭" }));

    expect(document.querySelector(".context-menu")).toBeNull();
  });
});
