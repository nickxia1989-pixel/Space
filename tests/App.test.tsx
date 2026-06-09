import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
});
