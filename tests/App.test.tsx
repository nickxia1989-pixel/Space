import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";

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

  it("opens zip archives in the archive browser", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Archive.zip")).toBeInTheDocument());
    await user.dblClick(screen.getByText("Archive.zip"));
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
});
