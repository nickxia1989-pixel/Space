import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";
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

    await waitFor(() => expect(screen.getByText("Four-pane file manager")).toBeInTheDocument());
    expect(screen.getByLabelText("Pane 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 4")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("C:\\Users\\Traveler")).toHaveLength(4);
  });

  it("renders four explorer panes with default controls", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Four-pane file manager")).toBeInTheDocument());
    expect(screen.getByLabelText("Pane 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 4")).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("Filter or search")).toHaveLength(4);
  });

  it("migrates legacy action layouts to include current default actions", async () => {
    writeLegacyActionWorkspace();
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("Workspace search")).toBeInTheDocument());
    expect(screen.getByLabelText("Hash compare")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy paths")).toBeInTheDocument();
    expect(screen.getByLabelText("Select same type")).toBeInTheDocument();
  });

  it("supports switching an individual pane to icon view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("Pane 1")).toBeInTheDocument());
    await user.click(screen.getAllByLabelText("Icon view")[0]);
    expect(screen.getAllByLabelText("Icon view")[0]).toHaveClass("active");
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
    await user.click(screen.getByLabelText("New file"));
    const dialog = screen.getByRole("dialog", { name: "New file" });
    const markdownButton = within(dialog).getByText("Markdown Note").closest("button");
    expect(markdownButton).not.toBeNull();
    await user.click(markdownButton!);

    expect(within(dialog).getByDisplayValue(`Note-${today}.md`)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(screen.getByText(`Note-${today}.md`)).toBeInTheDocument());
  });

  it("opens advanced batch rename and folder sync panels", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Space Notes.md")).toBeInTheDocument());
    await user.click(screen.getByText("Space Notes.md"));
    await user.click(screen.getByLabelText("Batch rename"));
    expect(screen.getByRole("dialog", { name: "Batch rename" })).toBeInTheDocument();
    await user.click(screen.getByText("Close"));

    await user.click(screen.getByLabelText("Folder sync"));
    expect(screen.getByRole("dialog", { name: "Folder sync" })).toBeInTheDocument();
  });

  it("runs workspace search and adds results to the stash shelf", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Archive.tar")).toBeInTheDocument());
    await user.click(screen.getByLabelText("Workspace search"));

    const dialog = screen.getByRole("dialog", { name: "Workspace search" });
    await user.type(within(dialog).getByLabelText("Query"), "Archive");
    await user.click(within(dialog).getByRole("button", { name: "Search" }));

    expect(await within(dialog).findByText("2 result(s)")).toBeInTheDocument();
    expect(within(dialog).getByText("Archive.zip")).toBeInTheDocument();
    expect(within(dialog).getByText("Archive.tar")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Shelf Archive.tar" }));
    expect(await screen.findByText("Added 1 item(s) to shelf.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Stash Shelf" })).getByText("Archive.tar")).toBeInTheDocument();
  });

  it("compares selected file hashes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Archive.zip")).toBeInTheDocument());
    await user.click(screen.getByText("Archive.zip"));
    fireEvent.click(screen.getByText("Archive.tar"), { ctrlKey: true });
    await user.click(screen.getByLabelText("Hash compare"));

    const dialog = screen.getByRole("dialog", { name: "Hash compare" });
    await user.click(within(dialog).getByRole("button", { name: "Calculate" }));

    expect(await within(dialog).findByText(/1 matching group/)).toBeInTheDocument();
    expect(within(dialog).getByText("2 matching files")).toBeInTheDocument();
    expect(within(dialog).getAllByText("mock-hash-value").length).toBeGreaterThan(0);
  });

  it("copies selected paths and selects matching item types", async () => {
    const user = userEvent.setup();
    render(<App />);

    const pane = await screen.findByLabelText("Pane 1");
    await waitFor(() => expect(within(pane).getByText("Desktop")).toBeInTheDocument());
    await user.click(within(pane).getByText("Desktop"));
    await user.click(screen.getByLabelText("Copy paths"));

    expect(await screen.findByText("Copied 1 path(s).")).toBeInTheDocument();
    expect(window.localStorage.getItem("space.mock.clipboard")).toBe("C:\\Users\\Traveler\\Desktop");

    await user.click(screen.getByLabelText("Select same type"));
    expect(await screen.findByText("Selected 4 same type item(s).")).toBeInTheDocument();
    expect(screen.getByText("4 selected, 0 B")).toBeInTheDocument();

    const shell = screen.getByText("Four-pane file manager").closest("main");
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

  it("copies and moves files between panes through clipboard paste", async () => {
    const user = userEvent.setup();
    render(<App />);

    const pane1 = await screen.findByLabelText("Pane 1");
    const pane2 = await screen.findByLabelText("Pane 2");
    const pane3 = await screen.findByLabelText("Pane 3");
    await waitFor(() => expect(within(pane1).getByText("Space Notes.md")).toBeInTheDocument());

    await user.click(within(pane1).getByText("Space Notes.md"));
    await user.click(screen.getByLabelText("Copy"));
    await user.click(pane2);
    await user.click(screen.getByLabelText("Paste"));

    expect(await within(pane2).findByText("Space Notes.md")).toBeInTheDocument();
    expect(within(pane1).getByText("Space Notes.md")).toBeInTheDocument();

    await user.click(within(pane2).getByText("Space Notes.md"));
    await user.click(screen.getByLabelText("Cut"));
    await user.click(pane3);
    await user.click(screen.getByLabelText("Paste"));

    expect(await within(pane3).findByText("Space Notes.md")).toBeInTheDocument();
    await waitFor(() => expect(within(pane2).queryByText("Space Notes.md")).not.toBeInTheDocument());
    expect(within(pane1).getByText("Space Notes.md")).toBeInTheDocument();
  });

  it("copies from the pane that owns the transfer button even when another pane is active", async () => {
    const user = userEvent.setup();
    render(<App />);

    const pane1 = await screen.findByLabelText("Pane 1");
    const pane2 = await screen.findByLabelText("Pane 2");
    const pane3 = await screen.findByLabelText("Pane 3");
    await waitFor(() => expect(within(pane1).getByText("Space Notes.md")).toBeInTheDocument());

    await user.click(within(pane1).getByText("Space Notes.md"));
    await user.click(pane2);
    await user.click(within(pane1).getAllByRole("button", { name: "P3" })[0]);

    expect(await within(pane3).findByText("Space Notes.md")).toBeInTheDocument();
    expect(within(pane1).getByText("Space Notes.md")).toBeInTheDocument();
  });

  it("applies context menu file actions to the pane that opened the menu", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Renamed Todo.txt");
    render(<App />);

    const pane1 = await screen.findByLabelText("Pane 1");
    const pane2 = await screen.findByLabelText("Pane 2");
    await waitFor(() => expect(within(pane1).getByText("Space Notes.md")).toBeInTheDocument());
    await waitFor(() => expect(within(pane2).getByText("Todo.txt")).toBeInTheDocument());

    await user.click(within(pane1).getByText("Space Notes.md"));
    fireEvent.contextMenu(within(pane2).getByText("Todo.txt"));
    const contextMenu = document.querySelector(".context-menu");
    expect(contextMenu).not.toBeNull();
    await user.click(within(contextMenu as HTMLElement).getByRole("button", { name: "Rename" }));

    expect(await within(pane2).findByText("Renamed Todo.txt")).toBeInTheDocument();
    expect(within(pane2).queryByText("Todo.txt")).not.toBeInTheDocument();
    expect(within(pane1).getByText("Space Notes.md")).toBeInTheDocument();
    promptSpy.mockRestore();
  });

  it("saves and loads batch rename presets", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Space Notes.md")).toBeInTheDocument());
    await user.click(screen.getByText("Space Notes.md"));
    await user.click(screen.getByLabelText("Batch rename"));

    const dialog = screen.getByRole("dialog", { name: "Batch rename" });
    const formatInput = within(dialog).getByLabelText("Format");
    fireEvent.change(formatInput, { target: { value: "note-{n}" } });
    await user.type(within(dialog).getByLabelText("Preset name"), "Numbered Notes");
    await user.click(within(dialog).getByRole("button", { name: "Save Preset" }));

    await waitFor(() => {
      const presets = readSavedWorkspace()?.workspaces[0]?.batchRenamePresets;
      expect(presets).toHaveLength(1);
      expect(presets?.[0].name).toBe("Numbered Notes");
      expect(presets?.[0].rule.pattern).toBe("note-{n}");
    });

    const presetId = readSavedWorkspace()?.workspaces[0]?.batchRenamePresets?.[0].id;
    expect(presetId).toBeDefined();
    fireEvent.change(formatInput, { target: { value: "changed-{n}" } });
    fireEvent.change(within(dialog).getByLabelText("Preset"), { target: { value: presetId } });
    expect(formatInput).toHaveValue("note-{n}");

    await user.click(within(dialog).getByRole("button", { name: "Delete Preset" }));
    await waitFor(() => expect(readSavedWorkspace()?.workspaces[0]?.batchRenamePresets).toHaveLength(0));
  });

  it("records and clears batch rename history", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Space Notes.md")).toBeInTheDocument());
    await user.click(screen.getByText("Space Notes.md"));
    await user.click(screen.getByLabelText("Batch rename"));

    const dialog = screen.getByRole("dialog", { name: "Batch rename" });
    fireEvent.change(within(dialog).getByLabelText("Format"), { target: { value: "history-{n}" } });
    await user.click(within(dialog).getByRole("button", { name: "Rename" }));

    await waitFor(() => {
      const history = readSavedWorkspace()?.workspaces[0]?.batchRenameHistory;
      expect(history).toHaveLength(1);
      expect(history?.[0].rule.pattern).toBe("history-{n}");
      expect(history?.[0].changedCount).toBe(1);
    });

    await user.click(screen.getByText("Space Notes.md"));
    await user.click(screen.getByLabelText("Batch rename"));
    const nextDialog = screen.getByRole("dialog", { name: "Batch rename" });
    const historyRegion = within(nextDialog).getByRole("region", { name: "Rename history" });
    expect(within(historyRegion).getByText("Renamed 1 item(s).")).toBeInTheDocument();

    await user.click(within(historyRegion).getByRole("button", { name: "Clear History" }));
    await waitFor(() => expect(readSavedWorkspace()?.workspaces[0]?.batchRenameHistory).toHaveLength(0));
    expect(within(historyRegion).getByText("No batch rename operations recorded yet.")).toBeInTheDocument();
  });

  it("saves and loads folder sync presets", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("Pane 1")).toBeInTheDocument());
    await user.click(screen.getByLabelText("Folder sync"));

    const dialog = screen.getByRole("dialog", { name: "Folder sync" });
    fireEvent.change(within(dialog).getByLabelText("Direction"), { target: { value: "updateBoth" } });
    fireEvent.change(within(dialog).getByLabelText("Filter"), { target: { value: "Mock" } });
    fireEvent.change(within(dialog).getByLabelText("Preset name"), { target: { value: "Mirror Mock" } });
    await user.click(within(dialog).getByRole("button", { name: "Save Preset" }));

    await waitFor(() => {
      const presets = readSavedWorkspace()?.workspaces[0]?.folderSyncPresets;
      expect(presets).toHaveLength(1);
      expect(presets?.[0].name).toBe("Mirror Mock");
      expect(presets?.[0].direction).toBe("updateBoth");
      expect(presets?.[0].filter).toBe("Mock");
    });

    const presetId = readSavedWorkspace()?.workspaces[0]?.folderSyncPresets?.[0].id;
    expect(presetId).toBeDefined();
    fireEvent.change(within(dialog).getByLabelText("Direction"), { target: { value: "updateLeft" } });
    fireEvent.change(within(dialog).getByLabelText("Filter"), { target: { value: "Other" } });
    fireEvent.change(within(dialog).getByLabelText("Left path"), { target: { value: "C:\\Changed" } });
    fireEvent.change(within(dialog).getByLabelText("Preset"), { target: { value: presetId } });

    expect(within(dialog).getByLabelText("Direction")).toHaveValue("updateBoth");
    expect(within(dialog).getByLabelText("Filter")).toHaveValue("Mock");
    expect(within(dialog).getByLabelText("Left path")).toHaveValue("C:\\Users\\Traveler");

    await user.click(within(dialog).getByRole("button", { name: "Delete Preset" }));
    await waitFor(() => expect(readSavedWorkspace()?.workspaces[0]?.folderSyncPresets).toHaveLength(0));
  });

  it("collects selected files in the stash shelf and hashes them", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Space Notes.md")).toBeInTheDocument());
    await user.click(screen.getByText("Space Notes.md"));
    await user.click(screen.getByLabelText("Add selection to shelf"));

    const shelf = screen.getByRole("region", { name: "Stash Shelf" });
    expect(within(shelf).getByText("Space Notes.md")).toBeInTheDocument();

    await user.click(within(shelf).getByRole("button", { name: "Hash" }));
    expect(await screen.findByText(/Shelf SHA-256/)).toBeInTheDocument();

    await user.click(within(shelf).getByRole("button", { name: "Clear" }));
    expect(within(shelf).queryByText("Space Notes.md")).not.toBeInTheDocument();
  });

  it("opens tar archives in the archive browser", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Archive.tar")).toBeInTheDocument());
    await user.dblClick(screen.getByText("Archive.tar"));
    expect(screen.getByRole("dialog", { name: "Archive browser" })).toBeInTheDocument();
    expect(screen.getByText("readme.txt")).toBeInTheDocument();
  });

  it("creates, renames, and clones workspace tabs", async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Design");
    render(<App />);

    await waitFor(() => expect(screen.getByRole("tab", { name: "Default" })).toBeInTheDocument());
    await user.click(screen.getByLabelText("New workspace"));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Workspace 2" })).toBeInTheDocument());

    await user.click(screen.getByLabelText("Rename workspace"));
    expect(screen.getByRole("tab", { name: "Design" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Clone workspace"));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Design Copy" })).toBeInTheDocument());
    promptSpy.mockRestore();
  });

  it("adds color rules and highlights matching entries", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Archive.zip")).toBeInTheDocument());
    await user.click(screen.getByLabelText("Color rules"));

    const dialog = screen.getByRole("dialog", { name: "Color rules" });
    await user.click(within(dialog).getByRole("button", { name: "Add Rule" }));
    await user.click(within(dialog).getByRole("button", { name: "Save Rules" }));

    await waitFor(() => expect(screen.getByText("Archive.zip").closest("button")).toHaveClass("colorized"));
    await user.click(screen.getAllByLabelText("Icon view")[2]);
    await waitFor(() => expect(screen.getByText("Archive.zip").closest("button")).toHaveClass("colorized"));
  });

  it("runs Quick Launch items and opens the settings panel", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("Pane 1")).toBeInTheDocument());
    await user.click(screen.getByLabelText("Quick launch"));

    const panel = screen.getByRole("region", { name: "Quick Launch" });
    expect(within(panel).getByText("PowerShell Here")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "PowerShell Here" }));
    expect(await screen.findByText("Launched PowerShell Here.")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Quick launch"));
    await user.click(within(screen.getByRole("region", { name: "Quick Launch" })).getByRole("button", { name: "Manage" }));
    expect(screen.getByRole("dialog", { name: "Quick Launch settings" })).toBeInTheDocument();
  });

  it("customizes toolbar and context menu actions", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("Customize actions")).toBeInTheDocument());
    await user.click(screen.getByLabelText("Customize actions"));

    const dialog = screen.getByRole("dialog", { name: "Customize actions" });
    const toolbarGroup = within(dialog).getByRole("group", { name: "Toolbar" });
    await user.click(within(toolbarGroup).getByLabelText("Delete"));
    fireEvent.change(within(dialog).getByLabelText("Workspace Search hotkey"), { target: { value: "ctrl+alt+w" } });
    await user.click(within(dialog).getByRole("button", { name: "Save Settings" }));

    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
    await waitFor(() => {
      const workspace = readSavedWorkspace()?.workspaces[0];
      const toolbarIds = workspace?.toolbarActionIds;
      expect(toolbarIds).toBeDefined();
      expect(toolbarIds).not.toContain("delete");
      expect(workspace?.hotkeyBindings).toContainEqual({ actionId: "workspaceSearch", shortcut: "Ctrl+Alt+W" });
    });

    const shell = screen.getByText("Four-pane file manager").closest("main");
    expect(shell).not.toBeNull();
    fireEvent.keyDown(shell!, { key: "w", ctrlKey: true, altKey: true });
    expect(screen.getByRole("dialog", { name: "Workspace search" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getByLabelText("Customize actions"));
    const secondDialog = screen.getByRole("dialog", { name: "Customize actions" });
    const contextGroup = within(secondDialog).getByRole("group", { name: "Context Menu" });
    await user.click(within(contextGroup).getByLabelText("Delete"));
    await user.click(within(secondDialog).getByRole("button", { name: "Save Settings" }));
    await waitFor(() => {
      const contextMenuIds = readSavedWorkspace()?.workspaces[0]?.contextMenuActionIds;
      expect(contextMenuIds).toBeDefined();
      expect(contextMenuIds).not.toContain("delete");
    });

    fireEvent.contextMenu(screen.getByText("Space Notes.md"));
    const contextMenu = document.querySelector(".context-menu");
    expect(contextMenu).not.toBeNull();
    expect(within(contextMenu as HTMLElement).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(within(contextMenu as HTMLElement).getByRole("button", { name: "Quick Launch..." })).toBeInTheDocument();
  });
});
