import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { SERVER_CONFIG } from "./config.js";
import { catalogRouter } from "./routes/catalogRoutes.js";
import { streamRouter } from "./routes/streamRoutes.js";
import { AppError } from "../shared/errors.js";

export const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "HEAD", "OPTIONS"],
    allowedHeaders: ["Range", "If-Range", "Content-Type", "Accept"],
    exposedHeaders: ["Content-Range", "Content-Length", "Accept-Ranges"],
  })
);

app.use(express.json());

// Health Check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "animoriv2-api",
    timestamp: Date.now(),
    port: SERVER_CONFIG.port,
  });
});

// Mount API Routes
app.use("/api/catalog", catalogRouter);
app.use("/api/anime", catalogRouter);
app.use("/api/streams", streamRouter);

// Production static file serving & SPA fallback
const clientDistPath = path.resolve(process.cwd(), "dist/client");
if (process.env.NODE_ENV === "production" && fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get("*", (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

// Centralized Error Handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      ok: false,
      code: err.code,
      error: err.message,
    });
    return;
  }

  const message = err instanceof Error ? err.message : "Internal Server Error";
  res.status(500).json({
    ok: false,
    code: "INTERNAL_ERROR",
    error: message,
  });
});

// Only start listening if executed directly (e.g., via tsx)
if (process.env.NODE_ENV !== "test") {
  app.listen(SERVER_CONFIG.port, () => {
    console.log(`[animoriv2] Server running on http://localhost:${SERVER_CONFIG.port}`);
  });
}
