import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/FGO_Battle_Simulator_Work/",
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
