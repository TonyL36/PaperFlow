import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./ui/App";
import { AuthProvider } from "./ui/auth/AuthContext";
import "./ui/styles/global.css";

const rawBaseUrl = import.meta.env.BASE_URL;
const routerBasename = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter basename={routerBasename || "/"}>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
