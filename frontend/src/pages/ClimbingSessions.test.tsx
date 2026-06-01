import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ClimbingSessions from "./ClimbingSessions";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock("./ClimbingSessions.module.css", () => ({ default: {} }));
vi.mock("../components/ConfirmDialog.module.css", () => ({ default: {} }));

import { apiGet, apiPost, apiDelete } from "../api";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockGrades = [{ id: 1, name: "blau", difficulty: 4, color: "#0000ff" }];

const mockSession = {
  id: 10,
  date: "2026-05-31",
  entries: [
    { id: 100, climbing_session_id: 10, grade_id: 1, grade_name: "blau", grade_color: "#0000ff", sends: 2, attempts: 3 },
  ],
};

function setupMocks() {
  vi.clearAllMocks();
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === "/api/grades") return mockGrades;
    if (path === "/api/climbing-sessions") return [mockSession];
    return [];
  });
  vi.mocked(apiPost).mockResolvedValue({ id: 99, date: "2026-06-01", entries: [] });
  vi.mocked(apiDelete).mockResolvedValue({});
}

async function renderPage() {
  const result = render(
    <MemoryRouter>
      <ClimbingSessions />
    </MemoryRouter>
  );
  // Wait for data to load
  await waitFor(() => {
    expect(screen.getByText("2026-05-31")).toBeInTheDocument();
  });
  return result;
}

async function renderPageNoGrades() {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === "/api/grades") return [];
    if (path === "/api/climbing-sessions") return [mockSession];
    return [];
  });
  const result = render(
    <MemoryRouter>
      <ClimbingSessions />
    </MemoryRouter>
  );
  await waitFor(() => {
    expect(screen.getByText("2026-05-31")).toBeInTheDocument();
  });
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ClimbingSessions — delete session confirmation", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("shows a confirmation dialog when Delete session is clicked", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it("deletes the session when the dialog is confirmed", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(apiDelete).toHaveBeenCalledWith("/api/climbing-sessions/10");
  });

  it("does not delete when the dialog is cancelled", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it("closes the dialog after cancel", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ClimbingSessions — remove entry confirmation", () => {
  beforeEach(() => {
    setupMocks();
  });

  async function expandSession() {
    await renderPage();
    // Expand the session to reveal entries
    await userEvent.click(screen.getByText("2026-05-31"));
    // Wait for entries to show
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
    });
  }

  it("shows a confirmation dialog when Remove entry is clicked", async () => {
    await expandSession();
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it("removes the entry when confirmed", async () => {
    await expandSession();
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(apiDelete).toHaveBeenCalledWith("/api/climbing-sessions/10/entries/100");
  });

  it("does not remove the entry when cancelled", async () => {
    await expandSession();
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(apiDelete).not.toHaveBeenCalled();
  });
});

describe("ClimbingSessions — sends > attempts validation", () => {
  beforeEach(() => {
    setupMocks();
  });

  async function openEntryForm() {
    await renderPage();
    // Click the "+ Entry" button to open the add-entry form
    await userEvent.click(screen.getByRole("button", { name: /\+ entry/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^add$/i })).toBeInTheDocument();
    });
  }

  it("shows a validation error when sends > attempts", async () => {
    await openEntryForm();
    // Set sends to 5 and attempts to 2
    const sendsInput = screen.getByLabelText(/sends/i);
    const attemptsInput = screen.getByLabelText(/attempts/i);
    await userEvent.clear(sendsInput);
    await userEvent.type(sendsInput, "5");
    await userEvent.clear(attemptsInput);
    await userEvent.type(attemptsInput, "2");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.getByText(/sends.*cannot.*exceed.*attempts|sends must be|sends.*≤.*attempts/i)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalledWith(expect.stringContaining("/entries"), expect.anything());
  });

  it("does not show an error when sends ≤ attempts", async () => {
    await openEntryForm();
    const sendsInput = screen.getByLabelText(/sends/i);
    const attemptsInput = screen.getByLabelText(/attempts/i);
    await userEvent.clear(sendsInput);
    await userEvent.type(sendsInput, "2");
    await userEvent.clear(attemptsInput);
    await userEvent.type(attemptsInput, "5");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.queryByText(/sends.*cannot|sends must be|sends.*≤/i)).not.toBeInTheDocument();
  });
});

describe("ClimbingSessions — duplicate date warning", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("shows a warning when creating a session for a date that already has one", async () => {
    await renderPage();
    // The existing session is for 2026-05-31; try to add another for the same date
    const dateInput = screen.getByLabelText(/date/i);
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, "2026-05-31");
    await userEvent.click(screen.getByRole("button", { name: /add session/i }));
    expect(
      screen.getByText(/already.*session|session.*already|duplicate/i)
    ).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("allows creating a session for a new date", async () => {
    await renderPage();
    const dateInput = screen.getByLabelText(/date/i);
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, "2026-06-10");
    await userEvent.click(screen.getByRole("button", { name: /add session/i }));
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/api/climbing-sessions", { date: "2026-06-10" });
    });
  });
});

describe("ClimbingSessions — no grades link", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("shows 'No grades configured' as a link to /settings/grades when no grades exist", async () => {
    await renderPageNoGrades();
    // Expand the session to reveal the entry form with the grades message
    await userEvent.click(screen.getByRole("button", { name: /\+ entry/i }));
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /settings/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/settings/grades");
    });
  });
});
