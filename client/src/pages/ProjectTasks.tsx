
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, RefreshCw, CheckSquare, Clock } from "lucide-react";
import { apiRequest } from "../lib/api";
import type { Project } from "../types/project";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import type {
  Task,
  TaskInput,
  TaskPriority,
  TaskStatus,
  CriticalPathAnalysis,
  WhatIfSimulationResult,
} from "../types/task";

type ScheduleRiskLevel = "High" | "Medium" | "Low";

interface ScheduleRiskTask {
  id: number;
  name: string;
  duration: number;
  status: TaskStatus;
  dependencies: number[];
  risk_level: ScheduleRiskLevel;
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
  tasks: ScheduleRiskTask[];
}


export default function ProjectTasks() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const taskModalRef = useRef<HTMLFormElement | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [criticalPath, setCriticalPath] =
  useState<CriticalPathAnalysis | null>(null);
  const [loadingCriticalPath, setLoadingCriticalPath] = useState(false);
  const [criticalPathError, setCriticalPathError] = useState("");
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [timelineAnalysis, setTimelineAnalysis] = useState<CriticalPathAnalysis | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [showTimeline, setShowTimeline] = useState(false);

  const [scheduleRisk, setScheduleRisk] =
    useState<ScheduleRiskAnalysis | null>(null);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [riskError, setRiskError] = useState("");
  const [showRisk, setShowRisk] = useState(false);

  const [simulationTaskId, setSimulationTaskId] = useState("");
  const [simulationDelay, setSimulationDelay] = useState("1");
  const [simulationResult, setSimulationResult] =
    useState<WhatIfSimulationResult | null>(null);
  const [simulationError, setSimulationError] = useState("");
  const [loadingSimulation, setLoadingSimulation] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);

  const [form, setForm] = useState<TaskInput>({
    name: "",
    description: "",
    duration: 1,
    start_date: new Date().toISOString().slice(0, 10),
    status: "Pending",
    priority: "Medium",
    dependencies: [],
  });

  useDialogAccessibility(
    showForm,
    () => {
      if (!saving) setShowForm(false);
    },
    taskModalRef,
  );

  const loadData = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError("");

    try {
      const [projectResponse, taskResponse] = await Promise.all([
        apiRequest<{ projects: Project[] }>("/projects"),
        apiRequest<{ tasks: Task[] }>(`/tasks/project/${projectId}`),
      ]);

      const foundProject = projectResponse.projects.find(
        (item) => String(item.id) === projectId
      );

      if (!foundProject) {
        setProject(null);
        setError("Project not found or you do not have access to it.");
        return;
      }

      setProject(foundProject);
      setTasks(taskResponse.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load project tasks.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  
async function loadCriticalPath() {
  if (!projectId || loadingCriticalPath) return;

  setLoadingCriticalPath(true);
  setCriticalPathError("");
  setShowCriticalPath(true);

  try {
    const response = await apiRequest<{ analysis: CriticalPathAnalysis }>(
      `/projects/${projectId}/critical-path`
    );

    setCriticalPath(response.analysis);
  } catch (err) {
    setCriticalPathError(
      err instanceof Error
        ? err.message
        : "Could not calculate the critical path."
    );
  } finally {
    setLoadingCriticalPath(false);
  }
}

  async function loadTimeline() {
    if (!projectId || loadingTimeline) return;

    setLoadingTimeline(true);
    setTimelineError("");
    setShowTimeline(true);

    try {
      const response = await apiRequest<{ analysis: CriticalPathAnalysis }>(
        `/projects/${projectId}/critical-path`
      );
      setTimelineAnalysis(response.analysis);

      // Load risk data alongside the timeline so risk indicators appear automatically.
      try {
        const riskResponse = await apiRequest<{ analysis: ScheduleRiskAnalysis }>(
          `/projects/${projectId}/schedule-risk`
        );
        setScheduleRisk(riskResponse.analysis);
      } catch {
        // Keep the timeline usable even if schedule-risk analysis is unavailable.
      }
    } catch (err) {
      setTimelineError(
        err instanceof Error ? err.message : "Could not load the project timeline."
      );
    } finally {
      setLoadingTimeline(false);
    }
  }

  async function loadScheduleRisk() {
    if (!projectId || loadingRisk) return;

    setLoadingRisk(true);
    setRiskError("");
    setShowRisk(true);

    try {
      const response = await apiRequest<{
        analysis: ScheduleRiskAnalysis;
      }>(`/projects/${projectId}/schedule-risk`);

      setScheduleRisk(response.analysis);
    } catch (err) {
      setRiskError(
        err instanceof Error
          ? err.message
          : "Could not analyse schedule risk."
      );
    } finally {
      setLoadingRisk(false);
    }
  }

  async function runWhatIfSimulation() {
    if (!projectId || loadingSimulation) return;

    const taskId = Number(simulationTaskId);
    const addedDuration = Number(simulationDelay);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      setSimulationError("Please select a task.");
      return;
    }

    if (
      !Number.isInteger(addedDuration) ||
      addedDuration < 1 ||
      addedDuration > 365
    ) {
      setSimulationError("Enter a delay between 1 and 365 days.");
      return;
    }

    setLoadingSimulation(true);
    setSimulationError("");
    setSimulationResult(null);

    try {
      const response = await apiRequest<{
        simulation: WhatIfSimulationResult;
      }>(`/projects/${projectId}/what-if/delay`, {
        method: "POST",
        body: JSON.stringify({
          task_id: taskId,
          added_duration: addedDuration,
        }),
      });

      setSimulationResult(response.simulation);
    } catch (err) {
      setSimulationError(
        err instanceof Error
          ? err.message
          : "Could not simulate the task delay."
      );
    } finally {
      setLoadingSimulation(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openCreateForm() {
    setEditingTask(null);
    setForm({
      name: "",
      description: "",
      duration: 1,
      start_date: new Date().toISOString().slice(0, 10),
      status: "Pending",
      priority: "Medium",
      dependencies: [],
    });
    setShowForm(true);
  }

  function openEditForm(task: Task) {
    setEditingTask(task);
    setForm({
      name: task.name,
      description: task.description ?? "",
      duration: task.duration,
      start_date: task.start_date.slice(0, 10),
      status: task.status,
      priority: task.priority,
      dependencies: task.dependencies ?? [],
    });
    setShowForm(true);
  }

  async function saveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || saving) return;

    setSaving(true);
    setError("");

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        duration: Number(form.duration),
        start_date: form.start_date,
        status: form.status,
        priority: form.priority,
        dependencies: form.dependencies,
        };

      if (editingTask) {
        await apiRequest<{ task: Task }>(`/tasks/${editingTask.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest<{ task: Task }>(`/tasks/project/${projectId}`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setShowForm(false);
      setEditingTask(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete "${task.name}" permanently?`)) return;

    setError("");

    try {
      await apiRequest(`/tasks/${task.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete task.");
    }
  }

  async function updateStatus(task: Task, status: TaskStatus) {
    setError("");

    try {
      await apiRequest(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update task.");
    }
  }

  const timelineTasks = [...(timelineAnalysis?.tasks ?? [])].sort(
    (a, b) => a.earliest_start - b.earliest_start || a.task_id - b.task_id
  );
  const timelineRowIndex = new Map(
    timelineTasks.map((item, index) => [item.task_id, index])
  );
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  function getTaskDueDate(task: Task): Date | null {
    if (!task.start_date || !Number.isFinite(task.duration) || task.duration < 1) return null;
    const dueDate = new Date(`${task.start_date.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(dueDate.getTime())) return null;
    dueDate.setDate(dueDate.getDate() + task.duration - 1);
    return dueDate;
  }
  function isTaskOverdue(task: Task): boolean {
    if (task.status === "Completed") return false;
    const dueDate = getTaskDueDate(task);
    return Boolean(dueDate && dueDate < todayDate);
  }
  const overdueTasks = tasks.filter(isTaskOverdue);
  const highRiskCount = scheduleRisk?.summary.high_risk ?? 0;
  const blockedCount = scheduleRisk?.summary.blocked_tasks ?? tasks.filter(
    (task) => task.is_blocked && task.status !== "Completed"
  ).length;
  const criticalCount = timelineAnalysis?.tasks.filter((item) => item.is_critical).length ?? 0;
  const scheduleHealthScore = tasks.length === 0
    ? 100
    : Math.max(0, Math.min(100, Math.round(
        100 - (blockedCount * 15) - (highRiskCount * 8) - (Math.max(0, criticalCount - 1) * 2)
      )));
  const atRiskTasks = (scheduleRisk?.tasks ?? [])
    .filter((item) => item.status !== "Completed" && (item.risk_level === "High" || item.risk_level === "Medium"))
    .sort((a, b) => (a.risk_level === "High" ? 0 : 1) - (b.risk_level === "High" ? 0 : 1));

  function exportScheduleCsv() {
    if (!timelineAnalysis) return;

    const riskByTaskId = new Map((scheduleRisk?.tasks ?? []).map((item) => [item.id, item]));
    const headers = [
      "Task ID", "Task Name", "Status", "Priority", "Duration (days)",
      "Start Date", "Dependencies", "Earliest Start", "Earliest Finish",
      "Latest Start", "Latest Finish", "Slack (days)", "Critical", "Risk Level", "Risk Reasons", "Due Date", "Overdue",
    ];
    const escapeCsv = (value: unknown) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = timelineTasks.map((item) => {
      const task = tasks.find((candidate) => candidate.id === item.task_id);
      const risk = riskByTaskId.get(item.task_id);
      return [
        item.task_id,
        item.task_name,
        task?.status ?? "",
        task?.priority ?? "",
        item.duration,
        task?.start_date?.slice(0, 10) ?? "",
        (task?.dependencies ?? []).map((id) => `#${id}`).join("; "),
        item.earliest_start,
        item.earliest_finish,
        item.latest_start,
        item.latest_finish,
        item.slack,
        item.is_critical ? "Yes" : "No",
        risk?.risk_level ?? "Unavailable",
        (risk?.risk_reasons ?? []).join(" "),
        task ? getTaskDueDate(task)?.toISOString().slice(0, 10) ?? "" : "",
        task && isTaskOverdue(task) ? "Yes" : "No",
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(project?.name ?? "project").replace(/[^a-z0-9-_]+/gi, "-")}-schedule.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const completed = tasks.filter((task) => task.status === "Completed").length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  if (loading) {
    return <div className="loading-screen">Loading project tasks...</div>;
  }

  return (
    <main className="task-page" id="main-content" tabIndex={-1}>
      <header className="task-page-titlebar">
        <span>DEADLINEMESH.EXE — TASK MANAGER</span>
        <button className="task-window-close" onClick={() => navigate("/dashboard")}>
          ×
        </button>
      </header>

      <div className="task-page-content">
        <button className="task-back-button" onClick={() => navigate("/dashboard")}>
          <ArrowLeft size={16} /> Back to Projects
        </button>

        {error && <div className="task-error">{error}</div>}

        {project && (
          <>
            <section className="task-project-heading">
              <div>
                <p className="task-eyebrow">PROJECT #{project.id}</p>
                <h1>{project.name}</h1>
                <p>{project.description || "No project description."}</p>
              </div>

              
                <div className="task-heading-actions">
                <button
                    className="task-secondary-button"
                    onClick={() => void loadCriticalPath()}
                    disabled={loadingCriticalPath}
                >
                    {loadingCriticalPath ? "Analyzing..." : "Critical Path"}
                </button>
                <button
                  className="task-secondary-button"
                  onClick={() => void loadTimeline()}
                  disabled={loadingTimeline}
                  type="button"
                >
                  {loadingTimeline ? "Loading Timeline..." : "Timeline"}
                </button>
                <button
                  className="task-secondary-button"
                  onClick={() => void loadScheduleRisk()}
                  disabled={loadingRisk}
                  type="button"
                >
                  {loadingRisk ? "Analyzing..." : "Schedule Risk"}
                </button>
                <button
                    className="task-secondary-button"
                    onClick={() => {
                      setShowSimulation(true);
                      setSimulationError("");
                      setSimulationResult(null);
                      setSimulationTaskId("");
                      setSimulationDelay("1");
                    }}
                    type="button"
                >
                    What-if Delay
                </button>

                <button className="task-primary-button" onClick={openCreateForm}>
                    <Plus size={17} /> New Task
                </button>
                </div>

            </section>

            <section className="task-stats">
              <div className="task-stat">
                <CheckSquare size={20} />
                <div>
                  <strong>{tasks.length}</strong>
                  <span>Total tasks</span>
                </div>
              </div>
              <div className="task-stat">
                <Clock size={20} />
                <div>
                  <strong>{tasks.filter((task) => task.status === "In Progress").length}</strong>
                  <span>In progress</span>
                </div>
              </div>
              <div className="task-stat">
                <CheckSquare size={20} />
                <div>
                  <strong>{completed}</strong>
                  <span>Completed</span>
                </div>
              </div>
            </section>

            <section className="task-progress-panel">
              <div className="task-progress-label">
                <strong>PROJECT COMPLETION</strong>
                <span>{progress}%</span>
              </div>
              <div className="task-progress-track">
                <div className="task-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </section>

            <section className="task-list-panel">
              <div className="task-list-heading">
                <h2>PROJECT TASKS</h2>
                <button className="task-refresh-button" onClick={() => void loadData()}>
                  <RefreshCw size={15} /> Refresh
                </button>
              </div>

              {tasks.length === 0 ? (
                <div className="task-empty">
                  <CheckSquare size={34} />
                  <h3>No tasks yet</h3>
                  <p>Create your first task to start planning this project.</p>
                  <button className="task-primary-button" onClick={openCreateForm}>
                    <Plus size={16} /> Create First Task
                  </button>
                </div>
              ) : (
                <div className="task-list">
                  {tasks.map((task) => (
                    <article className="task-card" key={task.id}>
                      <div className="task-card-main">
                        <div className="task-card-title">
                        <h3>{task.name}</h3>
                        <span className={`task-priority priority-${task.priority.toLowerCase()}`}>
                            {task.priority}
                        </span>
                        {task.is_blocked && task.status !== "Completed" && (
                            <span className="task-blocked-badge">BLOCKED</span>
                        )}
                        {isTaskOverdue(task) && (
                          <span className="task-blocked-badge" title={`Estimated due date: ${getTaskDueDate(task)?.toLocaleDateString()}`}>OVERDUE</span>
                        )}
                        </div>
                        <p>{task.description || "No description."}</p>

                            {task.dependencies && task.dependencies.length > 0 && (
                            <div className="task-dependency-display">
                                <strong>DEPENDS ON: </strong>
                                {task.dependencies.map((dependencyId, index) => {
                                const dependencyTask = tasks.find(
                                    (item) => item.id === dependencyId
                                );

                                return (
                                    <span key={dependencyId}>
                                    {index > 0 && ", "}
                                    {dependencyTask
                                        ? `#${dependencyTask.id} — ${dependencyTask.name}`
                                        : `Task #${dependencyId}`}
                                    </span>
                                );
                                })}
                            </div>
                            )}

                            <div className="task-metadata">
                          <span>#{task.id}</span>
                          <span>{task.duration} day{task.duration !== 1 ? "s" : ""}</span>
                          <span>Starts {task.start_date.slice(0, 10)}</span>
                        </div>
                      </div>

                      <div className="task-card-actions">
                        <select
                          aria-label={`Status for ${task.name}`}
                          value={task.status}
                          onChange={(event) =>
                            void updateStatus(task, event.target.value as TaskStatus)
                          }
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                        </select>
                        <button onClick={() => openEditForm(task)}>Edit</button>
                        <button className="task-delete-button" onClick={() => void deleteTask(task)}>
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            
{showTimeline && (
  <section className="task-critical-path-panel">
    <div className="task-list-heading">
      <h2>PROJECT TIMELINE</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className="task-refresh-button"
          type="button"
          onClick={exportScheduleCsv}
          disabled={!timelineAnalysis || timelineAnalysis.tasks.length === 0}
        >
          Export CSV
        </button>
        <button
          className="task-refresh-button"
          type="button"
          onClick={() => setShowTimeline(false)}
        >
          Close
        </button>
      </div>
    </div>

    {loadingTimeline && <p>Building project timeline...</p>}
    {timelineError && <div className="task-error">{timelineError}</div>}

    {timelineAnalysis && !loadingTimeline && !timelineError && (
      <>
        <div className="task-critical-summary">
          <div>
            <strong>PROJECT DURATION</strong>
            <p>{timelineAnalysis.project_duration} days</p>
          </div>
          <div>
            <strong>TASKS ON TIMELINE</strong>
            <p>{timelineAnalysis.tasks.length}</p>
          </div>
          <div>
            <strong>CRITICAL TASKS</strong>
            <p>{timelineAnalysis.tasks.filter((item) => item.is_critical).length}</p>
          </div>
          <div>
            <strong>OVERDUE TASKS</strong>
            <p>{overdueTasks.length}</p>
          </div>
          <div>
            <strong>HIGH-RISK TASKS</strong>
            <p>{scheduleRisk?.summary.high_risk ?? "—"}</p>
          </div>
        </div>

        <section style={{ margin: "12px 0 18px", padding: 12, border: "1px solid var(--border-color, #999)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <strong>SCHEDULE HEALTH</strong>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>
                {scheduleRisk ? `${scheduleHealthScore}/100` : "Calculating…"}
              </div>
              <small>Rule-based indicator using blocked, high-risk, and critical tasks; not a probability.</small>
            </div>
            <div style={{ flex: "1 1 180px", maxWidth: 360, minWidth: 150, height: 12, border: "1px solid var(--border-color, #999)", background: "var(--panel-bg, #eee)" }}>
              <div style={{ width: `${scheduleRisk ? scheduleHealthScore : 0}%`, height: "100%", background: scheduleHealthScore >= 75 ? "#4c9b65" : scheduleHealthScore >= 45 ? "#e0ad3e" : "#c83e3e", transition: "width 180ms ease" }} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <strong>AT-RISK TASKS ({scheduleRisk ? atRiskTasks.length : "—"})</strong>
            {!scheduleRisk ? (
              <p style={{ marginBottom: 0 }}>Risk details will appear when schedule-risk analysis finishes.</p>
            ) : atRiskTasks.length === 0 ? (
              <p style={{ marginBottom: 0 }}>No unfinished medium- or high-risk tasks detected.</p>
            ) : (
              <ul style={{ margin: "8px 0 0", paddingLeft: 22 }}>
                {atRiskTasks.slice(0, 5).map((item) => (
                  <li key={item.id} style={{ marginBottom: 5 }}>
                    <strong>{item.risk_level.toUpperCase()}</strong> — {item.name}: {item.risk_reasons.join(" ") || "Review task slack and dependencies."}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {timelineAnalysis.tasks.length === 0 ? (
          <p>No tasks to display on the timeline.</p>
        ) : (
          <div style={{ overflowX: "auto", paddingBottom: 8 }}>
            <div style={{ minWidth: 680, position: "relative" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(170px, 1.2fr) minmax(300px, 2fr)",
                  gap: 12,
                  padding: "10px 12px",
                  borderBottom: "2px solid var(--border-color, #999)",
                  fontWeight: 700,
                }}
              >
                <span>TASK</span>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  {Array.from(
                    { length: Math.max(1, timelineAnalysis.project_duration) + 1 },
                    (_, day) => day
                  )
                    .filter((day) => day === 0 || day === timelineAnalysis.project_duration || day % Math.max(1, Math.ceil(timelineAnalysis.project_duration / 6)) === 0)
                    .map((day) => (
                      <span key={day} style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                        D{day}
                      </span>
                    ))}
                </div>
              </div>

              <svg
                aria-label="Task dependency connectors"
                role="img"
                style={{
                  position: "absolute",
                  left: "38%",
                  right: 0,
                  top: 48,
                  width: "62%",
                  height: Math.max(1, timelineTasks.length) * 82,
                  overflow: "visible",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
                viewBox={`0 0 100 ${Math.max(1, timelineTasks.length) * 82}`}
                preserveAspectRatio="none"
              >
                <defs>
                  <marker id="timeline-dependency-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#7254a3" />
                  </marker>
                </defs>
                {timelineTasks.flatMap((item, rowIndex) => {
                  const task = tasks.find((candidate) => candidate.id === item.task_id);
                  const total = Math.max(1, timelineAnalysis.project_duration);
                  return (task?.dependencies ?? []).flatMap((dependencyId) => {
                    const dependency = timelineTasks.find((candidate) => candidate.task_id === dependencyId);
                    const dependencyIndex = timelineRowIndex.get(dependencyId);
                    if (!dependency || dependencyIndex === undefined) return [];
                    const fromX = Math.min(100, ((dependency.earliest_finish / total) * 100));
                    const toX = Math.min(100, ((item.earliest_start / total) * 100));
                    const fromY = dependencyIndex * 82 + 41;
                    const toY = rowIndex * 82 + 41;
                    const bendX = Math.max(fromX + 1, toX - 2);
                    return [(
                      <path
                        key={`${dependencyId}-${item.task_id}`}
                        d={`M ${fromX} ${fromY} H ${bendX} V ${toY} H ${Math.max(0, toX)}`}
                        fill="none"
                        stroke="#7254a3"
                        strokeWidth="0.8"
                        strokeDasharray={dependency.is_critical && item.is_critical ? "none" : "2 1"}
                        markerEnd="url(#timeline-dependency-arrow)"
                        opacity="0.9"
                      />
                    )];
                  });
                })}
              </svg>

              {timelineTasks.map((item) => {
                  const task = tasks.find((candidate) => candidate.id === item.task_id);
                  const total = Math.max(1, timelineAnalysis.project_duration);
                  const left = Math.max(0, (item.earliest_start / total) * 100);
                  const width = Math.max(2, (item.duration / total) * 100);
                  const isBlocked = Boolean(task?.is_blocked && task.status !== "Completed");
                  const risk = scheduleRisk?.tasks.find((riskTask) => riskTask.id === item.task_id);
                  const barColor = isBlocked
                    ? "#d9534f"
                    : task?.status === "Completed"
                      ? "#4b9b68"
                      : item.is_critical
                        ? "#e0a12f"
                        : "#5488c7";

                  return (
                    <div
                      key={item.task_id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(170px, 1.2fr) minmax(300px, 2fr)",
                        gap: 12,
                        alignItems: "center",
                        padding: "9px 12px",
                        minHeight: 82,
                        boxSizing: "border-box",
                        borderBottom: "1px solid var(--border-color, #ddd)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>
                          {item.task_name}
                          {risk && (
                            <span
                              title={risk.risk_reasons.join(" ") || `${risk.risk_level} schedule risk`}
                              style={{
                                display: "inline-block",
                                marginLeft: 7,
                                padding: "2px 5px",
                                borderRadius: 3,
                                fontSize: 9,
                                verticalAlign: "middle",
                                color: risk.risk_level === "High" ? "#fff" : "#222",
                                background: risk.risk_level === "High" ? "#c83e3e" : risk.risk_level === "Medium" ? "#f0c35a" : "#8bc49a",
                              }}
                            >
                              {risk.risk_level.toUpperCase()} RISK
                            </span>
                          )}
                          {task && isTaskOverdue(task) && (
                            <span title={`Due ${getTaskDueDate(task)?.toLocaleDateString()}`} style={{ display: "inline-block", marginLeft: 6, padding: "2px 5px", borderRadius: 3, fontSize: 9, background: "#8f1d1d", color: "#fff", verticalAlign: "middle" }}>OVERDUE</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>
                          {item.duration} day(s) · Slack {item.slack} ·{" "}
                          {isBlocked ? "Blocked" : task?.status ?? "Pending"}
                          {risk?.risk_reasons.length ? ` · ${risk.risk_reasons.join(" ")}` : ""}
                        </div>
                        {task?.dependencies && task.dependencies.length > 0 && (
                          <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-secondary, #666)" }}>
                            ← Depends on: {task.dependencies.map((dependencyId, index) => {
                              const dependency = tasks.find((candidate) => candidate.id === dependencyId);
                              return `${index > 0 ? ", " : ""}${dependency ? `${dependency.name} (#${dependencyId})` : `Task #${dependencyId}`}`;
                            }).join("")}
                          </div>
                        )}
                      </div>
                      <div
                        aria-label={`${item.task_name}: starts day ${item.earliest_start}, duration ${item.duration} days`}
                        title={`${item.task_name}: Day ${item.earliest_start}–${item.earliest_finish}; ${item.is_critical ? "Critical path" : `${item.slack} day(s) slack`}`}
                        style={{
                          position: "relative",
                          zIndex: 3,
                          height: 28,
                          borderRadius: 3,
                          background: "repeating-linear-gradient(to right, transparent 0, transparent calc(16.666% - 1px), var(--border-color, #ddd) calc(16.666% - 1px), var(--border-color, #ddd) 16.666%)",
                          border: "1px solid var(--border-color, #ccc)",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: `${Math.min(100, left)}%`,
                            width: `${Math.min(width, Math.max(0, 100 - left))}%`,
                            top: 3,
                            bottom: 3,
                            minWidth: 4,
                            borderRadius: 2,
                            background: barColor,
                            boxSizing: "border-box",
                            border: item.is_critical ? "2px solid #7a4b00" : "1px solid rgba(0,0,0,.15)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <p className="task-critical-legend">
          Overdue means an unfinished task is past its estimated due date (start date + duration − 1 day).
          Bars use earliest-start schedule offsets. Red = blocked, green = completed,
          amber = critical path, blue = other tasks. Risk badges show High, Medium, or Low
          rule-based schedule risk; hover a badge for its reason. Purple connector lines point
          from prerequisite tasks toward dependent tasks; solid lines connect critical-path tasks.
        </p>
      </>
    )}
  </section>
)}

{showCriticalPath && (
  <section className="task-critical-path-panel">
    <div className="task-list-heading">
      <h2>CRITICAL PATH ANALYSIS</h2>
      <button
        className="task-refresh-button"
        onClick={() => setShowCriticalPath(false)}
      >
        Close
      </button>
    </div>

    {loadingCriticalPath && <p>Calculating critical path...</p>}

    {criticalPathError && (
      <div className="task-error">{criticalPathError}</div>
    )}

    {criticalPath && !loadingCriticalPath && !criticalPathError && (
      <>
        <div className="task-critical-summary">
          <strong>PROJECT DURATION</strong>
          <span>{criticalPath.project_duration} days</span>
        </div>

        <div className="task-critical-sequence">
          <strong>CRITICAL PATH</strong>
          <p>
            {criticalPath.critical_path.length > 0
              ? criticalPath.critical_path
                  .map((id) => {
                    const task = tasks.find((item) => item.id === id);
                    return task ? `${task.name} (#${id})` : `Task #${id}`;
                  })
                  .join(" → ")
              : "No tasks in the critical path."}
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
        <p className="task-critical-legend">
          ES = Earliest Start · EF = Earliest Finish · LS = Latest Start ·
          LF = Latest Finish
        </p>
      </>
    )}
  </section>
)}

            {showRisk && (
              <section className="task-critical-path-panel">
                <div className="task-list-heading">
                  <h2>SCHEDULE RISK ANALYSIS</h2>
                  <button
                    className="task-refresh-button"
                    type="button"
                    onClick={() => setShowRisk(false)}
                  >
                    Close
                  </button>
                </div>

                {loadingRisk && <p>Analysing schedule risk...</p>}

                {riskError && <div className="task-error">{riskError}</div>}

                {scheduleRisk && !loadingRisk && !riskError && (
                  <>
                    <div className="task-critical-summary">
                      <div>
                        <strong>HIGH RISK</strong>
                        <p>{scheduleRisk.summary.high_risk}</p>
                      </div>
                      <div>
                        <strong>MEDIUM RISK</strong>
                        <p>{scheduleRisk.summary.medium_risk}</p>
                      </div>
                      <div>
                        <strong>LOW RISK</strong>
                        <p>{scheduleRisk.summary.low_risk}</p>
                      </div>
                      <div>
                        <strong>BLOCKED TASKS</strong>
                        <p>{scheduleRisk.summary.blocked_tasks}</p>
                      </div>
                    </div>

                    <div className="task-critical-table-wrapper">
                      <table className="task-critical-table">
                        <thead>
                          <tr>
                            <th>Task</th>
                            <th>Risk</th>
                            <th>Slack</th>
                            <th>Critical</th>
                            <th>Blocked By</th>
                            <th>Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scheduleRisk.tasks.map((item) => (
                            <tr key={item.id}>
                              <td>{item.name}</td>
                              <td>
                                <strong>{item.risk_level.toUpperCase()}</strong>
                              </td>
                              <td>{item.slack} day(s)</td>
                              <td>{item.is_critical ? "YES" : "NO"}</td>
                              <td>
                                {item.blocked_by.length
                                  ? item.blocked_by.map((id) => `#${id}`).join(", ")
                                  : "None"}
                              </td>
                              <td>{item.risk_reasons.join(" ") || "No active risk."}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <p className="task-critical-legend">
                      Project duration: {scheduleRisk.project_duration} days.
                      Risk levels are rule-based indicators, not probability estimates.
                    </p>
                  </>
                )}
              </section>
            )}

            {showSimulation && (
              <section className="task-critical-path-panel">
                <div className="task-list-heading">
                  <h2>WHAT-IF DELAY SIMULATION</h2>
                  <button
                    className="task-refresh-button"
                    type="button"
                    onClick={() => setShowSimulation(false)}
                  >
                    Close
                  </button>
                </div>

                <p>
                  Simulate a task delay to estimate its impact without changing
                  the saved project data.
                </p>

                <div className="task-form-grid">
                  <label>
                    Task to delay
                    <select
                      value={simulationTaskId}
                      onChange={(event) => {
                        setSimulationTaskId(event.target.value);
                        setSimulationResult(null);
                        setSimulationError("");
                      }}
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
                      step={1}
                      value={simulationDelay}
                      onChange={(event) => {
                        setSimulationDelay(event.target.value);
                        setSimulationResult(null);
                        setSimulationError("");
                      }}
                    />
                  </label>
                </div>

                <div style={{ marginTop: 14 }}>
                  <button
                    className="task-primary-button"
                    type="button"
                    onClick={() => void runWhatIfSimulation()}
                    disabled={loadingSimulation || tasks.length === 0}
                  >
                    {loadingSimulation ? "Simulating..." : "Simulate Delay"}
                  </button>
                </div>

                {simulationError && (
                  <div className="task-error" style={{ marginTop: 12 }}>
                    {simulationError}
                  </div>
                )}

                {simulationResult && (
                  <>
                    <div className="task-critical-summary">
                      <div>
                        <strong>ORIGINAL DURATION</strong>
                        <p>{simulationResult.original_project_duration} days</p>
                      </div>
                      <div>
                        <strong>SIMULATED DURATION</strong>
                        <p>{simulationResult.simulated_project_duration} days</p>
                      </div>
                      <div>
                        <strong>PROJECT DELAY</strong>
                        <p>
                          {simulationResult.project_delay > 0
                            ? `+${simulationResult.project_delay}`
                            : simulationResult.project_delay}{" "}
                          days
                        </p>
                      </div>
                    </div>

                    <div className="task-critical-sequence">
                      <strong>ORIGINAL CRITICAL PATH</strong>
                      <p>
                        {simulationResult.original.critical_path
                          .map((id) => {
                            const item = tasks.find((task) => task.id === id);
                            return item ? `${item.name} (#${id})` : `Task #${id}`;
                          })
                          .join(" → ") || "No critical path."}
                      </p>
                    </div>

                    <div className="task-critical-sequence">
                      <strong>SIMULATED CRITICAL PATH</strong>
                      <p>
                        {simulationResult.simulated.critical_path
                          .map((id) => {
                            const item = tasks.find((task) => task.id === id);
                            return item ? `${item.name} (#${id})` : `Task #${id}`;
                          })
                          .join(" → ") || "No critical path."}
                      </p>
                    </div>

                    <p className="task-critical-legend">
                      Task #{simulationResult.task_id} was assigned an
                      additional {simulationResult.added_duration} day(s).
                      This is a simulation only; saved task data is unchanged.
                    </p>
                  </>
                )}
              </section>
            )}

          </>
        )}
      </div>

      {showForm && (
        <div
          className="task-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setShowForm(false);
            }
          }}
        >
          <form
            className="task-modal"
            onSubmit={saveTask}
            ref={taskModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-modal-title"
            tabIndex={-1}
          >
            <header className="task-modal-titlebar">
              <span id="task-modal-title">
                {editingTask ? "EDIT TASK" : "CREATE NEW TASK"}
              </span>
              <button
                type="button"
                aria-label="Close task form"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                ×
              </button>
            </header>

            <div className="task-modal-fields">
              <label>
                Task name *
                <input
                  autoFocus
                  required
                  maxLength={200}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="e.g. Build authentication system"
                />
              </label>

              <label>
                Description
                <textarea
                  maxLength={5000}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="What needs to be done?"
                  rows={3}
                />
              </label>

              <div className="task-form-grid">
                <label>
                  Duration (days) *
                  <input
                    type="number"
                    required
                    min={1}
                    max={365}
                    value={form.duration}
                    onChange={(event) =>
                      setForm({ ...form, duration: Number(event.target.value) })
                    }
                  />
                </label>

                <label>
                  Start date *
                  <input
                    type="date"
                    required
                    value={form.start_date}
                    onChange={(event) =>
                      setForm({ ...form, start_date: event.target.value })
                    }
                  />
                </label>

                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm({ ...form, status: event.target.value as TaskStatus })
                    }
                  >
                    <option>Pending</option>
                    <option>In Progress</option>
                    <option>Completed</option>
                  </select>
                </label>

                <label>
                  Priority
                  <select
                    value={form.priority}
                    onChange={(event) =>
                      setForm({ ...form, priority: event.target.value as TaskPriority })
                    }
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </label>
              </div>
              <label className="task-dependencies-field">
                Depends on
                <select
                    multiple
                    value={form.dependencies.map(String)}
                    onChange={(event) => {
                    const selectedIds = Array.from(
                        event.target.selectedOptions,
                        (option) => Number(option.value)
                    );

                    setForm({ ...form, dependencies: selectedIds });
                    }}
                >
                    {tasks
                    .filter((task) => task.id !== editingTask?.id)
                    .map((task) => (
                        <option key={task.id} value={task.id}>
                        #{task.id} — {task.name}
                        </option>
                    ))}
                </select>
                <small>
                    Select every task that must be completed before this task can begin.
                    Use Ctrl (Windows) or Cmd (Mac) to select multiple tasks.
                </small>
                </label>
            </div>

            <footer className="task-modal-actions">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button className="task-primary-button" type="submit" disabled={saving}>
                {saving ? "Saving..." : editingTask ? "Save Changes" : "Create Task"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}
