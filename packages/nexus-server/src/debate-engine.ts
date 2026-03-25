import type {
  DebateConfig,
  DebateSession,
  Argument,
  Rebuttal,
  Verdict,
  DebateOutcome,
} from "@claude-nexus/core";
import { generateDebateId, generateId } from "@claude-nexus/core";
import {
  DEBATE_MAX_ROUNDS,
  DEBATE_ROUND_TIMEOUT_MS,
  DEBATE_CONSENSUS_THRESHOLD,
} from "@claude-nexus/core";
import type { MemoryStore } from "./memory-store.js";

export class DebateEngine {
  private readonly sessions = new Map<string, DebateSession>();

  constructor(private readonly memoryStore: MemoryStore) {}

  initiate(config: DebateConfig): DebateSession {
    const debateId = generateDebateId();
    const now = Date.now();

    const session: DebateSession = {
      debateId,
      config: {
        ...config,
        maxRounds: config.maxRounds || DEBATE_MAX_ROUNDS,
        timeoutPerRoundMs: config.timeoutPerRoundMs || DEBATE_ROUND_TIMEOUT_MS,
        consensusThreshold: config.consensusThreshold || DEBATE_CONSENSUS_THRESHOLD,
      },
      arguments: [],
      rebuttals: [],
      currentRound: 1,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(debateId, session);
    this.persistDebate(session);
    return session;
  }

  get(debateId: string): DebateSession | undefined {
    return this.sessions.get(debateId);
  }

  getActive(): DebateSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === "active",
    );
  }

  submitArgument(
    debateId: string,
    agentId: string,
    position: string,
    reasoning: string,
    evidence: string[],
    confidence: number,
  ): Argument | undefined {
    const session = this.sessions.get(debateId);
    if (!session || session.status !== "active") return undefined;

    if (!session.config.participants.includes(agentId)) return undefined;

    const argument: Argument = {
      argumentId: generateId(),
      agentId,
      position,
      reasoning,
      evidence: [...evidence],
      confidence,
      round: session.currentRound,
      createdAt: Date.now(),
    };

    const updated: DebateSession = {
      ...session,
      arguments: [...session.arguments, argument],
      updatedAt: Date.now(),
    };

    this.sessions.set(debateId, updated);
    this.persistDebate(updated);

    // Check if all participants have argued this round
    this.maybeAdvanceRound(debateId);

    return argument;
  }

  submitRebuttal(
    debateId: string,
    agentId: string,
    targetArgumentId: string,
    counterpoints: string[],
    suggestedAlternative: string | undefined,
    confidence: number,
  ): Rebuttal | undefined {
    const session = this.sessions.get(debateId);
    if (!session || session.status !== "active") return undefined;

    const rebuttal: Rebuttal = {
      rebuttalId: generateId(),
      agentId,
      targetArgumentId,
      counterpoints: [...counterpoints],
      suggestedAlternative,
      confidence,
      round: session.currentRound,
      createdAt: Date.now(),
    };

    const updated: DebateSession = {
      ...session,
      rebuttals: [...session.rebuttals, rebuttal],
      updatedAt: Date.now(),
    };

    this.sessions.set(debateId, updated);
    this.persistDebate(updated);
    return rebuttal;
  }

  evaluate(debateId: string): Verdict | undefined {
    const session = this.sessions.get(debateId);
    if (!session) return undefined;

    const args = session.arguments;
    if (args.length === 0) return undefined;

    // Aggregate positions by confidence-weighted votes
    const positions = new Map<
      string,
      { totalConfidence: number; count: number; agents: string[] }
    >();

    for (const arg of args) {
      const existing = positions.get(arg.position) || {
        totalConfidence: 0,
        count: 0,
        agents: [],
      };
      existing.totalConfidence += arg.confidence;
      existing.count += 1;
      existing.agents.push(arg.agentId);
      positions.set(arg.position, existing);
    }

    // Build votes record
    const votes: Record<string, { position: string; confidence: number }> = {};
    for (const arg of args) {
      // Use the latest argument from each agent
      votes[arg.agentId] = {
        position: arg.position,
        confidence: arg.confidence,
      };
    }

    let outcome: DebateOutcome;
    let winningPosition: string;
    let reasoning: string;

    // Check for unanimous consensus
    if (positions.size === 1) {
      const [pos] = positions.keys();
      outcome = "consensus";
      winningPosition = pos;
      reasoning = "All participants agreed on the same position.";
    } else {
      // Check for weighted majority
      const totalWeight = Array.from(positions.values()).reduce(
        (sum, p) => sum + p.totalConfidence,
        0,
      );

      let majorityFound = false;
      for (const [pos, stats] of positions) {
        if (stats.totalConfidence / totalWeight >= session.config.consensusThreshold) {
          outcome = "majority";
          winningPosition = pos;
          reasoning = `Position reached ${Math.round(
            (stats.totalConfidence / totalWeight) * 100,
          )}% confidence-weighted agreement (threshold: ${
            session.config.consensusThreshold * 100
          }%).`;
          majorityFound = true;
          break;
        }
      }

      if (!majorityFound) {
        // Tiebreak: highest total confidence wins
        let best = { position: "", confidence: -1 };
        for (const [pos, stats] of positions) {
          if (stats.totalConfidence > best.confidence) {
            best = { position: pos, confidence: stats.totalConfidence };
          }
        }
        outcome = "tiebreak";
        winningPosition = best.position;
        reasoning = `No consensus reached. Tiebreak awarded to highest confidence position.`;
      }
    }

    const verdict: Verdict = {
      debateId,
      outcome: outcome!,
      winningPosition: winningPosition!,
      reasoning: reasoning!,
      votes,
      round: session.currentRound,
      resolvedAt: Date.now(),
    };

    const updated: DebateSession = {
      ...session,
      status: "resolved",
      verdict,
      updatedAt: Date.now(),
    };

    this.sessions.set(debateId, updated);
    this.persistDebate(updated);
    return verdict;
  }

  checkTimeout(debateId: string): boolean {
    const session = this.sessions.get(debateId);
    if (!session || session.status !== "active") return false;

    const elapsed = Date.now() - session.updatedAt;
    return elapsed > session.config.timeoutPerRoundMs;
  }

  getHistory(debateId: string): DebateSession | undefined {
    return this.sessions.get(debateId);
  }

  private maybeAdvanceRound(debateId: string): void {
    const session = this.sessions.get(debateId);
    if (!session || session.status !== "active") return;

    // Check if all participants have argued in the current round
    const currentRoundArgs = session.arguments.filter(
      (a) => a.round === session.currentRound,
    );
    const participantsArgued = new Set(currentRoundArgs.map((a) => a.agentId));
    const allParticipated = session.config.participants.every((p) =>
      participantsArgued.has(p),
    );

    if (allParticipated) {
      if (session.currentRound >= session.config.maxRounds) {
        // Max rounds reached — auto-evaluate
        this.evaluate(debateId);
      } else {
        // Advance to next round
        const updated: DebateSession = {
          ...session,
          currentRound: session.currentRound + 1,
          updatedAt: Date.now(),
        };
        this.sessions.set(debateId, updated);
        this.persistDebate(updated);
      }
    }
  }

  private persistDebate(session: DebateSession): void {
    this.memoryStore.saveDebate(
      session.debateId,
      session as unknown as Record<string, unknown>,
      session.status,
    );
  }

  get size(): number {
    return this.sessions.size;
  }
}
