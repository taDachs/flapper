import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import styles from "./Dashboard.module.css";

export default function Dashboard() {
  const { logout } = useAuth();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Climbing Tracker</h1>
        <nav className={styles.nav}>
          <Link className={styles.navLink} to="/climbing">
            Climbing
          </Link>
          <Link className={styles.navLink} to="/climbing/progress">
            Progress
          </Link>
          <Link className={styles.navLink} to="/exercises">
            Exercises
          </Link>
          <Link className={styles.navLink} to="/week-templates">
            Templates
          </Link>
          <Link className={styles.navLink} to="/settings/grades">
            Grades
          </Link>
        </nav>
        <button className={styles.logoutBtn} onClick={logout}>
          Sign out
        </button>
      </header>
      <main className={styles.main}>
        <p className={styles.placeholder}>Dashboard coming soon.</p>
      </main>
    </div>
  );
}
