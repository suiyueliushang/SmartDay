import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // 多页构建：主应用（index.html）+ 桌面壁纸日历窗口（wallpaper.html）
      input: {
        main: path.resolve(__dirname, "index.html"),
        wallpaper: path.resolve(__dirname, "wallpaper.html"),
      },
    },
  },
  // 允许通过局域网/桌面端访问
  preview: { port: 4173 },
});
