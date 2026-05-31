import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import GradesSettings from "./pages/GradesSettings";
import ExerciseLibrary from "./pages/ExerciseLibrary";
import ClimbingSessions from "./pages/ClimbingSessions";
import ClimbingProgress from "./pages/ClimbingProgress";
import WeekTemplates from "./pages/WeekTemplates";
import TrainingSessions from "./pages/TrainingSessions";
import ExerciseProgress from "./pages/ExerciseProgress";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { userId, loading } = useAuth();
  if (loading) return null;
  return userId ? children : <Navigate to="/login" replace />;
}

function RedirectIfAuthed({ children }: { children: JSX.Element }) {
  const { userId, loading } = useAuth();
  if (loading) return null;
  return userId ? <Navigate to="/" replace /> : children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <Login />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/settings/grades"
        element={
          <RequireAuth>
            <GradesSettings />
          </RequireAuth>
        }
      />
      <Route
        path="/exercises"
        element={
          <RequireAuth>
            <ExerciseLibrary />
          </RequireAuth>
        }
      />
      <Route
        path="/climbing"
        element={
          <RequireAuth>
            <ClimbingSessions />
          </RequireAuth>
        }
      />
      <Route
        path="/climbing/progress"
        element={
          <RequireAuth>
            <ClimbingProgress />
          </RequireAuth>
        }
      />
      <Route
        path="/week-templates"
        element={
          <RequireAuth>
            <WeekTemplates />
          </RequireAuth>
        }
      />
      <Route
        path="/training"
        element={
          <RequireAuth>
            <TrainingSessions />
          </RequireAuth>
        }
      />
      <Route
        path="/training/progress"
        element={
          <RequireAuth>
            <ExerciseProgress />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
