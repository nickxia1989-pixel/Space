import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";
import type { WorkspaceDocument } from "../src/shared";

function readSavedWorkspace(): WorkspaceDocument | null {
  const raw = window.localStorage.getItem("space.mock.workspace");
  return raw ? (JSON.parse(raw) as WorkspaceDocument) : null;
}

describe("App", () => {
  it("renders four explorer panes with default controls", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Four-pane file manager")).toBeInTheDocument());
    expect(screen.getByLabelText("Pane 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Pane 4")).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("Filter or search")).toHaveLength(4);
  });

  it("supports switching an individual pane to icon view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("Pane 1")).toBeInTheDocument());
    await user.click(screen.getAllByLabelText("Icon view")[0]);
    expect(screen.getAllByLabelText("Icon view")[0]).toHaveClass("active");
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
    await user.click(within(dialog).getByRole("button", { name: "Save Layout" }));

    expect(screen.queryByLabelText("Delete")).not.toBeInTheDocument();
    await waitFor(() => {
      const toolbarIds = readSavedWorkspace()?.workspaces[0]?.toolbarActionIds;
      expect(toolbarIds).toBeDefined();
      expect(toolbarIds).not.toContain("delete");
    });

    await user.click(screen.getByLabelText("Customize actions"));
    const secondDialog = screen.getByRole("dialog", { name: "Customize actions" });
    const contextGroup = within(secondDialog).getByRole("group", { name: "Context Menu" });
    await user.click(within(contextGroup).getByLabelText("Delete"));
    await user.click(within(secondDialog).getByRole("button", { name: "Save Layout" }));
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
