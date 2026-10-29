import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db/pool";
import authRoutes from "./routes/auth";
import projectRoutes from "./routes/projects";
import taskRoutes from "./routes/tasks";

dotenv.config();

const app = express();

// Render runs behind one reverse proxy; trust that hop so IP-based rate limits
// use the originating client IP rather than the proxy address.
app.set("trust proxy", 1);

const allowedOrigins = [
  "http://localhost:5173",
  process.env.CLIENT_URL,
].filter((origin): origin is string => Boolean(origin));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked origin: ${origin}`));
      }
    },
  })
);

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "DeadlineMesh API is running",
  });
});

app.get("/api/health/db", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS database_time");

    res.status(200).json({
      status: "ok",
      message: "PostgreSQL connection successful",
      databaseTime: result.rows[0].database_time,
    });
  } catch (error) {
    console.error(
      "Database health check failed:",
      error instanceof Error ? error.message : error
    );

    res.status(500).json({
      status: "error",
      message: "Could not connect to PostgreSQL",
    });
  }
});

export default app;
