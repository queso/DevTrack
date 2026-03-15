import react from "@vitejs/plugin-react"
import { resolve } from "path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    css: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      "reactive-swr": resolve(__dirname, "node_modules/reactive-swr/src/index.ts"),
    },
  },
})
