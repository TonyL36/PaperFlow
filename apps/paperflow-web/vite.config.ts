import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  base: "/paperflow/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
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
