import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import Layout from "./components/Layout";
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
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings/grades" element={<GradesSettings />} />
        <Route path="/exercises" element={<ExerciseLibrary />} />
        <Route path="/climbing" element={<ClimbingSessions />} />
        <Route path="/climbing/progress" element={<ClimbingProgress />} />
        <Route path="/week-templates" element={<WeekTemplates />} />
        <Route path="/training" element={<TrainingSessions />} />
        <Route path="/training/progress" element={<ExerciseProgress />} />
      </Route>
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
