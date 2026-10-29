
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { ReactFlow, Background, Controls, MiniMap, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { apiRequest } from "../lib/api";
import type { Project } from "../types/project";
import type {
  Task,
  CriticalPathAnalysis,
  WhatIfSimulationResult,
} from "../types/task";

type ToolName = "graph" | "timeline" | "critical-path" | "simulations";

interface RiskTask {
  id: number;
  name: string;
  risk_level: "High" | "Medium" | "Low";
  risk_reasons: string[];
  blocked_by: number[];
  slack: number;
  is_critical: boolean;
}

interface ScheduleRiskAnalysis {
  project_duration: number;
  summary: {
    high_risk: number;
    medium_risk: number;
    low_risk: number;
    blocked_tasks: number;
    critical_tasks: number;
  };
  tasks: RiskTask[];
}

const toolTitles: Record<ToolName, string> = {
  graph: "TASK GRAPH",
  timeline: "PROJECT TIMELINE",
  "critical-path": "CRITICAL PATH",
  simulations: "WHAT-IF SIMULATIONS",
};

export default function WorkspaceTool() {
  const { tool } = useParams<{ tool: string }>();
  const navigate = useNavigate();

  const validTool = (
    ["graph", "timeline", "critical-path", "simulations"] as string[]
  ).includes(tool ?? "");

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [criticalPath, setCriticalPath] =
    useState<CriticalPathAnalysis | null>(null);
  const [risk, setRisk] = useState<ScheduleRiskAnalysis | null>(null);
  const [simulation, setSimulation] =
    useState<WhatIfSimulationResult | null>(null);

  const [taskId, setTaskId] = useState("");
  const [delay, setDelay] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedGraphTaskId, setSelectedGraphTaskId] = useState<number | null>(null);

  const selectedTool = validTool ? (tool as ToolName) : null;

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        const response = await apiRequest<{ projects: Project[] }>("/projects");

        if (cancelled) return;

        setProjects(response.projects);

        const savedId = response.projects[0]
          ? String(response.projects[0].id)
          : "";

        setProjectId((current) =>
          current && response.projects.some((p) => String(p.id) === current)
            ? current
            : savedId,
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load projects.",
          );
        }
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadToolData() {
      if (!projectId || !selectedTool) {
        setTasks([]);
        setCriticalPath(null);
        setRisk(null);
        return;
      }

      setLoading(true);
      setError("");
      setCriticalPath(null);
      setRisk(null);
      setSimulation(null);

      try {
        const taskResponse = await apiRequest<{ tasks: Task[] }>(
          `/tasks/project/${projectId}`,
        );

        if (cancelled) return;
        setTasks(taskResponse.tasks);

        if (
          selectedTool === "critical-path" ||
          selectedTool === "timeline" ||
          selectedTool === "graph"
        ) {
          const response = await apiRequest<{
            analysis: CriticalPathAnalysis;
          }>(`/projects/${projectId}/critical-path`);

          if (cancelled) return;
          setCriticalPath(response.analysis);
        }

        if (selectedTool === "timeline" || selectedTool === "graph") {
          const response = await apiRequest<{
            analysis: ScheduleRiskAnalysis;
          }>(`/projects/${projectId}/schedule-risk`);

          if (cancelled) return;
          setRisk(response.analysis);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load workspace data.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadToolData();

    return () => {
      cancelled = true;
    };
  }, [projectId, selectedTool]);

  const criticalIds = useMemo(
    () => new Set(criticalPath?.critical_path ?? []),
    [criticalPath],
  );

  const riskByTask = useMemo(
    () => new Map((risk?.tasks ?? []).map((item) => [item.id, item])),
    [risk],
  );

  const graphLayout = useMemo(() => {
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const depthById = new Map<number, number>();

    function getDepth(taskId: number, visiting = new Set<number>()): number {
      const cached = depthById.get(taskId);
      if (cached !== undefined) return cached;
      if (visiting.has(taskId)) return 0;

      const task = taskById.get(taskId);
      if (!task || !task.dependencies?.length) {
        depthById.set(taskId, 0);
        return 0;
      }

      visiting.add(taskId);
      const depth = 1 + Math.max(
        ...task.dependencies.map((dependencyId) =>
          getDepth(dependencyId, new Set(visiting)),
        ),
      );
      depthById.set(taskId, depth);
      return depth;
    }

    tasks.forEach((task) => getDepth(task.id));

    const rowsByDepth = new Map<number, number>();
    const nodes: Node[] = tasks.map((task) => {
      const depth = depthById.get(task.id) ?? 0;
      const row = rowsByDepth.get(depth) ?? 0;
      rowsByDepth.set(depth, row + 1);

      const taskRisk = riskByTask.get(task.id)?.risk_level ?? "Unknown";
      const isCritical = criticalIds.has(task.id);
      const isBlocked = task.status !== "Completed" && (task.dependencies ?? []).some(
        (dependencyId) => taskById.get(dependencyId)?.status !== "Completed",
      );
      const background = task.status === "Completed"
        ? "#d8f0df"
        : isBlocked
          ? "#ffe4c7"
          : isCritical
            ? "#f8d7da"
            : "#e1ebfa";
      const border = isCritical ? "#c33d46" : isBlocked ? "#bd6b18" : "#6886a8";

      return {
        id: String(task.id),
        position: { x: depth * 280, y: row * 125 },
        data: {
          label: `#${task.id} — ${task.name}\n${task.status} · ${task.duration} day(s) · ${taskRisk} risk`,
        },
        style: {
          width: 220,
          minHeight: 76,
          whiteSpace: "pre-line",
          lineHeight: 1.5,
          fontSize: 12,
          border: `2px solid ${border}`,
          borderRadius: 4,
          background,
          color: "#202020",
          padding: 10,
          fontFamily: "inherit",
        },
      };
    });

    const edges: Edge[] = tasks.flatMap((task) =>
      (task.dependencies ?? []).map((dependencyId) => ({
        id: `${dependencyId}-${task.id}`,
        source: String(dependencyId),
        target: String(task.id),
        animated: criticalIds.has(dependencyId) && criticalIds.has(task.id),
        style: {
          stroke: criticalIds.has(dependencyId) && criticalIds.has(task.id)
            ? "#c33d46"
            : "#777",
          strokeWidth: criticalIds.has(dependencyId) && criticalIds.has(task.id) ? 2.5 : 1.5,
        },
        label: "requires",
        labelStyle: { fontSize: 10, fill: "#555" },
      })),
    );

    return { nodes, edges };
  }, [tasks, riskByTask, criticalIds]);

  const selectedGraphTask = tasks.find((task) => task.id === selectedGraphTaskId) ?? null;

  async function runSimulation() {
    if (!projectId || !taskId) {
      setError("Select a task to simulate.");
      return;
    }

    const addedDuration = Number(delay);

    if (!Number.isInteger(addedDuration) || addedDuration < 1 || addedDuration > 365) {
      setError("Delay must be between 1 and 365 days.");
      return;
    }

    setLoading(true);
    setError("");
    setSimulation(null);

    try {
      const response = await apiRequest<{
        simulation: WhatIfSimulationResult;
      }>(`/projects/${projectId}/what-if/delay`, {
        method: "POST",
        body: JSON.stringify({
          task_id: Number(taskId),
          added_duration: addedDuration,
        }),
      });

      setSimulation(response.simulation);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Simulation failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (!selectedTool) {
    return (
      <main className="task-page" id="main-content" tabIndex={-1}>
        <section className="task-page-content">
          <h1>Unknown workspace tool</h1>
          <button onClick={() => navigate("/dashboard")}>
            Back to Projects
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="task-page" id="main-content" tabIndex={-1}>
      <header className="task-page-titlebar">
        <span>DEADLINEMESH.EXE — {toolTitles[selectedTool]}</span>
        <button
          className="task-window-close"
          onClick={() => navigate("/dashboard")}
        >
          ×
        </button>
      </header>

      <div className="task-page-content">
        <button
          className="task-back-button"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft size={16} /> Back to Projects
        </button>

        <section className="task-project-heading">
          <div>
            <p className="task-eyebrow">WORKSPACE ANALYSIS</p>
            <h1>{toolTitles[selectedTool]}</h1>
            <p>Select a project to inspect its schedule and dependencies.</p>
          </div>

          <label>
            Project
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              {projects.length === 0 && <option value="">No projects</option>}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  #{project.id} — {project.name}
                </option>
              ))}
            </select>
          </label>

          {projectId && (
            <button
              className="task-secondary-button"
              onClick={() => {
                setProjectId("");
                setTimeout(() => setProjectId(projectId), 0);
              }}
              type="button"
            >
              <RefreshCw size={15} /> Refresh
            </button>
          )}
        </section>

        {error && <div className="task-error">{error}</div>}
        {loading && <p>Loading workspace data...</p>}

        {!loading && projectId && tasks.length === 0 && !error && (
          <section className="task-list-panel">
            <h2>No tasks yet</h2>
            <p>Create tasks in this project before analysing its schedule.</p>
            <button
              className="task-primary-button"
              onClick={() => navigate(`/projects/${projectId}`)}
            >
              Open Project Tasks
            </button>
          </section>
        )}

        {selectedTool === "graph" && tasks.length > 0 && (
          <section className="task-list-panel">
            <div className="task-list-heading">
              <h2>INTERACTIVE DEPENDENCY GRAPH</h2>
              <span>{tasks.length} tasks · {graphLayout.edges.length} dependencies</span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 12, fontSize: 12 }}>
              <span>🟩 Completed</span>
              <span>🟧 Blocked</span>
              <span>🟥 Critical path</span>
              <span>🟦 Other tasks</span>
            </div>

            <div style={{ height: 540, width: "100%", border: "1px solid #999", background: "var(--surface, #f4f4f4)" }}>
              <ReactFlow
                nodes={graphLayout.nodes}
                edges={graphLayout.edges}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2}
                maxZoom={1.5}
                onNodeClick={(_, node) => setSelectedGraphTaskId(Number(node.id))}
              >
                <Background />
                <MiniMap pannable zoomable />
                <Controls />
              </ReactFlow>
            </div>

            {selectedGraphTask && (
              <div className="task-critical-sequence" style={{ marginTop: 16 }}>
                <strong>SELECTED TASK: #{selectedGraphTask.id} — {selectedGraphTask.name}</strong>
                <p>Status: {selectedGraphTask.status} · Duration: {selectedGraphTask.duration} day(s) · Priority: {selectedGraphTask.priority}</p>
                <p>
                  Prerequisites: {(selectedGraphTask.dependencies ?? []).length
                    ? selectedGraphTask.dependencies.map((id) => tasks.find((item) => item.id === id)?.name ?? `Task #${id}`).join(", ")
                    : "None"}
                </p>
                <p>Critical path: {criticalIds.has(selectedGraphTask.id) ? "Yes" : "No"} · Risk: {riskByTask.get(selectedGraphTask.id)?.risk_level ?? "Unknown"}</p>
              </div>
            )}

            <p className="task-critical-legend">
              Arrows point from each prerequisite to the task that depends on it. Select a node to inspect its schedule details; use the controls to zoom and pan.
            </p>
          </section>
        )}

        {selectedTool === "timeline" && (
          <section className="task-list-panel">
            <div className="task-list-heading">
              <h2>TASK TIMELINE</h2>
              <span>{criticalPath?.project_duration ?? 0} days</span>
            </div>

            <div className="task-critical-table-wrapper">
              <table className="task-critical-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Schedule</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Risk</th>
                    <th>Slack</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalPath?.tasks.map((schedule) => {
                    const task = tasks.find((item) => item.id === schedule.task_id);
                    const taskRisk = riskByTask.get(schedule.task_id);
                    const width = criticalPath.project_duration
                      ? Math.max(
                          2,
                          (schedule.duration / criticalPath.project_duration) * 100,
                        )
                      : 2;
                    const left = criticalPath.project_duration
                      ? (schedule.earliest_start / criticalPath.project_duration) * 100
                      : 0;

                    return (
                      <tr key={schedule.task_id}>
                        <td>{schedule.task_name}</td>
                        <td style={{ minWidth: 200 }}>
                          <div
                            style={{
                              position: "relative",
                              height: 22,
                              minWidth: 180,
                              background: "var(--surface, #e5e5e5)",
                              border: "1px solid #999",
                            }}
                          >
                            <div
                              title={`${schedule.task_name}: day ${schedule.earliest_start}–${schedule.earliest_finish}`}
                              style={{
                                position: "absolute",
                                left: `${Math.min(98, left)}%`,
                                width: `${Math.min(width, 100 - left)}%`,
                                minWidth: 5,
                                height: "100%",
                                background: schedule.is_critical
                                  ? "#d9534f"
                                  : task?.status === "Completed"
                                    ? "#4b9b75"
                                    : "#6b91bd",
                              }}
                            />
                          </div>
                        </td>
                        <td>{schedule.duration} day(s)</td>
                        <td>{task?.status ?? "Unknown"}</td>
                        <td>{taskRisk?.risk_level ?? "Unknown"}</td>
                        <td>{schedule.slack}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="task-critical-legend">
              Bars use earliest-start and duration offsets from Critical Path
              analysis. Open the project page for dependency connector lines.
            </p>
          </section>
        )}

        {selectedTool === "critical-path" && (
          <section className="task-list-panel">
            <div className="task-list-heading">
              <h2>CRITICAL PATH ANALYSIS</h2>
              <strong>{criticalPath?.project_duration ?? 0} days</strong>
            </div>

            {criticalPath && (
              <>
                <div className="task-critical-sequence">
                  <strong>CRITICAL SEQUENCE</strong>
                  <p>
                    {criticalPath.critical_path
                      .map((id) => tasks.find((task) => task.id === id)?.name ?? `Task #${id}`)
                      .join(" → ") || "No critical path"}
                  </p>
                </div>

                <div className="task-critical-table-wrapper">
                  <table className="task-critical-table">
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Duration</th>
                        <th>ES</th>
                        <th>EF</th>
                        <th>LS</th>
                        <th>LF</th>
                        <th>Slack</th>
                        <th>Critical</th>
                      </tr>
                    </thead>
                    <tbody>
                      {criticalPath.tasks.map((item) => (
                        <tr
                          key={item.task_id}
                          className={item.is_critical ? "task-critical-row" : ""}
                        >
                          <td>{item.task_name}</td>
                          <td>{item.duration}</td>
                          <td>{item.earliest_start}</td>
                          <td>{item.earliest_finish}</td>
                          <td>{item.latest_start}</td>
                          <td>{item.latest_finish}</td>
                          <td>{item.slack}</td>
                          <td>{item.is_critical ? "YES" : "NO"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {selectedTool === "simulations" && (
          <section className="task-list-panel">
            <div className="task-list-heading">
              <h2>WHAT-IF DELAY SIMULATION</h2>
            </div>

            <div className="task-form-grid">
              <label>
                Task to delay
                <select
                  value={taskId}
                  onChange={(event) => setTaskId(event.target.value)}
                >
                  <option value="">Select a task</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      #{task.id} — {task.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Additional delay (days)
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={delay}
                  onChange={(event) => setDelay(event.target.value)}
                />
              </label>
            </div>

            <button
              className="task-primary-button"
              type="button"
              disabled={loading || !taskId}
              onClick={() => void runSimulation()}
            >
              {loading ? "Simulating..." : "Simulate Delay"}
            </button>

            {simulation && (
              <>
                <div className="task-critical-summary">
                  <div>
                    <strong>ORIGINAL</strong>
                    <p>{simulation.original_project_duration} days</p>
                  </div>
                  <div>
                    <strong>SIMULATED</strong>
                    <p>{simulation.simulated_project_duration} days</p>
                  </div>
                  <div>
                    <strong>PROJECT DELAY</strong>
                    <p>{simulation.project_delay} days</p>
                  </div>
                </div>

                <div className="task-critical-sequence">
                  <strong>SIMULATED CRITICAL PATH</strong>
                  <p>
                    {simulation.simulated.critical_path
                      .map((id) => tasks.find((task) => task.id === id)?.name ?? `Task #${id}`)
                      .join(" → ") || "No critical path"}
                  </p>
                </div>
              </>
            )}

            <p className="task-critical-legend">
              Simulation does not modify saved tasks.
            </p>
          </section>
        )}

        {projectId && (
          <button
            className="task-secondary-button"
            onClick={() => navigate(`/projects/${projectId}`)}
          >
            Open Full Project Workspace
          </button>
        )}
      </div>
    </main>
  );
}
