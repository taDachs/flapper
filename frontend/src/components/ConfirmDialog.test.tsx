import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "./ConfirmDialog";

vi.mock("./ConfirmDialog.module.css", () => ({ default: {} }));

describe("ConfirmDialog", () => {
  it("renders the message", () => {
    render(
      <ConfirmDialog
        message="Are you sure you want to delete this?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText("Are you sure you want to delete this?")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        message="Delete?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not call onConfirm when cancel is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
