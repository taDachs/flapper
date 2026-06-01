import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ExerciseProgressPage from "./ExerciseProgress";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../api", () => ({
  apiGet: vi.fn(),
}));

vi.mock("./ExerciseProgress.module.css", () => ({ default: {} }));

// Mock recharts to avoid jsdom canvas issues
vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { apiGet } from "../api";
const mockApiGet = vi.mocked(apiGet);

// ── Fixtures ───────────────────────────────────────────────────────────────

const mockExerciseWithFields = {
  id: 1,
  name: "Deadlift",
  category: "strength",
  description: null,
  default_sets_reps: null,
  archived_at: null,
  fields: [
    { id: 10, name: "weight", unit: "kg", display_order: 0 },
    { id: 11, name: "reps", unit: null, display_order: 1 },
  ],
};

const mockExerciseWithoutFields = {
  id: 2,
  name: "Stretching",
  category: "stretch",
  description: null,
  default_sets_reps: null,
  archived_at: null,
  fields: [],
};

const mockProgressDeadlift = {
  exercise_id: 1,
  exercise_name: "Deadlift",
  fields: [
    {
      field_id: 10,
      field_name: "weight",
      unit: "kg",
      data_points: [
        { date: "2026-06-01", value: "100" },
        { date: "2026-06-08", value: "105" },
      ],
    },
    {
      field_id: 11,
      field_name: "reps",
      unit: null,
      data_points: [{ date: "2026-06-01", value: "5" }],
    },
  ],
};

function setupMocks(
  progress: unknown[] = [],
  exercises: unknown[] = []
) {
  vi.clearAllMocks();
  mockApiGet.mockImplementation(async (path: string) => {
    if (path === "/api/exercises/progress") return progress;
    if (path === "/api/exercises") return exercises;
    return [];
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ExerciseProgressPage />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ExerciseProgressPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows empty state when no exercises exist at all", async () => {
    setupMocks([], []);
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText(/no exercise data yet/i)
      ).toBeInTheDocument()
    );
  });

  it("shows error message when API call fails", async () => {
    vi.clearAllMocks();
    mockApiGet.mockRejectedValue(new Error("Network error"));
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText(/failed to load exercise progress data/i)
      ).toBeInTheDocument()
    );
  });

  it("renders exercise selector dropdown when exercises are present", async () => {
    setupMocks([mockProgressDeadlift], [mockExerciseWithFields]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("combobox")).toBeInTheDocument()
    );
    expect(screen.getByRole("option", { name: "Deadlift" })).toBeInTheDocument();
  });

  it("shows charts for the selected exercise that has logged data", async () => {
    setupMocks([mockProgressDeadlift], [mockExerciseWithFields]);
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId("line-chart").length).toBeGreaterThan(0)
    );
  });

  it("shows no-fields message when selected exercise has no numeric fields", async () => {
    setupMocks([], [mockExerciseWithoutFields]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("no-fields-message")).toBeInTheDocument()
    );
    // Should include a link to exercise library
    const link = screen.getByRole("link", { name: /exercise library/i });
    expect(link).toHaveAttribute("href", "/exercises");
  });

  it("shows 'no data logged' message when exercise has fields but no logged values", async () => {
    setupMocks([], [mockExerciseWithFields]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("no-data-message")).toBeInTheDocument()
    );
  });

  it("allows switching between exercises via the selector", async () => {
    const user = userEvent.setup();
    setupMocks(
      [mockProgressDeadlift],
      [mockExerciseWithFields, mockExerciseWithoutFields]
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("combobox")).toBeInTheDocument()
    );

    // Initially Deadlift is selected and charts are shown
    expect(screen.getAllByTestId("line-chart").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("no-fields-message")).not.toBeInTheDocument();

    // Switch to Stretching (no fields)
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, String(mockExerciseWithoutFields.id));

    await waitFor(() =>
      expect(screen.getByTestId("no-fields-message")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
  });

  it("unit appears in Y-axis label only, not duplicated in field heading", async () => {
    setupMocks([mockProgressDeadlift], [mockExerciseWithFields]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("combobox")).toBeInTheDocument()
    );
    // Field heading should just show the field name without unit in parentheses
    const headings = screen.queryAllByText(/weight \(kg\)/i);
    expect(headings.length).toBe(0);
    // The field name alone should appear
    expect(screen.getByText("weight")).toBeInTheDocument();
  });

  it("selector shows both exercises with and without logged data", async () => {
    setupMocks(
      [mockProgressDeadlift],
      [mockExerciseWithFields, mockExerciseWithoutFields]
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("combobox")).toBeInTheDocument()
    );
    expect(screen.getByRole("option", { name: "Deadlift" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Stretching" })).toBeInTheDocument();
  });
});
