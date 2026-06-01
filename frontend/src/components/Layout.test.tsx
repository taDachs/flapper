import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import Layout from "./Layout";

// Mock AuthContext so Layout can call useAuth()
vi.mock("../AuthContext", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

// Mock ThemeContext so Layout can call useTheme()
vi.mock("../ThemeContext", () => ({
  useTheme: () => ({ theme: "auto", cycleTheme: vi.fn() }),
}));

// CSS modules return empty objects in jsdom
vi.mock("./Layout.module.css", () => ({ default: {} }));

function renderLayout(initialPath: string = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<div>page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("Layout nav bar", () => {
  it("renders a nav bar with all expected links", () => {
    renderLayout("/");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Training" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Climbing" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exercises" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Week Plans" })).toBeInTheDocument();
  });

  it("labels the settings link 'Settings' (not 'Grades')", () => {
    renderLayout("/settings/grades");
    expect(screen.queryByRole("link", { name: /grades/i })).toBeNull();
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
  });

  it("renders child page content via Outlet", () => {
    renderLayout("/");
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("renders the logo as a link to /", () => {
    renderLayout("/training");
    const logoLink = screen.getByRole("link", { name: /climbing tracker/i });
    expect(logoLink).toHaveAttribute("href", "/");
  });

  it("renders a sign out button", () => {
    renderLayout("/");
    expect(
      screen.getByRole("button", { name: /sign out/i })
    ).toBeInTheDocument();
  });
});

describe("Layout document title", () => {
  it("sets document title to 'Dashboard — Climbing Tracker' on /", () => {
    renderLayout("/");
    expect(document.title).toBe("Dashboard — Climbing Tracker");
  });

  it("sets document title to 'Training — Climbing Tracker' on /training", () => {
    renderLayout("/training");
    expect(document.title).toBe("Training — Climbing Tracker");
  });

  it("sets document title to 'Settings — Climbing Tracker' on /settings/grades", () => {
    renderLayout("/settings/grades");
    expect(document.title).toBe("Settings — Climbing Tracker");
  });

  it("sets document title to 'Climbing — Climbing Tracker' on /climbing", () => {
    renderLayout("/climbing");
    expect(document.title).toBe("Climbing — Climbing Tracker");
  });
});
