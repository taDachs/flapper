import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TrainingSessions from "./TrainingSessions";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  apiPatch: vi.fn(),
}));

vi.mock("./TrainingSessions.module.css", () => ({ default: {} }));

import { apiGet } from "../api";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const todaySession = {
  id: 1,
  date: new Date().toISOString().slice(0, 10),
  weekday: new Date().getDay(),
  exercises: [],
};

function setupMocks({
  templates = [] as Array<{ id: number; name: string; is_active: boolean }>,
} = {}) {
  vi.clearAllMocks();
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.startsWith("/api/training-sessions/for-date")) return todaySession;
    if (path === "/api/training-sessions") return [];
    if (path === "/api/exercises") return [];
    if (path === "/api/week-templates") return templates;
    return null;
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TrainingSessions />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TrainingSessions — active week plan banner", () => {
  beforeEach(() => {
    // default: no templates loaded yet
  });

  it("shows the active week plan name when a plan is active", async () => {
    setupMocks({
      templates: [{ id: 1, name: "My Week Plan", is_active: true }],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/week plan:/i)).toBeInTheDocument();
    });
    expect(screen.getByText("My Week Plan")).toBeInTheDocument();
  });

  it("links the active plan name to /week-templates", async () => {
    setupMocks({
      templates: [{ id: 1, name: "My Week Plan", is_active: true }],
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "My Week Plan" })).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: "My Week Plan" })).toHaveAttribute(
      "href",
      "/week-templates"
    );
  });

  it("shows 'No active week plan' prompt when no plan is active", async () => {
    setupMocks({
      templates: [{ id: 1, name: "Inactive Plan", is_active: false }],
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/no active week plan/i)).toBeInTheDocument()
    );
  });

  it("shows 'set one up' link to /week-templates when no plan is active", async () => {
    setupMocks({ templates: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /set one up/i })).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: /set one up/i })).toHaveAttribute(
      "href",
      "/week-templates"
    );
  });

  it("shows 'No active week plan' when templates list is empty", async () => {
    setupMocks({ templates: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/no active week plan/i)).toBeInTheDocument()
    );
  });
});
