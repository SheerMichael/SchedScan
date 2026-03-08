import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Sidebar from "./components/sidebar/sidebar";
import LoginScreen from "./screens/LoginScreen";
import DashboardScreen from "./screens/DashboardScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import UsersScreen from "./screens/UsersScreen";
import CalendarScreen from "./screens/CalendarScreen";
import { useAuth } from "./context/AuthContext";

/** Redirects to /login when the user is not authenticated. */
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null; // Avoid flash of redirect before localStorage check
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { isAuthenticated, isLoading, logout } = useAuth();

  // Prevent rendering routes until we know if the user is authenticated
  if (isLoading) return null;

  return (
    <Router>
      <div className="flex h-screen bg-slate-50">
        {isAuthenticated && <Sidebar onLogout={logout} />}

        <main className="flex-1 overflow-auto">
          <Routes>
            <Route
              path="/login"
              element={!isAuthenticated ? <LoginScreen /> : <Navigate to="/" replace />}
            />

            <Route path="/" element={<ProtectedRoute><DashboardScreen /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><AnalyticsScreen /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute><CalendarScreen /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute><UsersScreen /></ProtectedRoute>} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}