import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./ui/App";
import { AuthProvider } from "./ui/auth/AuthContext";
import "./ui/styles/global.css";

const rawBaseUrl = import.meta.env.BASE_URL;
const routerBasename = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
const normalizedBasename = routerBasename && routerBasename !== "/" ? routerBasename : "";
const currentPath = window.location.pathname;
const pathWithSlash = `${normalizedBasename}/`;
if (normalizedBasename && currentPath !== normalizedBasename && !currentPath.startsWith(pathWithSlash)) {
  const nextPath = currentPath === "/" ? pathWithSlash : `${normalizedBasename}${currentPath}`;
  window.location.replace(`${nextPath}${window.location.search}${window.location.hash}`);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter basename={routerBasename || "/"}>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
