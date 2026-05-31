import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WeekTemplates from "./WeekTemplates";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock("./WeekTemplates.module.css", () => ({ default: {} }));
vi.mock("../components/ConfirmDialog.module.css", () => ({ default: {} }));

import { apiGet, apiDelete } from "../api";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockTemplate = {
  id: 1,
  name: "My Template",
  is_active: false,
};

function setupMocks() {
  vi.clearAllMocks();
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === "/api/week-templates") return [mockTemplate];
    if (path === "/api/exercises") return [];
    if (path.startsWith("/api/week-templates/")) return { ...mockTemplate, days: [] };
    return [];
  });
  vi.mocked(apiDelete).mockResolvedValue({});
}

async function renderPage() {
  const result = render(<WeekTemplates />);
  await waitFor(() => {
    expect(screen.getByText("My Template")).toBeInTheDocument();
  });
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WeekTemplates — delete template confirmation", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("shows a confirmation dialog when Delete is clicked", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it("deletes the template when the dialog is confirmed", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(apiDelete).toHaveBeenCalledWith("/api/week-templates/1");
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
