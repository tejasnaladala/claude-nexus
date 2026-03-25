import type {
  TaskRecord,
  TaskSubmission,
  TaskResult,
  TaskStatus,
  TaskPriority,
} from "@claude-nexus/core";
import { generateTaskId } from "@claude-nexus/core";
import {
  MAX_TASK_RETRIES,
  TASK_STALE_TIMEOUT_MS,
} from "@claude-nexus/core";
import { tokenize, jaccardSimilarity } from "@claude-nexus/core";
import type { AgentRegistry } from "./agent-registry.js";
import type { MemoryStore } from "./memory-store.js";

export class TaskEngine {
  private readonly tasks = new Map<string, TaskRecord>();

  constructor(
    private readonly agentRegistry: AgentRegistry,
    private readonly memoryStore: MemoryStore,
  ) {}

  submit(submission: TaskSubmission, submittedBy: string): TaskRecord {
    const taskId = generateTaskId();
    const now = Date.now();

    const record: TaskRecord = {
      taskId,
      title: submission.title,
      description: submission.description,
      priority: submission.priority,
      status: "queued",
      skillsRequired: [...submission.skillsRequired],
      constraints: submission.constraints,
      parentTaskId: submission.parentTaskId,
      subtaskIds: [],
      assignedAgentId: undefined,
      submittedBy,
      autoReview: submission.autoReview,
      retryCount: 0,
      maxRetries: MAX_TASK_RETRIES,
      artifacts: submission.artifacts ? [...submission.artifacts] : [],
      createdAt: now,
      updatedAt: now,
      lastUpdateAt: now,
    };

    this.tasks.set(taskId, record);
    this.persistTask(record);
    return record;
  }

  get(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  getAll(): TaskRecord[] {
    return Array.from(this.tasks.values());
  }

  getByStatus(status: TaskStatus): TaskRecord[] {
    return this.getAll().filter((t) => t.status === status);
  }

  getByAgent(agentId: string): TaskRecord[] {
    return this.getAll().filter((t) => t.assignedAgentId === agentId);
  }

  getAvailable(): TaskRecord[] {
    return this.getByStatus("queued").sort((a, b) => {
      const priorityOrder: Record<TaskPriority, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  assign(taskId: string, agentId: string, _reason: string): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "queued") return undefined;

    const updated: TaskRecord = {
      ...task,
      status: "assigned",
      assignedAgentId: agentId,
      updatedAt: Date.now(),
      lastUpdateAt: Date.now(),
    };

    this.tasks.set(taskId, updated);
    this.agentRegistry.addActiveTask(agentId, taskId);
    this.persistTask(updated);
    return updated;
  }

  claim(taskId: string, agentId: string): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "queued") return undefined;

    const updated: TaskRecord = {
      ...task,
      status: "in_progress",
      assignedAgentId: agentId,
      updatedAt: Date.now(),
      lastUpdateAt: Date.now(),
    };

    this.tasks.set(taskId, updated);
    this.agentRegistry.addActiveTask(agentId, taskId);
    this.persistTask(updated);
    return updated;
  }

  acceptAssignment(taskId: string): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "assigned") return undefined;

    const updated: TaskRecord = {
      ...task,
      status: "in_progress",
      updatedAt: Date.now(),
      lastUpdateAt: Date.now(),
    };

    this.tasks.set(taskId, updated);
    this.persistTask(updated);
    return updated;
  }

  submitResult(taskId: string, result: TaskResult): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "in_progress") return undefined;

    const shouldReview =
      task.autoReview && result.confidence < 0.8;

    const updated: TaskRecord = {
      ...task,
      status: shouldReview ? "review" : "approved",
      result,
      updatedAt: Date.now(),
      lastUpdateAt: Date.now(),
    };

    this.tasks.set(taskId, updated);
    this.persistTask(updated);
    return updated;
  }

  approve(taskId: string): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task || (task.status !== "review" && task.status !== "debating")) {
      return undefined;
    }

    const updated: TaskRecord = {
      ...task,
      status: "completed",
      updatedAt: Date.now(),
      lastUpdateAt: Date.now(),
    };

    this.tasks.set(taskId, updated);
    if (task.assignedAgentId) {
      this.agentRegistry.removeActiveTask(task.assignedAgentId, taskId);
    }
    this.persistTask(updated);
    return updated;
  }

  complete(taskId: string): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "approved") return undefined;

    const updated: TaskRecord = {
      ...task,
      status: "completed",
      updatedAt: Date.now(),
      lastUpdateAt: Date.now(),
    };

    this.tasks.set(taskId, updated);
    if (task.assignedAgentId) {
      this.agentRegistry.removeActiveTask(task.assignedAgentId, taskId);
    }
    this.persistTask(updated);
    return updated;
  }

  fail(taskId: string): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const canRetry = task.retryCount < task.maxRetries;
    const updated: TaskRecord = {
      ...task,
      status: canRetry ? "queued" : "abandoned",
      retryCount: task.retryCount + 1,
      assignedAgentId: undefined,
      updatedAt: Date.now(),
      lastUpdateAt: Date.now(),
    };

    this.tasks.set(taskId, updated);
    if (task.assignedAgentId) {
      this.agentRegistry.removeActiveTask(task.assignedAgentId, taskId);
    }
    this.persistTask(updated);
    return updated;
  }

  reassign(taskId: string, _reason: string): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    if (task.assignedAgentId) {
      this.agentRegistry.removeActiveTask(task.assignedAgentId, taskId);
    }

    const updated: TaskRecord = {
      ...task,
      status: "queued",
      assignedAgentId: undefined,
      updatedAt: Date.now(),
      lastUpdateAt: Date.now(),
    };

    this.tasks.set(taskId, updated);
    this.persistTask(updated);
    return updated;
  }

  setStatus(taskId: string, status: TaskStatus): TaskRecord | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const updated: TaskRecord = {
      ...task,
      status,
      updatedAt: Date.now(),
      lastUpdateAt: Date.now(),
    };

    this.tasks.set(taskId, updated);
    this.persistTask(updated);
    return updated;
  }

  autoAssignQueued(): Array<{ taskId: string; agentId: string; reason: string }> {
    const assignments: Array<{ taskId: string; agentId: string; reason: string }> = [];
    const queued = this.getAvailable();

    for (const task of queued) {
      const bestAgent = this.agentRegistry.findBestForSkills([...task.skillsRequired]);
      if (bestAgent) {
        this.assign(task.taskId, bestAgent.agentId, "auto-assigned by skill match");
        assignments.push({
          taskId: task.taskId,
          agentId: bestAgent.agentId,
          reason: `Skill match: ${bestAgent.skills.join(", ")}`,
        });
      }
    }

    return assignments;
  }

  detectStaleTasks(): TaskRecord[] {
    const now = Date.now();
    const stale: TaskRecord[] = [];

    for (const task of this.tasks.values()) {
      if (
        (task.status === "in_progress" || task.status === "assigned") &&
        now - task.lastUpdateAt > TASK_STALE_TIMEOUT_MS
      ) {
        stale.push(task);
      }
    }

    return stale;
  }

  isDuplicate(submission: TaskSubmission): boolean {
    const activeTasks = this.getAll().filter(
      (t) => t.status !== "completed" && t.status !== "abandoned",
    );

    for (const existing of activeTasks) {
      if (existing.title === submission.title) return true;

      const similarity = jaccardSimilarity(
        tokenize(existing.description),
        tokenize(submission.description),
      );
      if (similarity > 0.85) return true;
    }

    return false;
  }

  private persistTask(task: TaskRecord): void {
    this.memoryStore.saveTask(
      task.taskId,
      task as unknown as Record<string, unknown>,
      task.status,
    );
  }

  get size(): number {
    return this.tasks.size;
  }
}
