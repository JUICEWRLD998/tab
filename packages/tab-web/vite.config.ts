import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** Social cards need an absolute image URL. SITE_URL overrides the default when the app is hosted elsewhere. */
const SITE_URL = (process.env.SITE_URL ?? "https://juicewrld998.github.io/tab").replace(/\/$/, "");
const siteUrl = (): Plugin => ({ name: "site-url", transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", SITE_URL) });

export default defineConfig({
  base: "./", // relative asset paths: the app works under any sub-path (GitHub Pages serves it at /tab/)
  plugins: [react(), siteUrl()],
  build: { target: "es2022", sourcemap: false },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
