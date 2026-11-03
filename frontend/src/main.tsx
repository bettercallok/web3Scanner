import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import "./index.css";

import { AuthProvider } from "./context/AuthContext";
import AppShell from "./components/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import ScanProgress from "./pages/ScanProgress";
import Report from "./pages/Report";
import Diff from "./pages/Diff";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Watchlist from "./pages/Watchlist";
import Compare from "./pages/Compare";
import PublicReport from "./pages/PublicReport";
import Settings from "./pages/Settings";

function NotFound() {
  return (
    <div className="error-state">
      <div className="error-icon">404</div>
      <div className="error-msg">This page doesn't exist.</div>
      <Link to="/" className="btn btn-primary" style={{ marginTop: 20 }}>Back to scanner</Link>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Signed-out / public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/r/:slug" element={<PublicReport />} />

          {/* Signed-in app: everything renders inside the sidebar shell */}
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route path="/" element={<Home />} />
            <Route path="/scan/:id" element={<ScanProgress />} />
            <Route path="/report/:id" element={<Report />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/diff" element={<Diff />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
