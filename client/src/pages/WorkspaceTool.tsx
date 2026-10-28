
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
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
      <main className="task-page">
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
    <main className="task-page">
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

        {selectedTool === "graph" && (
          <section className="task-list-panel">
            <div className="task-list-heading">
              <h2>DEPENDENCY GRAPH</h2>
            </div>
            {tasks.map((task) => (
              <article className="task-card" key={task.id}>
                <div className="task-card-main">
                  <div className="task-card-title">
                    <h3>#{task.id} — {task.name}</h3>
                    {criticalIds.has(task.id) && (
                      <span className="task-blocked-badge">CRITICAL</span>
                    )}
                  </div>
                  <p>
                    {task.dependencies?.length
                      ? `Depends on: ${task.dependencies
                          .map((id) => {
                            const dependency = tasks.find((item) => item.id === id);
                            return dependency
                              ? `#${id} ${dependency.name}`
                              : `#${id}`;
                          })
                          .join(", ")}`
                      : "No prerequisites"}
                  </p>
                  <div className="task-metadata">
                    <span>{task.status}</span>
                    <span>{task.duration} day(s)</span>
                    <span>
                      Risk: {riskByTask.get(task.id)?.risk_level ?? "Unknown"}
                    </span>
                  </div>
                </div>
              </article>
            ))}
            <p className="task-critical-legend">
              Each row shows prerequisite relationships. Open the project page
              for the interactive timeline with dependency connectors.
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
