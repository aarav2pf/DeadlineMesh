
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  CalendarDays,
  Check,
  CircleAlert,
  FolderKanban,
  LogOut,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/api";
import type { Project } from "../types/project";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";

type ProjectsResponse = { projects: Project[] };
type ProjectResponse = { project: Project };

const emptyForm = {
  name: "",
  description: "",
  deadline: "",
};

function formatDate(date: string | null) {
  if (!date) return "NO DEADLINE";
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(
    "en-GB",
    { day: "2-digit", month: "short", year: "numeric" },
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const projectModalRef = useRef<HTMLElement | null>(null);

  useDialogAccessibility(
    modalOpen,
    () => {
      if (!saving) setModalOpen(false);
    },
    projectModalRef,
  );

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest<ProjectsResponse>("/projects");
      setProjects(data.projects);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setNotice("");
    setModalOpen(true);
  }

  function openEdit(project: Project) {
    setEditing(project);
    setForm({
      name: project.name,
      description: project.description ?? "",
      deadline: project.deadline?.slice(0, 10) ?? "",
    });
    setNotice("");
    setModalOpen(true);
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      deadline: form.deadline || null,
    };

    try {
      if (editing) {
        const data = await apiRequest<ProjectResponse>(
          `/projects/${editing.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );

        setProjects((current) =>
          current.map((project) =>
            project.id === editing.id
              ? { ...project, ...data.project }
              : project,
          ),
        );
        setNotice("PROJECT UPDATED SUCCESSFULLY");
      } else {
        const data = await apiRequest<ProjectResponse>("/projects", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setProjects((current) => [data.project, ...current]);
        setNotice("PROJECT CREATED SUCCESSFULLY");
      }

      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject(project: Project) {
    if (
      !window.confirm(
        `Delete "${project.name}" and all its tasks? This cannot be undone.`,
      )
    ) {
      return;
    }

    setError("");
    setNotice("");

    try {
      await apiRequest<{ message: string }>(`/projects/${project.id}`, {
        method: "DELETE",
      });

      setProjects((current) =>
        current.filter((item) => item.id !== project.id),
      );
      setNotice("PROJECT DELETED");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const filteredProjects = projects.filter((project) => {
    const query = search.trim().toLowerCase();
    return (
      !query ||
      project.name.toLowerCase().includes(query) ||
      (project.description ?? "").toLowerCase().includes(query)
    );
  });

  const completedTasks = projects.reduce(
    (sum, project) => sum + Number(project.completed_count ?? 0),
    0,
  );

  const totalTasks = projects.reduce(
    (sum, project) => sum + Number(project.task_count ?? 0),
    0,
  );

  const workspaceTool = location.pathname.startsWith("/workspace/")
    ? location.pathname.split("/")[2]
    : "";

  function navigateToTool(tool: string) {
    navigate(`/workspace/${tool}`);
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">DM</div>
          <div>
            <strong>DeadlineMesh</strong>
            <small>PROJECT CONTROL</small>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <button
          type="button"
          className={`nav-item ${!workspaceTool ? "nav-item-active" : ""}`}
          onClick={() => navigate("/dashboard")}
        >
          <FolderKanban size={17} />
          <span>Projects</span>
          <span className="nav-count">{projects.length}</span>
        </button>

        <button
          type="button"
          className={`nav-item ${workspaceTool === "graph" ? "nav-item-active" : ""}`}
          onClick={() => navigateToTool("graph")}
        >
          <span className="nav-symbol">◇</span>
          <span>Task Graph</span>
        </button>

        <button
          type="button"
          className={`nav-item ${workspaceTool === "timeline" ? "nav-item-active" : ""}`}
          onClick={() => navigateToTool("timeline")}
        >
          <CalendarDays size={17} />
          <span>Timeline</span>
        </button>

        <button
          type="button"
          className={`nav-item ${workspaceTool === "critical-path" ? "nav-item-active" : ""}`}
          onClick={() => navigateToTool("critical-path")}
        >
          <span className="nav-symbol">⌁</span>
          <span>Critical Path</span>
        </button>

        <button
          type="button"
          className={`nav-item ${workspaceTool === "simulations" ? "nav-item-active" : ""}`}
          onClick={() => navigateToTool("simulations")}
        >
          <span className="nav-symbol">◷</span>
          <span>Simulations</span>
        </button>

        <div className="sidebar-bottom">
          <div className="user-card">
            <div className="user-avatar">
              {(user?.name?.[0] ?? "U").toUpperCase()}
            </div>
            <div className="user-info">
              <strong>{user?.name}</strong>
              <small>{user?.email}</small>
            </div>
            <button
              type="button"
              className="icon-button"
              title="Sign out"
              aria-label="Sign out"
              onClick={logout}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>WORKSPACE</span>
            <span>/</span>
            <strong>PROJECTS</strong>
          </div>
        </header>

        <div className="dashboard-main" id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">DEADLINEMESH / OVERVIEW</p>
              <h1>Project control.</h1>
              <p className="muted">
                Every task connected. Every deadline accounted for.
              </p>
            </div>

            <button type="button" onClick={openCreate}>
              <Plus size={17} /> NEW PROJECT
            </button>
          </div>

          {error && (
            <div className="notice notice-error" role="alert">
              <CircleAlert size={17} />
              <span>{error}</span>
              <button
                type="button"
                className="notice-close"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {notice && (
            <div className="notice notice-success" role="status">
              <Check size={17} />
              {notice}
              <button
                type="button"
                className="notice-close"
                onClick={() => setNotice("")}
                aria-label="Dismiss notice"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <section className="stats-grid">
            <article className="stat-panel">
              <span className="stat-label">TOTAL PROJECTS</span>
              <strong>{projects.length.toString().padStart(2, "0")}</strong>
              <small>IN YOUR WORKSPACE</small>
            </article>
            <article className="stat-panel">
              <span className="stat-label">TOTAL TASKS</span>
              <strong>{totalTasks.toString().padStart(2, "0")}</strong>
              <small>ACROSS ALL PROJECTS</small>
            </article>
            <article className="stat-panel">
              <span className="stat-label">TASKS COMPLETED</span>
              <strong>{completedTasks.toString().padStart(2, "0")}</strong>
              <small>
                {totalTasks
                  ? `${Math.round((completedTasks / totalTasks) * 100)}% COMPLETION`
                  : "NO TASKS RECORDED"}
              </small>
            </article>
          </section>

          <section className="projects-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">DIRECTORY / 01</p>
                <h2>Your projects</h2>
              </div>
              <span className="record-count">
                {filteredProjects.length} RECORDS
              </span>
            </div>

            <div className="project-toolbar">
              <div className="search-field">
                <Search size={17} />
                <input
                  type="search"
                  placeholder="Search projects..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search projects"
                />
                <kbd>CTRL F</kbd>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void loadProjects()}
                disabled={loading}
              >
                {loading ? "LOADING..." : "↻ REFRESH"}
              </button>
            </div>

            {loading ? (
              <div className="empty-state">READING PROJECT DATABASE...</div>
            ) : filteredProjects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FolderKanban size={25} />
                </div>
                <h3>{search ? "NO MATCHING PROJECTS" : "NO PROJECTS FOUND"}</h3>
                <p>
                  {search
                    ? "Try a different search term."
                    : "Create your first project to start mapping its deadlines."}
                </p>
                {!search && (
                  <button type="button" onClick={openCreate}>
                    <Plus size={16} /> CREATE FIRST PROJECT
                  </button>
                )}
              </div>
            ) : (
              <div className="project-list">
                {filteredProjects.map((project, index) => {
                  const taskCount = Number(project.task_count ?? 0);
                  const done = Number(project.completed_count ?? 0);
                  const progress = taskCount
                    ? Math.round((done / taskCount) * 100)
                    : 0;

                  return (
                    <article
                      className="project-card"
                      key={project.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open tasks for ${project.name}`}
                      onClick={() => navigate(`/projects/${project.id}`)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;

                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          navigate(`/projects/${project.id}`);
                        }
                      }}
                    >
                      <div className="project-index">
                        {(index + 1).toString().padStart(2, "0")}
                      </div>

                      <div className="project-card-main">
                        <div className="project-card-heading">
                          <h3>{project.name}</h3>
                          <span className="project-id">ID: {project.id}</span>
                        </div>
                        <p className="project-description">
                          {project.description || "NO DESCRIPTION PROVIDED"}
                        </p>

                        <div className="project-progress">
                          <div className="progress-track">
                            <div
                              className="progress-fill"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span>{progress}%</span>
                        </div>

                        <div className="project-meta">
                          <span>
                            <CalendarDays size={14} />
                            {formatDate(project.deadline)}
                          </span>
                          <span>{taskCount} TASKS</span>
                          <span>{done} COMPLETED</span>
                        </div>
                      </div>

                      <div
                        className="project-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="icon-button"
                          title="Edit project"
                          aria-label={`Edit ${project.name}`}
                          onClick={() => openEdit(project)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger-button"
                          title="Delete project"
                          aria-label={`Delete ${project.name}`}
                          onClick={() => void deleteProject(project)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <footer className="dashboard-footer">
            <span className="creator-credit">MADE BY <strong>AARAV SADHU</strong></span>
            <nav className="creator-links" aria-label="Creator links">
              <a
                href="https://github.com/aarav2pf"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub profile (opens in a new tab)"
              >
                GitHub ↗
              </a>
              <a
                href="https://www.linkedin.com/in/aarav-sadhu-a33837275/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn profile (opens in a new tab)"
              >
                LinkedIn ↗
              </a>
            </nav>
          </footer>
        </div>
      </section>

      {modalOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setModalOpen(false);
            }
          }}
        >
          <section
            className="project-modal"
            ref={projectModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-modal-title"
            tabIndex={-1}
          >
            <header className="window-titlebar">
              <span>{editing ? "EDIT_PROJECT.exe" : "NEW_PROJECT.exe"}</span>
              <button
                type="button"
                className="modal-close"
                aria-label="Close modal"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                <X size={17} />
              </button>
            </header>

            <form onSubmit={saveProject} className="project-form">
              <p className="eyebrow">PROJECT CONFIGURATION / 01</p>
              <h2 id="project-modal-title">
                {editing ? "Edit project." : "Create a project."}
              </h2>

              <label>
                PROJECT NAME *
                <input
                  autoFocus
                  maxLength={150}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="e.g. Semester project"
                  required
                />
              </label>

              <label>
                DESCRIPTION
                <textarea
                  maxLength={5000}
                  rows={3}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="What are you working towards?"
                />
              </label>

              <label>
                TARGET DEADLINE
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(event) =>
                    setForm({ ...form, deadline: event.target.value })
                  }
                />
              </label>

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  CANCEL
                </button>
                <button type="submit" disabled={saving}>
                  {saving
                    ? "SAVING..."
                    : editing
                      ? "SAVE CHANGES"
                      : "CREATE PROJECT →"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
