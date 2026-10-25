import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// A dev szerver az /api kéréseket a backendre proxyzza (http://localhost:3001),
// így a frontend egyszerűen fetch("/api/...")-t hívhat CORS gond nélkül.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
