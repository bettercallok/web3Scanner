import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home";
import ScanProgress from "./pages/ScanProgress";
import Report from "./pages/Report";
import Diff from "./pages/Diff";
import "./index.css";

import { AuthProvider } from "./context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Watchlist from "./pages/Watchlist";
import Compare from "./pages/Compare";
import PublicReport from "./pages/PublicReport";
import Settings from "./pages/Settings";
import ProtectedRoute from "./components/ProtectedRoute";

function NotFound() {
  return (
    <div className="error-state" style={{ paddingTop: 120 }}>
      <div className="error-icon">404</div>
      <div className="error-msg">// this page does not exist</div>
      <Link to="/" className="btn btn-primary" style={{ marginTop: 24 }}>← Back to scanner</Link>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/scan/:id" element={<ProtectedRoute><ScanProgress /></ProtectedRoute>} />
          <Route path="/report/:id" element={<ProtectedRoute><Report /></ProtectedRoute>} />
          <Route path="/r/:slug" element={<PublicReport />} />
          <Route path="/diff" element={<ProtectedRoute><Diff /></ProtectedRoute>} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/watchlist" element={<ProtectedRoute><Watchlist /></ProtectedRoute>} />
          <Route path="/compare" element={<ProtectedRoute><Compare /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
