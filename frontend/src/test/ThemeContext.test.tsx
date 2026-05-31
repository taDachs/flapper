import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme, Theme } from "../ThemeContext";

// Helper component to expose theme state to tests
function ThemeDisplay() {
  const { theme, cycleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={cycleTheme}>Cycle</button>
      <button onClick={() => setTheme("light")}>Set Light</button>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
      <button onClick={() => setTheme("auto")}>Set Auto</button>
    </div>
  );
}

function renderWithTheme() {
  return render(
    <ThemeProvider>
      <ThemeDisplay />
    </ThemeProvider>
  );
}

describe("ThemeContext", () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(
      (key) => localStorageMock[key] ?? null
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      (key, value) => { localStorageMock[key] = value; }
    );
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(
      (key) => { delete localStorageMock[key]; }
    );
    // Reset data-theme attribute
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to auto theme when nothing is stored", () => {
    renderWithTheme();
    expect(screen.getByTestId("theme").textContent).toBe("auto");
  });

  it("reads persisted theme from localStorage on mount", () => {
    localStorageMock["climbing-tracker-theme"] = "light";
    renderWithTheme();
    expect(screen.getByTestId("theme").textContent).toBe("light");
  });

  it("sets data-theme attribute to 'light' when theme is light", async () => {
    renderWithTheme();
    await act(async () => {
      await userEvent.click(screen.getByText("Set Light"));
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("sets data-theme attribute to 'dark' when theme is dark", async () => {
    renderWithTheme();
    await act(async () => {
      await userEvent.click(screen.getByText("Set Dark"));
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("removes data-theme attribute when theme is auto", async () => {
    // Start with dark, then switch to auto
    localStorageMock["climbing-tracker-theme"] = "dark";
    renderWithTheme();
    await act(async () => {
      await userEvent.click(screen.getByText("Set Auto"));
    });
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("persists theme to localStorage on change", async () => {
    renderWithTheme();
    await act(async () => {
      await userEvent.click(screen.getByText("Set Light"));
    });
    expect(localStorageMock["climbing-tracker-theme"]).toBe("light");
  });

  it("cycles through light → dark → auto → light", async () => {
    localStorageMock["climbing-tracker-theme"] = "light";
    renderWithTheme();

    const themeEl = screen.getByTestId("theme");
    expect(themeEl.textContent).toBe("light");

    await act(async () => {
      await userEvent.click(screen.getByText("Cycle"));
    });
    expect(themeEl.textContent).toBe("dark");

    await act(async () => {
      await userEvent.click(screen.getByText("Cycle"));
    });
    expect(themeEl.textContent).toBe("auto");

    await act(async () => {
      await userEvent.click(screen.getByText("Cycle"));
    });
    expect(themeEl.textContent).toBe("light");
  });

  it("ignores invalid values in localStorage and falls back to auto", () => {
    localStorageMock["climbing-tracker-theme"] = "invalid-theme";
    renderWithTheme();
    expect(screen.getByTestId("theme").textContent).toBe("auto");
  });
});
