
import { Router, Response } from "express";
import { pool } from "../db/pool";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

type TaskStatus = "Pending" | "In Progress" | "Completed";
type TaskPriority = "Low" | "Medium" | "High";

const validStatuses: TaskStatus[] = [
  "Pending",
  "In Progress",
  "Completed",
];

const validPriorities: TaskPriority[] = ["Low", "Medium", "High"];

function isValidId(value: unknown): boolean {
  return (
    (typeof value === "string" || typeof value === "number") &&
    /^\d+$/.test(String(value)) &&
    Number(value) > 0
  );
}

function isValidDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function isValidText(value: unknown, maxLength: number): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

function isValidBody(body: unknown): body is Record<string, unknown> {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body)
  );
}

function parseDependencies(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;

  if (!value.every(isValidId)) return null;

  const ids = value.map(Number);

  if (new Set(ids).size !== ids.length) return null;

  return ids;
}

async function userOwnsProject(
  projectId: string | number,
  userId: number | string,
  db: { query: typeof pool.query } = pool
): Promise<boolean> {
  const result = await db.query(
    "SELECT id FROM projects WHERE id = $1 AND user_id = $2",
    [projectId, userId]
  );

  return (result.rowCount ?? 0) > 0;
}

async function userOwnsTask(
  taskId: string | number,
  userId: number | string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT t.id
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE t.id = $1 AND p.user_id = $2`,
    [taskId, userId]
  );

  return (result.rowCount ?? 0) > 0;
}

async function getTaskDependencies(
  taskId: number | string,
  db: { query: typeof pool.query } = pool
): Promise<number[]> {
  const result = await db.query(
    `SELECT depends_on_task_id
     FROM task_dependencies
     WHERE task_id = $1
     ORDER BY depends_on_task_id`,
    [taskId]
  );

  return result.rows.map((row) => Number(row.depends_on_task_id));
}

/**
 * Validate prerequisites for a task.
 * A task cannot depend on itself or on a task from another project.
 * Returns a message when validation fails, otherwise null.
 */
async function validateDependencies(
  taskId: number,
  projectId: number,
  dependencies: number[],
  db: { query: typeof pool.query }
): Promise<string | null> {
  if (dependencies.includes(taskId)) {
    return "A task cannot depend on itself.";
  }

  if (dependencies.length === 0) return null;

  const result = await db.query(
    `SELECT id
     FROM tasks
     WHERE project_id = $1
       AND id = ANY($2::bigint[])`,
    [projectId, dependencies]
  );

  if (result.rows.length !== dependencies.length) {
    return "Every prerequisite must be an existing task in the same project.";
  }

  // Existing graph edges: task -> its prerequisites.
  const edges = await db.query(
    `SELECT td.task_id, td.depends_on_task_id
     FROM task_dependencies td
     JOIN tasks t ON t.id = td.task_id
     WHERE t.project_id = $1`,
    [projectId]
  );

  const graph = new Map<number, number[]>();

  for (const edge of edges.rows) {
    const from = Number(edge.task_id);
    const to = Number(edge.depends_on_task_id);

    if (!graph.has(from)) graph.set(from, []);
    graph.get(from)!.push(to);
  }

  // Replace this task's outgoing edges with the proposed prerequisites.
  graph.set(taskId, dependencies);

  // DFS from each prerequisite. Reaching taskId would create a cycle.
  const visited = new Set<number>();

  function reachesTask(current: number): boolean {
    if (current === taskId) return true;
    if (visited.has(current)) return false;

    visited.add(current);

    for (const prerequisite of graph.get(current) ?? []) {
      if (reachesTask(prerequisite)) return true;
    }

    return false;
  }

  for (const dependencyId of dependencies) {
    visited.clear();

    if (reachesTask(dependencyId)) {
      return "This dependency would create a cycle. Choose different prerequisites.";
    }
  }

  return null;
}

// GET /api/tasks/project/:projectId
router.get("/project/:projectId", async (req: AuthRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);

    if (!isValidId(projectId)) {
      return res.status(400).json({ message: "Invalid project ID." });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    if (!(await userOwnsProject(projectId, req.userId))) {
      return res.status(404).json({ message: "Project not found." });
    }

    const result = await pool.query(
      `SELECT
         t.id,
         t.project_id,
         t.name,
         t.description,
         t.duration,
         t.start_date,
         t.status,
         t.priority,
         t.created_at,
         t.updated_at,
         COALESCE(
           ARRAY_AGG(td.depends_on_task_id)
             FILTER (WHERE td.depends_on_task_id IS NOT NULL),
           ARRAY[]::BIGINT[]
         ) AS dependencies
       FROM tasks t
       LEFT JOIN task_dependencies td ON td.task_id = t.id
       WHERE t.project_id = $1
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
      [projectId]
    );

    const normalizedTasks: {
  id: number;
  project_id: number;
  duration: number;
  status: TaskStatus;
  dependencies: number[];
  [key: string]: unknown;
}[] = result.rows.map((task) => ({
  ...task,
  id: Number(task.id),
  project_id: Number(task.project_id),
  duration: Number(task.duration),
  dependencies: (task.dependencies as (number | string)[]).map(Number),
}));

const statusById = new Map(
  normalizedTasks.map((task) => [task.id, task.status])
);

const tasks = normalizedTasks.map((task) => {
  const blockedBy =
    task.status === "Completed"
      ? []
      : task.dependencies.filter(
          (dependencyId) => statusById.get(dependencyId) !== "Completed"
        );

  return {
    ...task,
    is_blocked: blockedBy.length > 0,
    blocked_by: blockedBy,
  };
});

    return res.status(200).json({ tasks });
  } catch (error) {
    console.error("Fetch tasks failed:", error);
    return res.status(500).json({ message: "Could not fetch tasks." });
  }
});

// POST /api/tasks/project/:projectId
router.post(
  "/project/:projectId",
  async (req: AuthRequest, res: Response) => {
    let client;

    try {
      const projectId = String(req.params.projectId);

      if (!isValidId(projectId)) {
        return res.status(400).json({ message: "Invalid project ID." });
      }

      if (!req.userId) {
        return res.status(401).json({ message: "Authentication required." });
      }

      if (!isValidBody(req.body)) {
        return res.status(400).json({
          message: "A JSON request body is required.",
        });
      }

      const {
        name,
        description = "",
        duration,
        start_date,
        status = "Pending",
        priority = "Medium",
      } = req.body;

      const dependencies =
        req.body.dependencies === undefined
          ? []
          : parseDependencies(req.body.dependencies);

      if (dependencies === null) {
        return res.status(400).json({
          message: "Dependencies must be an array of unique task IDs.",
        });
      }

      if (!isValidText(name, 200)) {
        return res.status(400).json({
          message: "Task name is required and must be at most 200 characters.",
        });
      }

      if (typeof description !== "string" || description.length > 5000) {
        return res.status(400).json({
          message: "Description must be a string of at most 5000 characters.",
        });
      }

      const taskName = (name as string).trim();
      const taskDescription = description.trim();

      if (
        !Number.isInteger(Number(duration)) ||
        Number(duration) < 1 ||
        Number(duration) > 365
      ) {
        return res.status(400).json({
          message: "Duration must be a whole number between 1 and 365 days.",
        });
      }

      if (!isValidDate(start_date)) {
        return res.status(400).json({
          message: "Start date must be a valid date in YYYY-MM-DD format.",
        });
      }

      if (!validStatuses.includes(status as TaskStatus)) {
        return res.status(400).json({ message: "Invalid task status." });
      }

      if (!validPriorities.includes(priority as TaskPriority)) {
        return res.status(400).json({ message: "Invalid task priority." });
      }

      if (!(await userOwnsProject(projectId, req.userId))) {
        return res.status(404).json({ message: "Project not found." });
      }

      client = await pool.connect();
      await client.query("BEGIN");

      // Lock the project row to serialize dependency modifications
      // within this project.
      await client.query(
        "SELECT id FROM projects WHERE id = $1 FOR UPDATE",
        [projectId]
      );

      const result = await client.query(
        `INSERT INTO tasks
           (project_id, name, description, duration, start_date, status, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING
           id, project_id, name, description, duration,
           start_date, status, priority, created_at, updated_at`,
        [
        projectId,
        taskName,
        taskDescription,
        Number(duration),
        start_date,
        status,
        priority,
        ]
      );

      const createdTask = result.rows[0];
      const newTaskId = Number(createdTask.id);

      const dependencyError = await validateDependencies(
        newTaskId,
        Number(projectId),
        dependencies,
        client
      );

      if (dependencyError) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: dependencyError });
      }

      for (const dependencyId of dependencies) {
        await client.query(
          `INSERT INTO task_dependencies (task_id, depends_on_task_id)
           VALUES ($1, $2)`,
          [newTaskId, dependencyId]
        );
      }

      await client.query(
        "UPDATE projects SET updated_at = NOW() WHERE id = $1",
        [projectId]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        task: {
          ...createdTask,
          id: newTaskId,
          project_id: Number(createdTask.project_id),
          duration: Number(createdTask.duration),
          dependencies,
        },
      });
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Task creation rollback failed:", rollbackError);
        }
      }

      console.error("Create task failed:", error);
      return res.status(500).json({ message: "Could not create task." });
    } finally {
      client?.release();
    }
  }
);

// PATCH /api/tasks/:taskId
router.patch("/:taskId", async (req: AuthRequest, res: Response) => {
  let client;

  try {
    const taskId = String(req.params.taskId);

    if (!isValidId(taskId)) {
      return res.status(400).json({ message: "Invalid task ID." });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    if (!isValidBody(req.body)) {
      return res.status(400).json({
        message: "A JSON request body is required.",
      });
    }

    const ownsTask = await userOwnsTask(taskId, req.userId);

    if (!ownsTask) {
      return res.status(404).json({ message: "Task not found." });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const currentResult = await client.query(
      `SELECT t.*
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = $1 AND p.user_id = $2
       FOR UPDATE OF t`,
      [taskId, req.userId]
    );

    if (currentResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Task not found." });
    }

    const current = currentResult.rows[0];
    const projectId = Number(current.project_id);

    // Lock the project to serialize graph changes.
    await client.query(
      "SELECT id FROM projects WHERE id = $1 FOR UPDATE",
      [projectId]
    );

    const name = req.body.name ?? current.name;
    const description = req.body.description ?? current.description ?? "";
    const duration = req.body.duration ?? current.duration;
    const startDate = req.body.start_date ?? (
      current.start_date instanceof Date
        ? current.start_date.toISOString().slice(0, 10)
        : String(current.start_date).slice(0, 10)
    );
    const status = req.body.status ?? current.status;
    const priority = req.body.priority ?? current.priority;

    if (!isValidText(name, 200)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Invalid task name." });
    }

    if (typeof description !== "string" || description.length > 5000) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Invalid task description." });
    }

    if (
      !Number.isInteger(Number(duration)) ||
      Number(duration) < 1 ||
      Number(duration) > 365
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Duration must be a whole number between 1 and 365 days.",
      });
    }

    if (!isValidDate(startDate)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Start date must be a valid date in YYYY-MM-DD format.",
      });
    }

    if (!validStatuses.includes(status as TaskStatus)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Invalid task status." });
    }

    if (!validPriorities.includes(priority as TaskPriority)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Invalid task priority." });
    }

    let dependencies: number[];

    if (req.body.dependencies === undefined) {
      dependencies = await getTaskDependencies(taskId, client);
    } else {
      const parsed = parseDependencies(req.body.dependencies);

      if (parsed === null) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Dependencies must be an array of unique task IDs.",
        });
      }

      dependencies = parsed;
    }

    const dependencyError = await validateDependencies(
      Number(taskId),
      projectId,
      dependencies,
      client
    );

    if (dependencyError) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: dependencyError });
    }

    // A task may only be completed after all of its prerequisites are completed.
    // Use the proposed dependency list so this also covers requests that update
    // status and dependencies together. Keep this check inside the transaction.
    if (status === "Completed" && dependencies.length > 0) {
      const incompleteDependencies = await client.query(
        `SELECT name
         FROM tasks
         WHERE id = ANY($1::bigint[])
           AND status <> 'Completed'`,
        [dependencies]
      );

      if (incompleteDependencies.rows.length > 0) {
        await client.query("ROLLBACK");

        const names = incompleteDependencies.rows
          .map((task) => String(task.name))
          .join(", ");

        return res.status(400).json({
          message: `Cannot complete this task until these prerequisites are completed: ${names}.`,
        });
      }
    }

    const result = await client.query(
      `UPDATE tasks
       SET name = $1,
           description = $2,
           duration = $3,
           start_date = $4,
           status = $5,
           priority = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING
         id, project_id, name, description, duration,
         start_date, status, priority, created_at, updated_at`,
      [
        name.trim(),
        description.trim(),
        Number(duration),
        startDate,
        status,
        priority,
        taskId,
      ]
    );

    // Only replace dependencies when the request explicitly includes them.
    if (req.body.dependencies !== undefined) {
      await client.query(
        "DELETE FROM task_dependencies WHERE task_id = $1",
        [taskId]
      );

      for (const dependencyId of dependencies) {
        await client.query(
          `INSERT INTO task_dependencies (task_id, depends_on_task_id)
           VALUES ($1, $2)`,
          [taskId, dependencyId]
        );
      }
    }

    await client.query(
      "UPDATE projects SET updated_at = NOW() WHERE id = $1",
      [projectId]
    );

    await client.query("COMMIT");

    const updatedTask = result.rows[0];

    return res.status(200).json({
      task: {
        ...updatedTask,
        id: Number(updatedTask.id),
        project_id: Number(updatedTask.project_id),
        duration: Number(updatedTask.duration),
        dependencies,
      },
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Task update rollback failed:", rollbackError);
      }
    }

    console.error("Update task failed:", error);
    return res.status(500).json({ message: "Could not update task." });
  } finally {
    client?.release();
  }
});

// DELETE /api/tasks/:taskId
router.delete("/:taskId", async (req: AuthRequest, res: Response) => {
  let client;

  try {
    const taskId = String(req.params.taskId);

    if (!isValidId(taskId)) {
      return res.status(400).json({ message: "Invalid task ID." });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const taskResult = await client.query(
      `SELECT t.project_id
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = $1 AND p.user_id = $2
       FOR UPDATE OF t`,
      [taskId, req.userId]
    );

    if (taskResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Task not found." });
    }

    const projectId = Number(taskResult.rows[0].project_id);

    await client.query(
      "SELECT id FROM projects WHERE id = $1 FOR UPDATE",
      [projectId]
    );

    // The foreign keys cascade dependency records involving this task.
    await client.query("DELETE FROM tasks WHERE id = $1", [taskId]);

    await client.query(
      "UPDATE projects SET updated_at = NOW() WHERE id = $1",
      [projectId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Task deleted successfully.",
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Task deletion rollback failed:", rollbackError);
      }
    }

    console.error("Delete task failed:", error);
    return res.status(500).json({ message: "Could not delete task." });
  } finally {
    client?.release();
  }
});

export default router;
