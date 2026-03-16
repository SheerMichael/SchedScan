import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import Sidebar from "./components/sidebar/sidebar";
import LoginScreen from "./screens/LoginScreen";
import DashboardScreen from "./screens/DashboardScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import UsersScreen from "./screens/UsersScreen";
import CalendarScreen from "./screens/CalendarScreen";
import ExtractionHealthScreen from "./screens/ExtractionHealthScreen";
import ParentLinksScreen from "./screens/ParentLinksScreen";
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
    <Router basename="/portal">
      {/* Global toast container — renders toasts from any component in the tree */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: 0,
            border: '2px solid #0f172a',
            fontFamily: 'inherit',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            boxShadow: '4px 4px 0px 0px rgba(15,23,42,0.15)',
          },
          success: {
            style: { borderColor: '#166534', color: '#166534', background: '#f0fdf4' },
            iconTheme: { primary: '#166534', secondary: '#f0fdf4' },
          },
          error: {
            style: { borderColor: '#b91c1c', color: '#b91c1c', background: '#fef2f2' },
            iconTheme: { primary: '#b91c1c', secondary: '#fef2f2' },
            duration: 6000,
          },
        }}
      />
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
            <Route path="/parent-links" element={<ProtectedRoute><ParentLinksScreen /></ProtectedRoute>} />
            <Route path="/extraction-health" element={<ProtectedRoute><ExtractionHealthScreen /></ProtectedRoute>} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}