import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [react()],
  base: "/streamer/", // remove it for production
  server: {
    host: "10.0.1.1",
    https: {
      key: fs.readFileSync(path.resolve(__dirname, "../../utilities/key.pem")),
      cert: fs.readFileSync(path.resolve(__dirname, "../../utilities/cert.pem")),
    },
  },
  resolve: {
    alias: {
      moqjs: path.resolve(__dirname, "../lib/moqjs/"),
    },
  },
});
