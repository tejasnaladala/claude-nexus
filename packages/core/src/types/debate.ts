export type DebateTrigger = "manual" | "auto_review" | "conflict" | "high_stakes";
export type DebateOutcome = "consensus" | "majority" | "tiebreak" | "timeout";

export interface DebateConfig {
  readonly topic: string;
  readonly context: string;
  readonly taskId?: string;
  readonly participants: readonly string[];
  readonly maxRounds: number;
  readonly timeoutPerRoundMs: number;
  readonly consensusThreshold: number;
  readonly triggerType: DebateTrigger;
}

export interface DebateSession {
  readonly debateId: string;
  readonly config: DebateConfig;
  readonly arguments: readonly Argument[];
  readonly rebuttals: readonly Rebuttal[];
  readonly currentRound: number;
  readonly status: "active" | "evaluating" | "resolved";
  readonly verdict?: Verdict;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface Argument {
  readonly argumentId: string;
  readonly agentId: string;
  readonly position: string;
  readonly reasoning: string;
  readonly evidence: readonly string[];
  readonly confidence: number;
  readonly round: number;
  readonly createdAt: number;
}

export interface Rebuttal {
  readonly rebuttalId: string;
  readonly agentId: string;
  readonly targetArgumentId: string;
  readonly counterpoints: readonly string[];
  readonly suggestedAlternative?: string;
  readonly confidence: number;
  readonly round: number;
  readonly createdAt: number;
}

export interface Verdict {
  readonly debateId: string;
  readonly outcome: DebateOutcome;
  readonly winningPosition: string;
  readonly reasoning: string;
  readonly votes: Readonly<Record<string, { readonly position: string; readonly confidence: number }>>;
  readonly round: number;
  readonly resolvedAt: number;
}
