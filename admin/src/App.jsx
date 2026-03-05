import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";

import Sidebar from "./components/sidebar/sidebar";
import LoginScreen from "./screens/LoginScreen";
import DashboardScreen from "./screens/DashboardScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import UsersScreen from "./screens/UsersScreen";
import CalendarScreen from "./screens/CalendarScreen";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleLogin = () => setIsAuthenticated(true);
  const handleLogout = () => setIsAuthenticated(false);

  return (
    <Router>
      <div className="flex h-screen bg-slate-50">
        {isAuthenticated && <Sidebar onLogout={handleLogout} />}
        
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route 
              path="/login" 
              element={!isAuthenticated ? <LoginScreen onLogin={handleLogin} /> : <Navigate to="/" />} 
            />
            
            <Route 
              path="/" 
              element={isAuthenticated ? <DashboardScreen /> : <Navigate to="/login" />} 
            />
            
            <Route 
              path="/analytics" 
              element={isAuthenticated ? <AnalyticsScreen /> : <Navigate to="/login" />} 
            />
            
            <Route 
              path="/calendar" 
              element={isAuthenticated ? <CalendarScreen /> : <Navigate to="/login" />} 
            />
            
            <Route 
              path="/users" 
              element={isAuthenticated ? <UsersScreen /> : <Navigate to="/login" />} 
            />

            {/* 4. Catch-all: Send unknown links to Login */}
            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}