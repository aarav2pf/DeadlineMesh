
import { pool } from "../db/pool";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { calculateCriticalPath } from "../services/criticalPath";
import { Router, type Response } from "express";
import { simulateTaskDelay } from "../services/whatIfSimulation";
import { analyzeScheduleRisk } from "../services/scheduleRisk";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const userId = (req as AuthRequest).userId;

    const result = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.description,
         p.deadline,
         p.created_at,
         p.updated_at,
         COUNT(t.id)::int AS task_count,
         COUNT(t.id) FILTER (WHERE t.status = 'Completed')::int
           AS completed_count
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
       WHERE p.user_id = $1
       GROUP BY p.id
       ORDER BY p.updated_at DESC`,
      [userId]
    );

    res.json({ projects: result.rows });
  } catch (error) {
    console.error("Fetch projects failed:", error);
    res.status(500).json({ message: "Could not fetch projects." });
  }
});

router.post("/", async (req, res) => {
  try {
    const userId = (req as AuthRequest).userId;
    const { name, description = "", deadline = null } = req.body;

    if (typeof name !== "string" || !name.trim() || name.trim().length > 150) {
      return res.status(400).json({
        message: "Project name is required and must be under 150 characters.",
      });
    }

    if (typeof description !== "string" || description.length > 5000) {
      return res.status(400).json({
        message: "Description must be under 5000 characters.",
      });
    }

    if (
      deadline !== null &&
      (typeof deadline !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(deadline) ||
        Number.isNaN(Date.parse(`${deadline}T00:00:00Z`)) ||
        new Date(`${deadline}T00:00:00Z`).toISOString().slice(0, 10) !== deadline)
    ) {
      return res.status(400).json({
        message: "Deadline must be a valid date in YYYY-MM-DD format.",
      });
    }

    const result = await pool.query(
      `INSERT INTO projects (user_id, name, description, deadline)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, deadline, created_at, updated_at`,
      [userId, name.trim(), description.trim(), deadline]
    );

    return res.status(201).json({ project: result.rows[0] });
  } catch (error) {
    console.error("Create project failed:", error);
    return res.status(500).json({ message: "Could not create project." });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const userId = (req as AuthRequest).userId;
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ message: "Invalid project ID." });
    }

    const { name, description, deadline } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) {
      if (
        typeof name !== "string" ||
        !name.trim() ||
        name.trim().length > 150
      ) {
        return res.status(400).json({ message: "Invalid project name." });
      }
      values.push(name.trim());
      updates.push(`name = $${values.length}`);
    }

    if (description !== undefined) {
      if (typeof description !== "string" || description.length > 5000) {
        return res.status(400).json({ message: "Invalid description." });
      }
      values.push(description.trim());
      updates.push(`description = $${values.length}`);
    }

    if (deadline !== undefined) {
      if (deadline !== null && (
        typeof deadline !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(deadline) ||
        Number.isNaN(Date.parse(`${deadline}T00:00:00Z`)) ||
        new Date(`${deadline}T00:00:00Z`).toISOString().slice(0, 10) !== deadline
      )) {
        return res.status(400).json({ message: "Invalid deadline." });
      }
      values.push(deadline);
      updates.push(`deadline = $${values.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No valid fields to update." });
    }

    updates.push("updated_at = NOW()");
    values.push(id, userId);

    const result = await pool.query(
      `UPDATE projects
       SET ${updates.join(", ")}
       WHERE id = $${values.length - 1} AND user_id = $${values.length}
       RETURNING id, name, description, deadline, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Project not found." });
    }

    return res.json({ project: result.rows[0] });
  } catch (error) {
    console.error("Update project failed:", error);
    return res.status(500).json({ message: "Could not update project." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const userId = (req as AuthRequest).userId;
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ message: "Invalid project ID." });
    }

    const result = await pool.query(
      `DELETE FROM projects
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Project not found." });
    }

    return res.json({ message: "Project deleted successfully." });
  } catch (error) {
    console.error("Delete project failed:", error);
    res.status(500).json({ message: "Could not delete project." });
  }
});

// GET /api/projects/:projectId/critical-path
router.get(
  "/:projectId/critical-path",
  async (req: AuthRequest, res: Response) => {
    try {
      const projectId = String(req.params.projectId);

      if (!/^\d+$/.test(projectId) || Number(projectId) <= 0) {
        return res.status(400).json({ message: "Invalid project ID." });
      }

      if (!req.userId) {
        return res.status(401).json({ message: "Authentication required." });
      }

      const projectResult = await pool.query(
        "SELECT id FROM projects WHERE id = $1 AND user_id = $2",
        [projectId, req.userId]
      );

      if (projectResult.rowCount === 0) {
        return res.status(404).json({ message: "Project not found." });
      }

      const result = await pool.query(
        `SELECT
           t.id,
           t.name,
           t.duration,
           t.status,
           COALESCE(
             ARRAY_AGG(td.depends_on_task_id)
               FILTER (WHERE td.depends_on_task_id IS NOT NULL),
             ARRAY[]::BIGINT[]
           ) AS dependencies
         FROM tasks t
         LEFT JOIN task_dependencies td ON td.task_id = t.id
         WHERE t.project_id = $1
         GROUP BY t.id
         ORDER BY t.id`,
        [projectId]
      );

      const tasks = result.rows.map((task) => ({
        id: Number(task.id),
        name: task.name as string,
        duration: Number(task.duration),
        status: task.status as "Pending" | "In Progress" | "Completed",
        dependencies: (task.dependencies as (number | string)[]).map(Number),
      }));

      const analysis = calculateCriticalPath(tasks);

      return res.status(200).json({ analysis });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("circular dependencies") ||
          error.message.includes("Invalid task data") ||
          error.message.includes("invalid dependency") ||
          error.message.includes("cannot depend on itself"))
      ) {
        return res.status(400).json({ message: error.message });
      }

      console.error("Critical path analysis failed:", error);
      return res.status(500).json({
        message: "Could not calculate the critical path.",
      });
    }
  }
);


router.post(
  "/:projectId/what-if/delay",
  async (req: AuthRequest, res: Response) => {
    try {
      const projectId = String(req.params.projectId);

      if (!/^\d+$/.test(projectId) || Number(projectId) <= 0) {
        return res.status(400).json({ message: "Invalid project ID." });
      }

      if (!req.userId) {
        return res.status(401).json({ message: "Authentication required." });
      }

      const projectResult = await pool.query(
        "SELECT id FROM projects WHERE id = $1 AND user_id = $2",
        [projectId, req.userId]
      );

      if (projectResult.rowCount === 0) {
        return res.status(404).json({ message: "Project not found." });
      }

      const { task_id, added_duration } = req.body ?? {};

      if (
        !Number.isInteger(Number(task_id)) ||
        Number(task_id) <= 0 ||
        !Number.isInteger(Number(added_duration)) ||
        Number(added_duration) < 1 ||
        Number(added_duration) > 365
      ) {
        return res.status(400).json({
          message:
            "Provide a valid task_id and an added_duration between 1 and 365 days.",
        });
      }

      const taskResult = await pool.query(
        `SELECT
           t.id,
           t.name,
           t.duration,
           t.status,
           COALESCE(
             ARRAY_AGG(td.depends_on_task_id)
               FILTER (WHERE td.depends_on_task_id IS NOT NULL),
             ARRAY[]::BIGINT[]
           ) AS dependencies
         FROM tasks t
         LEFT JOIN task_dependencies td ON td.task_id = t.id
         WHERE t.project_id = $1
         GROUP BY t.id
         ORDER BY t.id`,
        [projectId]
      );

      const tasks = taskResult.rows.map((task) => ({
        id: Number(task.id),
        name: task.name as string,
        duration: Number(task.duration),
        status: task.status as "Pending" | "In Progress" | "Completed",
        dependencies: (task.dependencies as (number | string)[]).map(Number),
      }));

      const result = simulateTaskDelay(
        tasks,
        Number(task_id),
        Number(added_duration)
      );

      return res.status(200).json({ simulation: result });
    } catch (error) {
      if (
        error instanceof Error &&
        (
          error.message.includes("valid task ID") ||
          error.message.includes("Added duration") ||
          error.message.includes("does not exist") ||
          error.message.includes("circular dependencies") ||
          error.message.includes("Invalid task data") ||
          error.message.includes("invalid dependency") ||
          error.message.includes("cannot depend on itself")
        )
      ) {
        return res.status(400).json({ message: error.message });
      }

      console.error("What-if simulation failed:", error);
      return res.status(500).json({
        message: "Could not simulate the task delay.",
      });
    }
  }
);


router.get(
  "/:projectId/schedule-risk",
  async (req: AuthRequest, res: Response) => {
    try {
      const projectId = String(req.params.projectId);

      if (!/^\d+$/.test(projectId) || Number(projectId) <= 0) {
        return res.status(400).json({ message: "Invalid project ID." });
      }

      if (!req.userId) {
        return res.status(401).json({ message: "Authentication required." });
      }

      const projectResult = await pool.query(
        "SELECT id FROM projects WHERE id = $1 AND user_id = $2",
        [projectId, req.userId]
      );

      if (projectResult.rowCount === 0) {
        return res.status(404).json({ message: "Project not found." });
      }

      const result = await pool.query(
        `SELECT
           t.id,
           t.name,
           t.duration,
           t.status,
           COALESCE(
             ARRAY_AGG(td.depends_on_task_id)
               FILTER (WHERE td.depends_on_task_id IS NOT NULL),
             ARRAY[]::BIGINT[]
           ) AS dependencies
         FROM tasks t
         LEFT JOIN task_dependencies td ON td.task_id = t.id
         WHERE t.project_id = $1
         GROUP BY t.id
         ORDER BY t.id`,
        [projectId]
      );

      const tasks = result.rows.map((task) => ({
        id: Number(task.id),
        name: task.name as string,
        duration: Number(task.duration),
        status: task.status as "Pending" | "In Progress" | "Completed",
        dependencies: (
          task.dependencies as (number | string)[]
        ).map(Number),
      }));

      const analysis = analyzeScheduleRisk(tasks);

      return res.status(200).json({ analysis });
    } catch (error) {
      if (
        error instanceof Error &&
        (
          error.message.includes("circular dependencies") ||
          error.message.includes("Invalid task data") ||
          error.message.includes("invalid dependency") ||
          error.message.includes("cannot depend on itself")
        )
      ) {
        return res.status(400).json({ message: error.message });
      }

      console.error("Schedule risk analysis failed:", error);
      return res.status(500).json({
        message: "Could not analyse schedule risk.",
      });
    }
  }
);


export default router;
