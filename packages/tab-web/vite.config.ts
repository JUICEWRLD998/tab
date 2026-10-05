import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: { target: "es2022", sourcemap: false },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
