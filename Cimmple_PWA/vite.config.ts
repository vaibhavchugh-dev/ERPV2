import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = "/shop/";

export default defineConfig({
  // Production is served at https://erp.cimmple.net/shop/
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Inline registration so a missing /registerSW.js is not served as HTML.
      injectRegister: "inline",
      includeAssets: ["logo.svg", "icons/*.png"],
      manifest: {
        name: "Cimmple Shop Floor",
        short_name: "Shop Floor",
        description: "Shop floor job tracking for machine-shop technicians",
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
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
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
    port: 5174,
    host: true,
    open: base,
    proxy: {
      "/api": { target: "http://127.0.0.1:5172", changeOrigin: true },
    },
  },
  preview: {
    port: 5174,
    host: true,
    open: base,
    proxy: {
      "/api": { target: "http://127.0.0.1:5172", changeOrigin: true },
    },
  },
});
