import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [react()],
  base: "/streamer/",
  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, "../../utilities/localhost-key.pem")),
      cert: fs.readFileSync(path.resolve(__dirname, "../../utilities/localhost.pem")),
    },
  },
  resolve: {
    alias: {
      moqjs: path.resolve(__dirname, "../lib/moqjs/"),
    },
  },
});
