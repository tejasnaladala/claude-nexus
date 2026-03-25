import type { AgentRuntime } from "@claude-nexus/agent-runtime";
import { queryNexus } from "./status.js";

export function createSubmitTaskTool(runtime: AgentRuntime) {
  return {
    name: "nexus_submit_task",
    description: "Submit a new task for the multi-agent system to work on",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Detailed task description" },
        priority: { type: "string", enum: ["critical", "high", "medium", "low"], description: "Task priority" },
        skills_required: { type: "array", items: { type: "string" }, description: "Required skills" },
        constraints: { type: "string", description: "Any constraints" },
      },
      required: ["title", "description"],
    },
    handler: async (args: { title: string; description: string; priority?: string; skills_required?: string[]; constraints?: string }) => {
      const sent = runtime.sendMessage("task.submit", "nexus", {
        title: args.title,
        description: args.description,
        priority: args.priority || "medium",
        skillsRequired: args.skills_required || [],
        constraints: args.constraints,
        autoReview: true,
      });
      return {
        content: [{
          type: "text" as const,
          text: sent
            ? `✅ Task submitted: "${args.title}". The nexus will auto-assign it to the best available agent based on skill match.`
            : "❌ Failed to submit task — not connected to nexus.",
        }],
      };
    },
  };
}

export function createClaimTaskTool(runtime: AgentRuntime) {
  return {
    name: "nexus_claim_task",
    description: "Claim an available task from the queue",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID to claim" },
        estimated_duration: { type: "string", description: "Estimated time to complete" },
      },
      required: ["task_id"],
    },
    handler: async (args: { task_id: string; estimated_duration?: string }) => {
      runtime.addActiveTask(args.task_id);
      const sent = runtime.sendMessage("task.claimed", "nexus", {
        taskId: args.task_id,
        estimatedDuration: args.estimated_duration,
      });
      return {
        content: [{
          type: "text" as const,
          text: sent
            ? `✅ Task ${args.task_id} claimed. You are now working on it.`
            : "❌ Failed to claim task — not connected to nexus.",
        }],
      };
    },
  };
}

export function createSubmitResultTool(runtime: AgentRuntime) {
  return {
    name: "nexus_submit_result",
    description: "Submit the result of a completed task",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID" },
        result: { type: "string", description: "The work product" },
        artifacts: { type: "array", items: { type: "string" }, description: "File paths of created artifacts" },
        confidence: { type: "number", description: "Confidence in the result (0-1)" },
      },
      required: ["task_id", "result"],
    },
    handler: async (args: { task_id: string; result: string; artifacts?: string[]; confidence?: number }) => {
      runtime.removeActiveTask(args.task_id);
      const sent = runtime.sendMessage("task.result", "nexus", {
        taskId: args.task_id,
        result: args.result,
        artifacts: (args.artifacts || []).map(a => ({ name: a, type: "file", content: "", encoding: "utf-8", size: 0, hash: "" })),
        confidence: args.confidence ?? 0.9,
        executionTimeMs: 0,
      });
      return {
        content: [{
          type: "text" as const,
          text: sent
            ? `✅ Result submitted for task ${args.task_id}. ${args.confidence && args.confidence < 0.8 ? "⚠️ Low confidence — debate may be triggered." : "Awaiting approval."}`
            : "❌ Failed to submit result — not connected to nexus.",
        }],
      };
    },
  };
}

export function createGetTaskQueueTool(runtime: AgentRuntime) {
  return {
    name: "nexus_get_task_queue",
    description: "View all tasks and their current status. Use filter 'mine' to see only your tasks, 'available' for unclaimed tasks, or 'all' for everything.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filter: { type: "string", enum: ["all", "available", "mine", "in_review"], description: "Filter tasks" },
      },
    },
    handler: async (args: { filter?: string }) => {
      const filter = args.filter || "all";
      const raw = await queryNexus(runtime, "__nexus_query_tasks", { filter });

      try {
        const data = JSON.parse(raw);
        const tasks = data.tasks || [];

        if (tasks.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `📋 No tasks found (filter: ${filter}). Submit a task with nexus_submit_task.`,
            }],
          };
        }

        let text = `📋 Task Queue (filter: ${filter}) — ${tasks.length} task(s):\n\n`;
        for (const t of tasks) {
          const assigned = t.assignedAgentId ? `→ ${t.assignedAgentId}` : "unassigned";
          text += `• [${t.status.toUpperCase()}] ${t.title}\n`;
          text += `  ID: ${t.taskId}\n`;
          text += `  Priority: ${t.priority} | Skills: ${(t.skillsRequired || []).join(", ") || "any"} | ${assigned}\n\n`;
        }

        return { content: [{ type: "text" as const, text }] };
      } catch {
        return {
          content: [{
            type: "text" as const,
            text: "Failed to parse task queue response. Raw: " + raw,
          }],
        };
      }
    },
  };
}
