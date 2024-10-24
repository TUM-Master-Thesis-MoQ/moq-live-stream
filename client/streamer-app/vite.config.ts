import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [react()],
  base: "/streamer/",
  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, "../../utilities/key.crt")),
      cert: fs.readFileSync(path.resolve(__dirname, "../../utilities/cert.crt")),
    },
  },
  resolve: {
    alias: {
      moqjs: path.resolve(__dirname, "../lib/moqjs/"),
    },
  },
});
