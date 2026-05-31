import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";

// Mock the api module
vi.mock("../api", () => ({
  apiGet: vi.fn(),
}));

// Mock CSS modules
vi.mock("./Dashboard.module.css", () => ({ default: {} }));

import { apiGet } from "../api";
const mockApiGet = vi.mocked(apiGet);

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

// Helper to build a full DashboardData object with optional overrides
function makeData(overrides: {
  active_plan?: { id: number; name: string } | null;
  today_session?: {
    id: number;
    date: string;
    completed_count: number;
    total_count: number;
  } | null;
  recent_climbing?: {
    id: number;
    date: string;
    top_grade_name: string | null;
    top_grade_difficulty: number | null;
  } | null;
} = {}) {
  return {
    active_plan: overrides.active_plan !== undefined ? overrides.active_plan : null,
    today_session:
      overrides.today_session !== undefined ? overrides.today_session : null,
    recent_climbing:
      overrides.recent_climbing !== undefined ? overrides.recent_climbing : null,
  };
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows loading state while fetching", () => {
    // Never resolves
    mockApiGet.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows error when API call fails", async () => {
    mockApiGet.mockRejectedValue(new Error("Network error"));
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText(/failed to load dashboard/i)).toBeInTheDocument()
    );
  });

  it("shows empty state when user has no data", async () => {
    mockApiGet.mockResolvedValue(makeData());
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByTestId("empty-state")).toBeInTheDocument()
    );
    expect(screen.getByText(/set up grades/i)).toBeInTheDocument();
    expect(screen.getByText(/create exercises/i)).toBeInTheDocument();
    expect(screen.getByText(/create a week plan/i)).toBeInTheDocument();
  });

  it("shows active plan name when a plan is active", async () => {
    mockApiGet.mockResolvedValue(
      makeData({ active_plan: { id: 1, name: "My Training Plan" } })
    );
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText("My Training Plan")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });

  it("shows 'No active plan' prompt linking to /week-templates when no plan is set", async () => {
    mockApiGet.mockResolvedValue(
      makeData({
        // Force something else to be non-null so we see the widget without empty state
        recent_climbing: {
          id: 1,
          date: "2024-01-10",
          top_grade_name: "blau",
          top_grade_difficulty: 4,
        },
      })
    );
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText(/no active plan/i)).toBeInTheDocument()
    );
    const link = screen.getByRole("link", { name: /set one up/i });
    expect(link).toHaveAttribute("href", "/week-templates");
  });

  it("shows today's training session with exercise counts", async () => {
    mockApiGet.mockResolvedValue(
      makeData({
        today_session: {
          id: 5,
          date: "2024-06-15",
          completed_count: 3,
          total_count: 5,
        },
      })
    );
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText(/3\/5 exercises done/i)).toBeInTheDocument()
    );
    const trainingLink = screen.getByRole("link", { name: /3\/5 exercises done/i });
    expect(trainingLink).toHaveAttribute("href", "/training");
  });

  it("shows 'No session yet' prompt when no training session today", async () => {
    mockApiGet.mockResolvedValue(
      makeData({
        active_plan: { id: 1, name: "Plan" },
      })
    );
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText(/no session yet/i)).toBeInTheDocument()
    );
    const link = screen.getByRole("link", { name: /open training/i });
    expect(link).toHaveAttribute("href", "/training");
  });

  it("shows most recent climbing session date and top grade", async () => {
    mockApiGet.mockResolvedValue(
      makeData({
        recent_climbing: {
          id: 3,
          date: "2024-05-20",
          top_grade_name: "rot",
          top_grade_difficulty: 6,
        },
      })
    );
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText(/2024-05-20 — top grade: rot/i)).toBeInTheDocument()
    );
    const climbingLink = screen.getByRole("link", {
      name: /2024-05-20 — top grade: rot/i,
    });
    expect(climbingLink).toHaveAttribute("href", "/climbing");
  });

  it("shows climbing session date without grade when session has no entries", async () => {
    mockApiGet.mockResolvedValue(
      makeData({
        recent_climbing: {
          id: 4,
          date: "2024-04-10",
          top_grade_name: null,
          top_grade_difficulty: null,
        },
      })
    );
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText("2024-04-10")).toBeInTheDocument()
    );
  });

  it("shows 'No climbing logged' prompt when no climbing sessions exist", async () => {
    mockApiGet.mockResolvedValue(
      makeData({
        active_plan: { id: 1, name: "Plan" },
      })
    );
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText(/no climbing logged yet/i)).toBeInTheDocument()
    );
    const link = screen.getByRole("link", { name: /log a session/i });
    expect(link).toHaveAttribute("href", "/climbing");
  });

  it("always shows quick links to Training, Climbing, and Settings", async () => {
    mockApiGet.mockResolvedValue(makeData());
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByRole("region", { name: /quick links/i })).toBeInTheDocument()
    );
    // Quick links section has links to each destination
    const allLinks = screen.getAllByRole("link");
    const hrefs = allLinks.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/training");
    expect(hrefs).toContain("/climbing");
    expect(hrefs).toContain("/settings/grades");
  });
});
