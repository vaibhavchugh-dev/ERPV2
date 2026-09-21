import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = "/vendor/";

export default defineConfig({
  // Production is served at https://erp.cimmple.net/vendor/
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Do not inject a register script: an old SW is still serving cached HTML.
      // Replace /vendor/sw.js with a self-destroying worker so stuck clients recover.
      injectRegister: false,
      selfDestroying: true,
      includeAssets: ["logo.svg", "icons/*.png"],
      manifest: {
        name: "Cimmple Vendor Portal",
        short_name: "Vendor Portal",
        description: "Vendor quotation responses for Cimmple shops",
        theme_color: "#1e293b",
        background_color: "#f4f6f9",
        display: "standalone",
        orientation: "portrait",
        start_url: base,
        scope: base,
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webmanifest}"],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/^\/api\//, /\/[^/?]+\.[^/]+$/],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5175,
    host: true,
    open: base,
    proxy: {
      "/api": { target: "http://127.0.0.1:5172", changeOrigin: true },
    },
  },
  preview: {
    port: 5175,
    host: true,
    open: base,
    proxy: {
      "/api": { target: "http://127.0.0.1:5172", changeOrigin: true },
    },
  },
});
