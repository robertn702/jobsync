import { z } from "zod";
import type { DescriptionCompleteness } from "@/models/job.model";

// RESUME REVIEW SCORES SCHEMA
// The review body is free-form markdown; only the four scores are structured
// (they drive the radial chart and score grid).

export const ResumeScoresSchema = z.object({
  overall: z.number().min(0).max(100),
  impact: z.number().min(0).max(100),
  clarity: z.number().min(0).max(100),
  atsCompatibility: z.number().min(0).max(100),
});

export type ResumeScores = z.infer<typeof ResumeScoresSchema>;

// Persisted shape stored in Resume.reviewData (JSON string).
export type ResumeReviewData = ResumeScores & {
  body: string;
  reviewedAt?: string;
  provider?: string;
  model?: string;
  // Which surface produced it. Optional: rows written before this existed
  // simply do not have it, and ReviewDetails ignores it.
  surface?: string;
};

// JOB MATCH TYPES
// The match analysis is free-form markdown; only the score + recommendation are
// machine-readable (they drive the radial chart, jobs-table sorting, and the
// automation match threshold). Parsed from the leading `SCORES:` line.

export type JobMatchRecommendation =
  | "strong match"
  | "good match"
  | "partial match"
  | "weak match";

export type JobMatchScores = {
  matchScore: number;
  recommendation: JobMatchRecommendation;
};

// Parsed stream result (scores + markdown body).
export type JobMatchResult = {
  scores?: JobMatchScores;
  body: string;
};

export const JOB_EVALUATION_LANES = [
  "fde",
  "frontend_fullstack",
  "applied_ai",
  "product_devex",
  "other",
] as const;

export const JOB_PURSUIT_PRIORITIES = ["top", "normal", "low", "skip"] as const;

export type JobEvaluationLane = (typeof JOB_EVALUATION_LANES)[number];
export type JobPursuitPriority = (typeof JOB_PURSUIT_PRIORITIES)[number];

export type JobEvaluationHardGates = {
  version: "v1";
  compensation_below_floor: boolean;
  excessive_travel: boolean;
  geography_incompatible: boolean;
  people_or_autonomy_hard_no: boolean;
  unsustainable_balance: boolean;
  stale_or_uninteresting_domain: boolean;
  structural_role_stack_mismatch: boolean;
};

export type StructuredJobEvaluation = {
  evaluatorKey: "goal160";
  lane: JobEvaluationLane;
  fitScore: number;
  pursuitPriority: JobPursuitPriority;
  criteriaVersion: string;
  hardGates: JobEvaluationHardGates;
  dimensionScores: Record<string, number>;
  evaluatorDefinitionHash: string;
  inputHash: string;
  resultHash: string;
  evaluatedAt: string;
};

// Lexical pre-rank breakdown persisted next to the LLM verdict (tuning signal).
export type PrerankComponents = {
  titleScore: number;
  keywordScore: number;
  locScore: number;
  titleHits: string[]; // target-title tokens that matched
  keywordHits: string[]; // distinct keyword/skill terms that matched
};

// Persisted shape stored in Job.matchData (JSON string).
export type JobMatchData = JobMatchScores & {
  body: string;
  resumeId?: string;
  resumeTitle?: string;
  matchedAt?: string;
  provider?: string;
  model?: string;
  // Which surface produced it. Optional: rows written before this existed
  // simply do not have it, and MatchDetails ignores it.
  surface?: string;
  // Greenhouse-specific
  prerankScore?: number; // raw lexical score (internal sort only; NOT shown as %)
  analyzed?: boolean; // true once LLM match has run (auto top-K or on-demand)
  prerankComponents?: PrerankComponents;
  // Set by the MCP path: how complete the job description was when scored.
  descriptionCompleteness?: DescriptionCompleteness;
  // Cached copy of the current versioned evaluation for legacy match readers.
  evaluatorKey?: StructuredJobEvaluation["evaluatorKey"];
  lane?: StructuredJobEvaluation["lane"];
  fitScore?: StructuredJobEvaluation["fitScore"];
  pursuitPriority?: StructuredJobEvaluation["pursuitPriority"];
  criteriaVersion?: StructuredJobEvaluation["criteriaVersion"];
  hardGates?: StructuredJobEvaluation["hardGates"];
  dimensionScores?: StructuredJobEvaluation["dimensionScores"];
  evaluatorDefinitionHash?: StructuredJobEvaluation["evaluatorDefinitionHash"];
  inputHash?: StructuredJobEvaluation["inputHash"];
  resultHash?: StructuredJobEvaluation["resultHash"];
  evaluatedAt?: StructuredJobEvaluation["evaluatedAt"];
};
