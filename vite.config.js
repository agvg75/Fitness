import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [react()],
  base: "/"
})
