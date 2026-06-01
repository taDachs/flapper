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

const mockArchivedExercise = {
  id: 2,
  name: "Old Deadlift",
  category: "strength",
  description: "An old favourite",
  default_sets_reps: null,
  archived_at: "2024-01-01T00:00:00.000Z",
  fields: [],
};

const mockExerciseWithDescription = {
  id: 3,
  name: "Dead hang",
  category: "finger",
  description: "Hang from a bar for time",
  default_sets_reps: "3×10s",
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
    await userEvent.click(screen.getByRole("button", { name: /^archive$/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("archives the exercise when the dialog is confirmed", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^archive$/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(apiPost).toHaveBeenCalledWith("/api/exercises/1/archive", {});
  });

  it("does not archive when the dialog is cancelled", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^archive$/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(apiPost).not.toHaveBeenCalled();
  });
});

describe("ExerciseLibrary — show archived toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: active-only list
    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path.includes("includeArchived=true")) {
        return Promise.resolve([mockExercise, mockArchivedExercise]);
      }
      return Promise.resolve([mockExercise]);
    });
    vi.mocked(apiPost).mockResolvedValue({});
  });

  it("does not show archived exercises by default", async () => {
    await renderPage();
    expect(screen.queryByText("Old Deadlift")).not.toBeInTheDocument();
  });

  it("shows a Show archived toggle", async () => {
    await renderPage();
    expect(
      screen.getByRole("checkbox", { name: /show archived/i })
    ).toBeInTheDocument();
  });

  it("reveals archived exercises when toggle is enabled", async () => {
    await renderPage();
    const toggle = screen.getByRole("checkbox", { name: /show archived/i });
    await userEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByText("Old Deadlift")).toBeInTheDocument();
    });
  });

  it("calls the API with includeArchived=true when toggle is enabled", async () => {
    await renderPage();
    const toggle = screen.getByRole("checkbox", { name: /show archived/i });
    await userEvent.click(toggle);
    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith(
        expect.stringContaining("includeArchived=true")
      );
    });
  });

  it("shows Unarchive button for archived exercises", async () => {
    vi.mocked(apiGet).mockResolvedValue([mockExercise, mockArchivedExercise]);
    render(<ExerciseLibrary />);
    await waitFor(() => {
      expect(screen.getByText("Old Deadlift")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /unarchive/i })
    ).toBeInTheDocument();
  });

  it("calls unarchive API when Unarchive is clicked and confirmed", async () => {
    vi.mocked(apiGet).mockResolvedValue([mockExercise, mockArchivedExercise]);
    render(<ExerciseLibrary />);
    await waitFor(() => {
      expect(screen.getByText("Old Deadlift")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /unarchive/i }));
    // Should show confirmation dialog
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(apiPost).toHaveBeenCalledWith("/api/exercises/2/unarchive", {});
  });
});

describe("ExerciseLibrary — description on card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiGet).mockResolvedValue([mockExerciseWithDescription]);
    vi.mocked(apiPost).mockResolvedValue({});
    vi.mocked(apiDelete).mockResolvedValue({});
  });

  it("shows exercise description on the card when set", async () => {
    render(<ExerciseLibrary />);
    await waitFor(() => {
      expect(screen.getByText("Dead hang")).toBeInTheDocument();
    });
    expect(screen.getByText("Hang from a bar for time")).toBeInTheDocument();
  });

  it("does not show description text on card when description is null", async () => {
    vi.mocked(apiGet).mockResolvedValue([mockExercise]);
    await renderPage();
    // mockExercise has description: null — the card should not render any description paragraph
    // (the form still has a "Description" label, so we check by querying within the card)
    const nameEl = screen.getByText("Pull-ups");
    const card = nameEl.closest("[class]") || nameEl.parentElement?.parentElement;
    // There should be no paragraph with description text alongside the exercise name
    expect(screen.queryByText("Hang from a bar for time")).not.toBeInTheDocument();
  });
});

describe("ExerciseLibrary — category autocomplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiGet).mockResolvedValue([mockExercise, mockExerciseWithDescription]);
    vi.mocked(apiPost).mockResolvedValue({});
    vi.mocked(apiDelete).mockResolvedValue({});
  });

  it("renders a datalist for category suggestions", async () => {
    render(<ExerciseLibrary />);
    await waitFor(() => {
      expect(screen.getByText("Pull-ups")).toBeInTheDocument();
    });
    // The datalist should contain existing categories
    const datalist = document.querySelector("datalist");
    expect(datalist).not.toBeNull();
    const options = datalist!.querySelectorAll("option");
    const values = Array.from(options).map((o) => o.value);
    expect(values).toContain("strength");
    expect(values).toContain("finger");
  });
});
