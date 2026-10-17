import { resolve } from "node:path"
import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(({ mode }) => ({
  root: resolve(process.cwd(), "desktop"),
  envDir: process.cwd(),
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(loadEnv(mode, process.cwd(), "").VITE_SUPABASE_URL),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(loadEnv(mode, process.cwd(), "").VITE_SUPABASE_ANON_KEY),
    "import.meta.env.VITE_CLOUDFLARE_CDN_URL": JSON.stringify(loadEnv(mode, process.cwd(), "").VITE_CLOUDFLARE_CDN_URL),
  },
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(process.cwd(), "release/electron/renderer"),
    emptyOutDir: true,
  },
}))
