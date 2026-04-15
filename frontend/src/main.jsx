import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ScanProgress from "./pages/ScanProgress";
import Report from "./pages/Report";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scan/:id" element={<ScanProgress />} />
        <Route path="/report/:id" element={<Report />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
