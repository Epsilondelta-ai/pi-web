import react from "@astrojs/react";
import { defineConfig } from "astro/config";

import packageJson from "./package.json";

export default defineConfig({
  integrations: [react()],
  vite: {
    define: {
      __PI_WEB_VERSION__: JSON.stringify(packageJson.version),
    },
  },
  build: {
    assets: "assets",
  },
});
