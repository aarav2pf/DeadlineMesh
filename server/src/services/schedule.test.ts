
import test from "node:test";
import assert from "node:assert/strict";

import { calculateCriticalPath } from "./criticalPath";
import { simulateTaskDelay } from "./whatIfSimulation";
import { analyzeScheduleRisk } from "./scheduleRisk";

const parallelTasks = [
  {
    id: 1,
    name: "Design",
    duration: 2,
    status: "Pending" as const,
    dependencies: [],
  },
  {
    id: 2,
    name: "Development",
    duration: 3,
    status: "Pending" as const,
    dependencies: [1],
  },
  {
    id: 3,
    name: "Documentation",
    duration: 2,
    status: "Pending" as const,
    dependencies: [],
  },
];

test("calculates duration for dependent and parallel tasks", () => {
  const result = calculateCriticalPath(parallelTasks);

  // Design + Development takes 5 days; Documentation takes 2.
  assert.equal(result.project_duration, 5);

  const design = result.tasks.find((task) => task.task_id === 1)!;
  const development = result.tasks.find((task) => task.task_id === 2)!;
  const documentation = result.tasks.find((task) => task.task_id === 3)!;

  assert.equal(design.earliest_start, 0);
  assert.equal(design.earliest_finish, 2);
  assert.equal(development.earliest_start, 2);
  assert.equal(development.earliest_finish, 5);

  assert.equal(design.is_critical, true);
  assert.equal(development.is_critical, true);
  assert.equal(documentation.is_critical, false);
  assert.equal(documentation.slack, 3);
});

test("supports multiple equally critical paths", () => {
  const tasks = [
    {
      id: 1,
      name: "Path A",
      duration: 2,
      status: "Pending" as const,
      dependencies: [],
    },
    {
      id: 2,
      name: "Path A finish",
      duration: 2,
      status: "Pending" as const,
      dependencies: [1],
    },
    {
      id: 3,
      name: "Path B",
      duration: 4,
      status: "Pending" as const,
      dependencies: [],
    },
  ];

  const result = calculateCriticalPath(tasks);

  assert.equal(result.project_duration, 4);
  assert.equal(
    result.tasks.filter((task) => task.is_critical).length,
    3,
  );

  // The API returns one representative path, but all zero-slack
  // tasks must still be identified as critical.
  assert.ok(result.critical_path.length > 0);
});

test("handles an empty project", () => {
  const result = calculateCriticalPath([]);

  assert.equal(result.project_duration, 0);
  assert.deepEqual(result.critical_path, []);
  assert.deepEqual(result.tasks, []);
});

test("rejects circular dependencies", () => {
  const tasks = [
    {
      id: 1,
      name: "Task A",
      duration: 2,
      status: "Pending" as const,
      dependencies: [2],
    },
    {
      id: 2,
      name: "Task B",
      duration: 2,
      status: "Pending" as const,
      dependencies: [1],
    },
  ];

  assert.throws(
    () => calculateCriticalPath(tasks),
    /circular dependencies/,
  );
});

test("rejects missing dependencies", () => {
  const tasks = [
    {
      id: 1,
      name: "Task A",
      duration: 2,
      status: "Pending" as const,
      dependencies: [999],
    },
  ];

  assert.throws(
    () => calculateCriticalPath(tasks),
    /invalid dependency/i,
  );
});

test("rejects self-dependencies", () => {
  const tasks = [
    {
      id: 1,
      name: "Task A",
      duration: 2,
      status: "Pending" as const,
      dependencies: [1],
    },
  ];

  assert.throws(
    () => calculateCriticalPath(tasks),
    /cannot depend on itself/i,
  );
});

test("simulates a delay without modifying original tasks", () => {
  const tasks = parallelTasks.map((task) => ({ ...task }));
  const originalDurations = tasks.map((task) => task.duration);

  const result = simulateTaskDelay(tasks, 1, 2);

  assert.equal(result.original_project_duration, 5);
  assert.equal(result.simulated_project_duration, 7);
  assert.equal(result.project_delay, 2);
  assert.deepEqual(
    tasks.map((task) => task.duration),
    originalDurations,
  );
});

test("rejects invalid simulation inputs", () => {
  assert.throws(
    () => simulateTaskDelay(parallelTasks, 1, 0),
    /between 1 and 365 days/i,
  );

  assert.throws(
    () => simulateTaskDelay(parallelTasks, 999, 1),
    /does not exist/i,
  );
});

test("classifies blocked unfinished tasks as high risk", () => {
  const tasks = [
    {
      id: 1,
      name: "Prerequisite",
      duration: 2,
      status: "Pending" as const,
      dependencies: [],
    },
    {
      id: 2,
      name: "Dependent task",
      duration: 1,
      status: "Pending" as const,
      dependencies: [1],
    },
    {
      id: 3,
      name: "Independent task",
      duration: 1,
      status: "Pending" as const,
      dependencies: [],
    },
  ];

  const result = analyzeScheduleRisk(tasks);

  assert.equal(result.project_duration, 3);
  assert.equal(result.summary.blocked_tasks, 1);

  const dependent = result.tasks.find((task) => task.id === 2)!;
  assert.equal(dependent.risk_level, "High");
  assert.deepEqual(dependent.blocked_by, [1]);
});

test("does not mark completed tasks as blocked", () => {
  const tasks = [
    {
      id: 1,
      name: "Prerequisite",
      duration: 1,
      status: "Pending" as const,
      dependencies: [],
    },
    {
      id: 2,
      name: "Completed dependent",
      duration: 1,
      status: "Completed" as const,
      dependencies: [1],
    },
  ];

  const result = analyzeScheduleRisk(tasks);
  const completed = result.tasks.find((task) => task.id === 2)!;

  assert.deepEqual(completed.blocked_by, []);
  assert.equal(completed.risk_level, "Low");
});
