
import {
  calculateCriticalPath,
  type CriticalPathTask,
} from "./criticalPath";

export type RiskLevel = "High" | "Medium" | "Low";

export interface ScheduleRiskTask extends CriticalPathTask {
  risk_level: RiskLevel;
  risk_reasons: string[];
  blocked_by: number[];
  slack: number;
  is_critical: boolean;
}

export interface ScheduleRiskResult {
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

export function analyzeScheduleRisk(
  inputTasks: CriticalPathTask[]
): ScheduleRiskResult {
  const analysis = calculateCriticalPath(inputTasks);

  const taskMap = new Map(inputTasks.map((task) => [task.id, task]));
  const scheduleMap = new Map(
    analysis.tasks.map((task) => [task.task_id, task])
  );

  const tasks: ScheduleRiskTask[] = inputTasks.map((task) => {
    const schedule = scheduleMap.get(task.id)!;

    // A task is blocked if any prerequisite is not completed.
    // Completed tasks are never considered blocked.
const blockedBy =
  task.status === "Completed"
    ? []
    : task.dependencies.filter((dependencyId) => {
        const dependency = taskMap.get(dependencyId);
        return dependency !== undefined && dependency.status !== "Completed";
      });

    const unfinished = task.status !== "Completed";
    const reasons: string[] = [];

    if (blockedBy.length > 0 && unfinished) {
      reasons.push("Waiting for unfinished prerequisite tasks.");
    }

    if (schedule.is_critical && unfinished) {
      reasons.push("Critical-path task: a delay may delay the project.");
    }

    if (schedule.slack === 0 && unfinished) {
      reasons.push("No scheduling slack available.");
    } else if (schedule.slack > 0 && schedule.slack <= 1 && unfinished) {
      reasons.push("Only one day or less of scheduling slack.");
    }

    let riskLevel: RiskLevel = "Low";

    if (
      unfinished &&
      (blockedBy.length > 0 || schedule.is_critical)
    ) {
      riskLevel = "High";
    } else if (unfinished && schedule.slack <= 1) {
      riskLevel = "Medium";
    }

    if (!unfinished) {
      reasons.length = 0;
      reasons.push("Task completed.");
    }

    return {
      ...task,
      risk_level: riskLevel,
      risk_reasons: reasons,
      blocked_by: blockedBy,
      slack: schedule.slack,
      is_critical: schedule.is_critical,
    };
  });

  return {
    project_duration: analysis.project_duration,
    summary: {
      high_risk: tasks.filter((task) => task.risk_level === "High").length,
      medium_risk: tasks.filter((task) => task.risk_level === "Medium").length,
      low_risk: tasks.filter((task) => task.risk_level === "Low").length,
      blocked_tasks: tasks.filter((task) => task.blocked_by.length > 0 &&
        task.status !== "Completed").length,
      critical_tasks: tasks.filter((task) => task.is_critical).length,
    },
    tasks,
  };
}
