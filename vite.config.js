import { randomUUID } from "node:crypto"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(({ command }) => {
  const buildTimestamp = new Date().toISOString()
  const releaseId = command === "build"
    ? `${buildTimestamp.replace(/[-:.]/g, "").replace("Z", "Z")}-${randomUUID().slice(0, 8)}`
    : "dev"

  return {
    define: {
      __BUILD_DATE__: JSON.stringify(buildTimestamp.slice(0, 10)),
      __RELEASE_ID__: JSON.stringify(releaseId),
    },
    plugins: [
      react(),
      {
        name: "lift-release-metadata",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "version.json",
            source: `${JSON.stringify({ releaseId }, null, 2)}\n`,
          })
        },
      },
    ],
    base: "/"
  }
})
