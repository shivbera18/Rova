import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@chalo/protocol": fileURLToPath(
        new URL("../../packages/protocol/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      "/v1": "http://127.0.0.1:8080",
      "/ws/rider": { target: "ws://127.0.0.1:8080", ws: true },
    },
  },
});
