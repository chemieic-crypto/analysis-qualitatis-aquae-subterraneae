import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createApp } from "./server/app.ts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction =
    process.env.NODE_ENV === "production" || process.argv.includes("--production");

  if (isProduction) {
    const distDir = path.resolve(__dirname, "dist");
    const indexPath = path.join(distDir, "index.html");

    if (!fs.existsSync(indexPath)) {
      console.warn(
        `Production static bundle not found at ${indexPath}. Run "npm run build" before "npm start".`
      );
    }

    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      if (!fs.existsSync(indexPath)) {
        res
          .status(503)
          .send("Production build not found. Run 'npm run build' before starting the server.");
        return;
      }
      res.sendFile(indexPath);
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Hydrogeology server running in ${isProduction ? "production" : "development"} mode at http://0.0.0.0:${PORT}`
    );
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
