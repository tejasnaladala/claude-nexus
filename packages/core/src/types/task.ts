export type TaskStatus =
  | "submitted"
  | "decomposing"
  | "queued"
  | "assigned"
  | "in_progress"
  | "review"
  | "debating"
  | "revision"
  | "approved"
  | "completed"
  | "failed"
  | "abandoned";

export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface TaskSubmission {
  readonly title: string;
  readonly description: string;
  readonly priority: TaskPriority;
  readonly skillsRequired: readonly string[];
  readonly constraints?: string;
  readonly parentTaskId?: string;
  readonly autoReview: boolean;
  readonly artifacts?: readonly Artifact[];
}

export interface TaskRecord {
  readonly taskId: string;
  readonly title: string;
  readonly description: string;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly skillsRequired: readonly string[];
  readonly constraints?: string;
  readonly parentTaskId?: string;
  readonly subtaskIds: readonly string[];
  readonly assignedAgentId?: string;
  readonly submittedBy: string;
  readonly autoReview: boolean;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly artifacts: readonly Artifact[];
  readonly result?: TaskResult;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastUpdateAt: number;
}

export interface TaskResult {
  readonly taskId: string;
  readonly result: string;
  readonly artifacts: readonly Artifact[];
  readonly confidence: number;
  readonly executionTimeMs: number;
  readonly notes?: string;
  readonly submittedBy: string;
  readonly submittedAt: number;
}

export interface Artifact {
  readonly name: string;
  readonly type: "file" | "code" | "data" | "image";
  readonly content: string;
  readonly encoding: "utf-8" | "base64";
  readonly size: number;
  readonly hash: string;
}

export interface SubtaskDefinition {
  readonly title: string;
  readonly description: string;
  readonly skillsRequired: readonly string[];
  readonly dependsOn: readonly string[];
  readonly estimatedMinutes: number;
}
