import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GradesSettings from "./GradesSettings";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock("./GradesSettings.module.css", () => ({ default: {} }));
vi.mock("../components/ConfirmDialog.module.css", () => ({ default: {} }));

import { apiGet, apiPost } from "../api";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FRENCH_GRADES = [
  "3","4","5","5+","6A","6A+","6B","6B+","6C","6C+",
  "7A","7A+","7B","7B+","7C","7C+","8A","8A+","8B","8B+","8C","8C+",
];

function setupMocks(existingGrades: unknown[] = []) {
  vi.clearAllMocks();
  vi.mocked(apiGet).mockResolvedValue(existingGrades);
  vi.mocked(apiPost).mockResolvedValue({ id: 99, name: "x", difficulty: 1, color: null });
}

async function renderPage() {
  const result = render(<GradesSettings />);
  // Wait for initial data load
  await waitFor(() => {
    expect(apiGet).toHaveBeenCalledWith("/api/grades");
  });
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GradesSettings — French boulder preset button", () => {
  beforeEach(() => setupMocks([]));

  it("renders a 'Load French boulder grades' button", async () => {
    await renderPage();
    expect(
      screen.getByRole("button", { name: /load french boulder grades/i })
    ).toBeInTheDocument();
  });

  it("clicking the button when no grades exist loads all 22 French boulder grades", async () => {
    await renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: /load french boulder grades/i })
    );
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledTimes(22);
    });
    // First grade is "3" with difficulty 1
    expect(apiPost).toHaveBeenCalledWith("/api/grades", { name: "3", difficulty: 1, color: null });
    // Last grade is "8C+" with difficulty 22
    expect(apiPost).toHaveBeenCalledWith("/api/grades", { name: "8C+", difficulty: 22, color: null });
  });

  it("does not show a confirmation dialog when no grades exist", async () => {
    await renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: /load french boulder grades/i })
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("GradesSettings — preset confirmation when grades exist", () => {
  const existingGrade = { id: 1, name: "blau", difficulty: 4, color: "#0000ff" };

  beforeEach(() => setupMocks([existingGrade]));

  it("shows a confirmation dialog when grades already exist", async () => {
    await renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: /load french boulder grades/i })
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("loads grades after confirming the dialog", async () => {
    await renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: /load french boulder grades/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /load preset/i }));
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledTimes(22);
    });
  });

  it("does not load grades when the dialog is cancelled", async () => {
    await renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: /load french boulder grades/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(apiPost).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("GradesSettings — difficulty helper text", () => {
  beforeEach(() => setupMocks([]));

  it("shows helper text explaining the difficulty field", async () => {
    await renderPage();
    expect(
      screen.getByText(/higher number.*harder|ordering.*progress|used for ordering/i)
    ).toBeInTheDocument();
  });
});
