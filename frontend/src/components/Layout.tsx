import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../AuthContext";
import { useTheme, Theme } from "../ThemeContext";
import styles from "./Layout.module.css";

const THEME_LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  auto: "Auto",
};

const THEME_ICONS: Record<Theme, string> = {
  light: "☀️",
  dark: "🌙",
  auto: "🖥️",
};

const NAV_LINKS = [
  { to: "/training", label: "Training" },
  { to: "/climbing", label: "Climbing" },
  { to: "/climbing/progress", label: "Climbing Progress" },
  { to: "/training/progress", label: "Exercise Progress" },
  { to: "/exercises", label: "Exercises" },
  { to: "/week-templates", label: "Week Plans" },
  { to: "/settings/grades", label: "Settings" },
];

const ROUTE_TITLES: { pattern: RegExp; title: string }[] = [
  { pattern: /^\/training\/progress/, title: "Exercise Progress" },
  { pattern: /^\/training/, title: "Training" },
  { pattern: /^\/climbing\/progress/, title: "Climbing Progress" },
  { pattern: /^\/climbing/, title: "Climbing" },
  { pattern: /^\/exercises/, title: "Exercises" },
  { pattern: /^\/week-templates/, title: "Week Plans" },
  { pattern: /^\/settings/, title: "Settings" },
  { pattern: /^\/$/, title: "Dashboard" },
];

function usePageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const match = ROUTE_TITLES.find(({ pattern }) => pattern.test(pathname));
    const section = match ? match.title : "Climbing Tracker";
    document.title = `${section} — Climbing Tracker`;
  }, [pathname]);
}

export default function Layout() {
  const { logout } = useAuth();
  const { theme, cycleTheme } = useTheme();
  usePageTitle();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          Climbing Tracker
        </Link>
        <nav className={styles.nav}>
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive
                  ? `${styles.navLink} ${styles.activeNavLink}`
                  : styles.navLink
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          className={styles.themeToggleBtn}
          onClick={cycleTheme}
          title={`Theme: ${THEME_LABELS[theme]} — click to cycle`}
          aria-label={`Current theme: ${THEME_LABELS[theme]}. Click to cycle theme.`}
        >
          {THEME_ICONS[theme]} {THEME_LABELS[theme]}
        </button>
        <button className={styles.logoutBtn} onClick={logout}>
          Sign out
        </button>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
