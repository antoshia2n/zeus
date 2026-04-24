import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react({
      include: [/\.jsx?$/, /node_modules\/shia2n-core\/.*/],
    }),
  ],
  optimizeDeps: {
    include: ["shia2n-core"],
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
