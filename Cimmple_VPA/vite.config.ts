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
        name: "Cimmple Vendor Portal",
        short_name: "Vendor Portal",
        description: "Vendor quotation responses for Cimmple shops",
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
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 5175,
    host: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:5172", changeOrigin: true },
    },
  },
  preview: {
    port: 5175,
    host: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:5172", changeOrigin: true },
    },
  },
});
