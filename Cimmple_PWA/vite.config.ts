import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo.svg", "icons/*.png"],
      manifest: {
        name: "Cimmple Shop Floor",
        short_name: "Shop Floor",
        description: "Shop floor job tracking for machine-shop technicians",
        theme_color: "#1e293b",
        background_color: "#f4f6f9",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
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
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
      },
    }),
  ],
  server: {
    port: 5174,
    host: true,
    proxy: {
      "/api": { target: "http://0.0.0.0:5172", changeOrigin: true },
    },
  },
});
