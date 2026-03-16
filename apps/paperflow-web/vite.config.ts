import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/paperflow/",
  plugins: [react()],
  server: {
    port: 9628,
    strictPort: true,
    open: "/paperflow/",
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE ?? "http://localhost:3151",
        changeOrigin: true
      }
    }
  }
});
