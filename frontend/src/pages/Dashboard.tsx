import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import styles from "./Dashboard.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface ActivePlan {
  id: number;
  name: string;
}

interface TodaySession {
  id: number;
  date: string;
  completed_count: number;
  total_count: number;
}

interface RecentClimbing {
  id: number;
  date: string;
  top_grade_name: string | null;
  top_grade_difficulty: number | null;
}

interface DashboardData {
  active_plan: ActivePlan | null;
  today_session: TodaySession | null;
  recent_climbing: RecentClimbing | null;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    apiGet("/api/dashboard")
      .then((d) => setData(d as DashboardData))
      .catch(() => setLoadError("Failed to load dashboard."));
  }, []);

  if (loadError) {
    return (
      <div className={styles.content}>
        <p className={styles.error}>{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.content}>
        <p className={styles.loading}>Loading…</p>
      </div>
    );
  }

  const isEmpty = !data.active_plan && !data.today_session && !data.recent_climbing;

  return (
    <div className={styles.content}>
      <h1 className={styles.heading}>Dashboard</h1>

      {isEmpty && (
        <section
          className={styles.emptyState}
          aria-label="empty state"
          data-testid="empty-state"
        >
          <p className={styles.emptyHeading}>Welcome! Let's get you set up.</p>
          <ul className={styles.emptyActions}>
            <li>
              <Link to="/settings/grades" className={styles.ctaLink}>
                Set up grades
              </Link>
              <span className={styles.emptyHint}> — define your gym's difficulty levels</span>
            </li>
            <li>
              <Link to="/exercises" className={styles.ctaLink}>
                Create exercises
              </Link>
              <span className={styles.emptyHint}> — build your exercise library</span>
            </li>
            <li>
              <Link to="/week-templates" className={styles.ctaLink}>
                Create a week plan
              </Link>
              <span className={styles.emptyHint}> — plan which days you train</span>
            </li>
          </ul>
        </section>
      )}

      <div className={styles.widgets}>
        {/* Active week plan */}
        <section className={styles.widget} aria-label="active week plan">
          <h2 className={styles.widgetTitle}>Week Plan</h2>
          {data.active_plan ? (
            <p className={styles.widgetValue}>
              <Link to="/week-templates" className={styles.widgetLink}>
                {data.active_plan.name}
              </Link>
            </p>
          ) : (
            <p className={styles.widgetEmpty}>
              No active plan —{" "}
              <Link to="/week-templates" className={styles.ctaLink}>
                set one up
              </Link>
            </p>
          )}
        </section>

        {/* Today's training */}
        <section className={styles.widget} aria-label="today's training">
          <h2 className={styles.widgetTitle}>Today's Training</h2>
          {data.today_session ? (
            <p className={styles.widgetValue}>
              <Link to="/training" className={styles.widgetLink}>
                {data.today_session.completed_count}/{data.today_session.total_count} exercises done
              </Link>
            </p>
          ) : (
            <p className={styles.widgetEmpty}>
              No session yet —{" "}
              <Link to="/training" className={styles.ctaLink}>
                open training
              </Link>
            </p>
          )}
        </section>

        {/* Recent climbing */}
        <section className={styles.widget} aria-label="recent climbing">
          <h2 className={styles.widgetTitle}>Recent Climbing</h2>
          {data.recent_climbing ? (
            <p className={styles.widgetValue}>
              <Link to="/climbing" className={styles.widgetLink}>
                {data.recent_climbing.date}
                {data.recent_climbing.top_grade_name
                  ? ` — top grade: ${data.recent_climbing.top_grade_name}`
                  : ""}
              </Link>
            </p>
          ) : (
            <p className={styles.widgetEmpty}>
              No climbing logged yet —{" "}
              <Link to="/climbing" className={styles.ctaLink}>
                log a session
              </Link>
            </p>
          )}
        </section>

        {/* Quick links */}
        <section className={styles.widget} aria-label="quick links">
          <h2 className={styles.widgetTitle}>Quick Links</h2>
          <ul className={styles.quickLinks}>
            <li>
              <Link to="/training" className={styles.quickLink}>
                Training
              </Link>
            </li>
            <li>
              <Link to="/climbing" className={styles.quickLink}>
                Climbing
              </Link>
            </li>
            <li>
              <Link to="/settings/grades" className={styles.quickLink}>
                Settings
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
