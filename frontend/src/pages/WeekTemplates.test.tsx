import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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

import { apiGet, apiPost, apiDelete } from "../api";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockTemplate = {
  id: 1,
  name: "My Plan",
  is_active: false,
};

const mockActiveTemplate = {
  id: 2,
  name: "Active Plan",
  is_active: true,
};

function setupMocks() {
  vi.clearAllMocks();
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === "/api/week-templates") return [mockTemplate];
    if (path === "/api/exercises") return [];
    if (path.startsWith("/api/week-templates/")) return { ...mockTemplate, days: [] };
    return [];
  });
  vi.mocked(apiPost).mockResolvedValue({});
  vi.mocked(apiDelete).mockResolvedValue({});
}

async function renderPage() {
  const result = render(<WeekTemplates />);
  await waitFor(() => {
    expect(screen.getByText("My Plan")).toBeInTheDocument();
  });
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WeekTemplates — naming (Templates → Week Plans)", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("shows 'Week Plans' heading in the sidebar", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: /week plans/i })).toBeInTheDocument();
  });

  it("create button says 'Create Week Plan'", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: /create week plan/i })).toBeInTheDocument();
  });

  it("create button does NOT say 'Create Template'", async () => {
    await renderPage();
    expect(screen.queryByRole("button", { name: /create template/i })).not.toBeInTheDocument();
  });

  it("rename modal heading says 'Rename Week Plan'", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^rename$/i }));
    expect(screen.getByText(/rename week plan/i)).toBeInTheDocument();
  });
});

describe("WeekTemplates — activation feedback", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("shows activation feedback message after activating a plan", async () => {
    vi.mocked(apiPost).mockResolvedValue({});
    // Start with an inactive template, then after activation return it as active
    let activated = false;
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === "/api/week-templates")
        return [{ ...mockTemplate, is_active: activated }];
      if (path === "/api/exercises") return [];
      if (path.startsWith("/api/week-templates/"))
        return { ...mockTemplate, is_active: activated, days: [] };
      return [];
    });
    vi.mocked(apiPost).mockImplementation(async () => {
      activated = true;
      return {};
    });

    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^activate$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent(/my plan.*active week plan/i);
  });
});

describe("WeekTemplates — stale ACTIVE badge fix", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("reloads the open detail panel when a different plan is activated", async () => {
    // Two plans: plan A (open in editor), plan B (in sidebar, about to be activated)
    const planA = { id: 1, name: "Plan A", is_active: true };
    const planB = { id: 2, name: "Plan B", is_active: false };

    let callCount = 0;
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === "/api/week-templates") {
        // After first load, simulate plan B becoming active
        callCount++;
        if (callCount <= 2) return [planA, planB];
        return [{ ...planA, is_active: false }, { ...planB, is_active: true }];
      }
      if (path === "/api/exercises") return [];
      if (path === "/api/week-templates/1") return { ...planA, is_active: planA.is_active, days: [] };
      if (path === "/api/week-templates/2") return { ...planB, days: [] };
      return [];
    });

    render(<WeekTemplates />);
    await waitFor(() => expect(screen.getByText("Plan A")).toBeInTheDocument());

    // Open plan A in the editor
    await userEvent.click(screen.getByText("Plan A"));
    await waitFor(() => expect(screen.getByText("Plan B")).toBeInTheDocument());

    // Activate plan B — should trigger a reload of the editor (plan A's detail)
    await act(async () => {
      await userEvent.click(screen.getAllByRole("button", { name: /^activate$/i })[0]);
    });

    // The detail panel should have been reloaded (apiGet called with plan A's id)
    await waitFor(() => {
      const calls = vi.mocked(apiGet).mock.calls.map((c) => c[0]);
      expect(calls).toContain("/api/week-templates/1");
    });
  });
});

describe("WeekTemplates — delete active plan warning", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("shows a warning in the confirmation dialog when deleting the active plan", async () => {
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === "/api/week-templates") return [mockActiveTemplate];
      if (path === "/api/exercises") return [];
      if (path.startsWith("/api/week-templates/")) return { ...mockActiveTemplate, days: [] };
      return [];
    });

    render(<WeekTemplates />);
    await waitFor(() => expect(screen.getByText("Active Plan")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The warning message should mention it's the active plan
    expect(screen.getByRole("dialog")).toHaveTextContent(/active week plan/i);
  });

  it("does NOT show the active-plan warning when deleting an inactive plan", async () => {
    // mockTemplate is is_active: false
    await renderPage();

    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/active week plan/i);
  });
});

describe("WeekTemplates — delete template confirmation (regression)", () => {
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
