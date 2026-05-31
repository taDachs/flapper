import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExerciseLibrary from "./ExerciseLibrary";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock("./ExerciseLibrary.module.css", () => ({ default: {} }));
vi.mock("../components/ConfirmDialog.module.css", () => ({ default: {} }));

import { apiGet, apiPost, apiDelete } from "../api";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockExercise = {
  id: 1,
  name: "Pull-ups",
  category: "strength",
  description: null,
  default_sets_reps: "3×10",
  archived_at: null,
  fields: [],
};

function setupMocks() {
  vi.clearAllMocks();
  vi.mocked(apiGet).mockResolvedValue([mockExercise]);
  vi.mocked(apiPost).mockResolvedValue({});
  vi.mocked(apiDelete).mockResolvedValue({});
}

async function renderPage() {
  const result = render(<ExerciseLibrary />);
  await waitFor(() => {
    expect(screen.getByText("Pull-ups")).toBeInTheDocument();
  });
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ExerciseLibrary — delete exercise confirmation", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("shows a confirmation dialog when Delete is clicked", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it("deletes the exercise when the dialog is confirmed", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(apiDelete).toHaveBeenCalledWith("/api/exercises/1");
  });

  it("does not delete when the dialog is cancelled", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it("closes the dialog after cancel", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ExerciseLibrary — archive exercise confirmation", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("shows a confirmation dialog when Archive is clicked", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /archive/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("archives the exercise when the dialog is confirmed", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /archive/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(apiPost).toHaveBeenCalledWith("/api/exercises/1/archive", {});
  });

  it("does not archive when the dialog is cancelled", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /archive/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(apiPost).not.toHaveBeenCalled();
  });
});
