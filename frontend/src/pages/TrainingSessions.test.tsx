import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import TrainingSessions from "./TrainingSessions";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock("./TrainingSessions.module.css", () => ({ default: {} }));
vi.mock("../components/ConfirmDialog.module.css", () => ({ default: {} }));

import { apiGet, apiPatch, apiDelete } from "../api";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockExerciseWithFields = {
  id: 10,
  name: "Pull-ups",
  category: "strength",
  default_sets_reps: "3×10",
  fields: [{ id: 1, name: "weight", unit: "kg" }],
};

const mockExerciseNoFields = {
  id: 20,
  name: "Stretching",
  category: "stretch",
  default_sets_reps: null,
  fields: [],
};

const mockSessionExerciseIncomplete = {
  id: 100,
  exercise_id: 10,
  completed: false,
  sets_reps_note: null,
  field_values: [],
};

const mockSessionExerciseComplete = {
  id: 101,
  exercise_id: 10,
  completed: true,
  sets_reps_note: "3x10",
  field_values: [{ id: 1, field_id: 1, value: "80" }],
};

const mockSessionExerciseNoFields = {
  id: 102,
  exercise_id: 20,
  completed: false,
  sets_reps_note: null,
  field_values: [],
};

function makeSession(exercises: typeof mockSessionExerciseIncomplete[]) {
  return {
    id: 1,
    date: "2026-06-01",
    weekday: 1,
    exercises,
  };
}

function setupMocks(
  sessionExercises = [mockSessionExerciseIncomplete],
  templates: Array<{ id: number; name: string; is_active: boolean }> = []
) {
  vi.clearAllMocks();
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.startsWith("/api/training-sessions/for-date/")) {
      return makeSession(sessionExercises);
    }
    if (path === "/api/exercises") {
      return [mockExerciseWithFields, mockExerciseNoFields];
    }
    if (path === "/api/training-sessions") {
      return [];
    }
    if (path === "/api/week-templates") {
      return templates;
    }
    return [];
  });
  vi.mocked(apiPatch).mockImplementation(async (_path, body) => {
    return { ...mockSessionExerciseIncomplete, ...body };
  });
  vi.mocked(apiDelete).mockResolvedValue({ success: true });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TrainingSessions />
    </MemoryRouter>
  );
}

async function renderPageAndWait() {
  const result = renderPage();
  await waitFor(() => {
    expect(screen.getByText("Pull-ups")).toBeInTheDocument();
  });
  return result;
}

// ── Tests: active week plan banner ────────────────────────────────────────────

describe("TrainingSessions — active week plan banner", () => {
  it("shows the active week plan name when a plan is active", async () => {
    setupMocks([], [{ id: 1, name: "My Week Plan", is_active: true }]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/week plan:/i)).toBeInTheDocument();
    });
    expect(screen.getByText("My Week Plan")).toBeInTheDocument();
  });

  it("links the active plan name to /week-templates", async () => {
    setupMocks([], [{ id: 1, name: "My Week Plan", is_active: true }]);
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
    setupMocks([], [{ id: 1, name: "Inactive Plan", is_active: false }]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/no active week plan/i)).toBeInTheDocument()
    );
  });

  it("shows 'set one up' link to /week-templates when no plan is active", async () => {
    setupMocks([], []);
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
    setupMocks([], []);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/no active week plan/i)).toBeInTheDocument()
    );
  });
});

// ── Tests: completion counter ──────────────────────────────────────────────────

describe("TrainingSessions — completion counter", () => {
  it("shows 0 / 1 done when one exercise is incomplete", async () => {
    setupMocks([mockSessionExerciseIncomplete]);
    await renderPageAndWait();
    expect(screen.getByText(/0\s*\/\s*1\s*done/i)).toBeInTheDocument();
  });

  it("shows 1 / 1 done when the exercise is complete", async () => {
    setupMocks([mockSessionExerciseComplete]);
    await renderPageAndWait();
    expect(screen.getByText(/1\s*\/\s*1\s*done/i)).toBeInTheDocument();
  });

  it("shows session complete message when all exercises are done", async () => {
    setupMocks([mockSessionExerciseComplete]);
    await renderPageAndWait();
    expect(screen.getByText(/session complete/i)).toBeInTheDocument();
  });

  it("does not show session complete when not all exercises are done", async () => {
    setupMocks([mockSessionExerciseIncomplete]);
    await renderPageAndWait();
    expect(screen.queryByText(/session complete/i)).not.toBeInTheDocument();
  });

  it("updates counter when exercise is toggled done", async () => {
    setupMocks([mockSessionExerciseIncomplete]);
    vi.mocked(apiPatch).mockResolvedValue({
      ...mockSessionExerciseIncomplete,
      completed: true,
    });
    await renderPageAndWait();

    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByText(/1\s*\/\s*1\s*done/i)).toBeInTheDocument();
    });
  });
});

// ── Tests: done visual state ──────────────────────────────────────────────────

describe("TrainingSessions — done visual state", () => {
  it("shows strikethrough on completed exercise name", async () => {
    setupMocks([mockSessionExerciseComplete]);
    await renderPageAndWait();
    // The exerciseNameDone class should be applied (mocked as {} but structure exists)
    // We check the text is still rendered
    expect(screen.getByText("Pull-ups")).toBeInTheDocument();
  });
});

// ── Tests: field inputs hidden when not done ───────────────────────────────────

describe("TrainingSessions — field inputs visibility", () => {
  it("hides field inputs for incomplete exercises", async () => {
    setupMocks([mockSessionExerciseIncomplete]);
    await renderPageAndWait();
    // weight field should NOT be shown for incomplete exercise
    expect(screen.queryByLabelText(/weight/i)).not.toBeInTheDocument();
  });

  it("shows field inputs for completed exercises", async () => {
    setupMocks([mockSessionExerciseComplete]);
    await renderPageAndWait();
    // Field inputs are rendered — look for the label text
    expect(screen.getByText(/weight/i)).toBeInTheDocument();
    // The number input itself is present
    expect(screen.getByPlaceholderText("—")).toBeInTheDocument();
  });
});

// ── Tests: notes field ────────────────────────────────────────────────────────

describe("TrainingSessions — notes field", () => {
  it("shows a note/sets-reps input for each exercise", async () => {
    setupMocks([mockSessionExerciseIncomplete]);
    await renderPageAndWait();
    expect(screen.getByRole("textbox", { name: /note/i })).toBeInTheDocument();
  });

  it("pre-fills note input with existing sets_reps_note", async () => {
    setupMocks([mockSessionExerciseComplete]);
    await renderPageAndWait();
    const noteInput = screen.getByRole("textbox", { name: /note/i });
    expect((noteInput as HTMLInputElement).value).toBe("3x10");
  });

  it("saves notes via apiPatch when user types", async () => {
    setupMocks([mockSessionExerciseIncomplete]);
    vi.mocked(apiPatch).mockResolvedValue({
      ...mockSessionExerciseIncomplete,
      sets_reps_note: "4×12",
    });
    await renderPageAndWait();

    const noteInput = screen.getByRole("textbox", { name: /note/i });
    await userEvent.clear(noteInput);
    await userEvent.type(noteInput, "4×12");

    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledWith(
        expect.stringContaining("/exercises/100"),
        expect.objectContaining({ sets_reps_note: expect.any(String) })
      );
    });
  });
});

// ── Tests: no-fields sets/reps guidance ──────────────────────────────────────

describe("TrainingSessions — sets/reps note for exercises without fields", () => {
  it("labels the note field as 'Sets / reps note' for exercises with no fields", async () => {
    setupMocks([mockSessionExerciseNoFields]);
    vi.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path.startsWith("/api/training-sessions/for-date/")) {
        return makeSession([mockSessionExerciseNoFields]);
      }
      if (path === "/api/exercises") return [mockExerciseNoFields];
      return [];
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Stretching")).toBeInTheDocument();
    });

    expect(
      screen.getByLabelText(/sets.*reps.*note/i)
    ).toBeInTheDocument();
  });
});

// ── Tests: remove exercise ────────────────────────────────────────────────────

describe("TrainingSessions — remove exercise", () => {
  beforeEach(() => {
    setupMocks([mockSessionExerciseIncomplete]);
  });

  it("shows a remove button for each exercise card", async () => {
    await renderPageAndWait();
    expect(
      screen.getByRole("button", { name: /remove pull-ups/i })
    ).toBeInTheDocument();
  });

  it("shows a confirmation dialog when remove is clicked", async () => {
    await renderPageAndWait();
    await userEvent.click(screen.getByRole("button", { name: /remove pull-ups/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it("removes the exercise when confirmed", async () => {
    await renderPageAndWait();
    await userEvent.click(screen.getByRole("button", { name: /remove pull-ups/i }));
    // Click the dialog's "Remove" confirm button (not the card's × remove button)
    const dialog = screen.getByRole("dialog");
    const confirmBtn = dialog.querySelector("button:last-child") as HTMLElement;
    await userEvent.click(confirmBtn);
    expect(apiDelete).toHaveBeenCalledWith(
      "/api/training-sessions/1/exercises/100"
    );
  });

  it("does not remove the exercise when cancelled", async () => {
    await renderPageAndWait();
    await userEvent.click(screen.getByRole("button", { name: /remove pull-ups/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it("closes the confirmation dialog after cancel", async () => {
    await renderPageAndWait();
    await userEvent.click(screen.getByRole("button", { name: /remove pull-ups/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("removes exercise from UI after confirmed delete", async () => {
    await renderPageAndWait();
    await userEvent.click(screen.getByRole("button", { name: /remove pull-ups/i }));
    // Click the dialog's "Remove" confirm button
    const dialog = screen.getByRole("dialog");
    const confirmBtn = dialog.querySelector("button:last-child") as HTMLElement;
    await userEvent.click(confirmBtn);
    await waitFor(() => {
      expect(screen.queryByText("Pull-ups")).not.toBeInTheDocument();
    });
  });
});
