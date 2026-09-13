import { McpSaveMatchResultSchema } from "@/models/mcp.schema";
import nexusGoal160SaveMatchResult from "./fixtures/nexusGoal160SaveMatchResult.json";

const legacyInput = {
  jobId: "job-1",
  matchText:
    "SCORES: match=78 recommendation=good\n\n## Strengths\nSolid backend experience.",
};

const hash = "a".repeat(64);
const hardGates = {
  version: "v1" as const,
  compensation_below_floor: false,
  excessive_travel: false,
  geography_incompatible: false,
  people_or_autonomy_hard_no: false,
  unsustainable_balance: false,
  stale_or_uninteresting_domain: false,
  structural_role_stack_mismatch: false,
};

function evaluation(overrides: Record<string, unknown> = {}) {
  return {
    evaluatorKey: "goal160",
    lane: "frontend_fullstack" as const,
    fitScore: 78,
    pursuitPriority: "top" as const,
    criteriaVersion: "2026-09-13",
    hardGates,
    dimensionScores: { roleFit: 91, stackFit: 88 },
    evaluatorDefinitionHash: hash,
    inputHash: "b".repeat(64),
    resultHash: "c".repeat(64),
    evaluatedAt: "2026-09-13T12:00:00.000Z",
    ...overrides,
  };
}

describe("McpSaveMatchResultSchema structured evaluations", () => {
  it("keeps legacy match-only callers valid", () => {
    expect(McpSaveMatchResultSchema.parse(legacyInput)).toEqual(legacyInput);
  });

  it("accepts a complete Goal160 evaluation", () => {
    const value = evaluation();
    expect(McpSaveMatchResultSchema.parse({ ...legacyInput, evaluation: value }).evaluation)
      .toEqual(value);
  });

  it("accepts the exact save_match_result payload produced by Nexus", () => {
    expect(McpSaveMatchResultSchema.parse(nexusGoal160SaveMatchResult))
      .toEqual(nexusGoal160SaveMatchResult);
  });

  it("accepts only Goal160 as the structured evaluator", () => {
    expect(() =>
      McpSaveMatchResultSchema.parse({
        ...legacyInput,
        evaluation: evaluation({ evaluatorKey: "another-evaluator" }),
      }),
    ).toThrow();
  });

  it("requires the matchText score to equal fitScore", () => {
    expect(() =>
      McpSaveMatchResultSchema.parse({
        ...legacyInput,
        evaluation: evaluation({ fitScore: 79 }),
      }),
    ).toThrow(/fitScore/i);
  });

  it("requires the exact versioned hard-gate shape", () => {
    expect(() =>
      McpSaveMatchResultSchema.parse({
        ...legacyInput,
        evaluation: evaluation({
          hardGates: { compensation_below_floor: false },
        }),
      }),
    ).toThrow();
    expect(() =>
      McpSaveMatchResultSchema.parse({
        ...legacyInput,
        evaluation: evaluation({
          hardGates: { ...hardGates, unknown_gate: false },
        }),
      }),
    ).toThrow();
  });

  it.each([
    ["lane", "backend"],
    ["fitScore", 101],
    ["pursuitPriority", "maybe"],
    ["evaluatorDefinitionHash", "not-a-hash"],
    ["evaluatedAt", "yesterday"],
  ])("rejects invalid evaluation %s", (field, value) => {
    expect(() =>
      McpSaveMatchResultSchema.parse({
        ...legacyInput,
        evaluation: evaluation({ [field]: value }),
      }),
    ).toThrow();
  });
});
