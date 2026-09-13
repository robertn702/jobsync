import {
  computeEvaluationPayloadHash,
  handleSaveMatchResult,
} from "@/lib/mcp/tools/saveMatchResult";
import { PrismaClient } from "@prisma/client";
import nexusGoal160SaveMatchResult from "./fixtures/nexusGoal160SaveMatchResult.json";
import { McpSaveMatchResultSchema } from "@/models/mcp.schema";

const prisma = new PrismaClient();

vi.mock("@prisma/client", () => {
  const client = {
    job: { update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
    jobEvaluation: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
    resume: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(client)),
  };
  return { PrismaClient: vi.fn(function () { return client; }) };
});

vi.mock("@/lib/mcp/rate-limit", () => ({
  checkMcpRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
}));

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

function input(overrides: Record<string, unknown> = {}) {
  return {
    jobId: "job-1",
    matchText: "SCORES: match=78 recommendation=good\n\nAnalysis body.",
    evaluation: {
      evaluatorKey: "goal160" as const,
      lane: "fde" as const,
      fitScore: 78,
      pursuitPriority: "normal" as const,
      criteriaVersion: "v1",
      hardGates,
      dimensionScores: { role_fit: 78 },
      evaluatorDefinitionHash: "a".repeat(64),
      inputHash: "b".repeat(64),
      resultHash: "c".repeat(64),
      evaluatedAt: "2026-09-13T12:00:00.000Z",
      ...overrides,
    },
  };
}

describe("Goal160 evaluation persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.job.findFirst as any).mockResolvedValue({ descriptionCompleteness: "full" });
    (prisma.user.findUnique as any).mockResolvedValue({ defaultResumeId: null });
    (prisma.jobEvaluation.findUnique as any).mockResolvedValue(null);
    (prisma.jobEvaluation.findFirst as any).mockResolvedValue({ id: "evaluation-new" });
    (prisma.jobEvaluation.create as any).mockResolvedValue({
      id: "evaluation-new",
      createdAt: new Date("2026-09-13T12:00:01.000Z"),
    });
    (prisma.job.update as any).mockResolvedValue({ id: "job-1" });
    (prisma.job.updateMany as any).mockResolvedValue({ count: 1 });
  });

  it("guards legacy MCP cache writes when a Goal160 evaluation exists", async () => {
    (prisma.job.updateMany as any).mockResolvedValue({ count: 0 });
    const result = await handleSaveMatchResult(
      {
        jobId: "job-1",
        matchText: "SCORES: match=22 recommendation=weak\n\nLegacy analysis.",
      },
      "user-1",
      "legacy-client",
    );

    expect(prisma.job.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        evaluations: { none: { evaluatorKey: "goal160" } },
      }),
    }));
    expect(result.content[0].text).toContain("structured Goal160 score preserved");
  });

  it("appends an immutable row and acknowledges the persisted caller result hash", async () => {
    const result = await handleSaveMatchResult(input(), "user-1", "nexus");
    const acknowledgement = JSON.parse(result.content[0].text);
    const create = (prisma.jobEvaluation.create as any).mock.calls[0][0].data;

    expect(acknowledgement).toMatchObject({ ok: true, jobId: "job-1", current: true });
    expect(acknowledgement.resultHash).toBe("c".repeat(64));
    expect(create.resultHash).toBe(acknowledgement.resultHash);
    expect(create.payloadHash).toBe(computeEvaluationPayloadHash(input()));
    expect(create).not.toHaveProperty("isCurrent");
    expect((prisma.jobEvaluation as any).update).toBeUndefined();
    expect((prisma.jobEvaluation as any).updateMany).toBeUndefined();
    expect(prisma.job.update).toHaveBeenCalled();
    expect(prisma.job.findFirst).toHaveBeenCalledWith({
      where: { id: "job-1", userId: "user-1" },
      select: { descriptionCompleteness: true },
    });
    expect(prisma.job.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job-1", userId: "user-1" },
    }));
  });

  it("appends a stale arrival without replacing the cached score", async () => {
    (prisma.jobEvaluation.findFirst as any).mockResolvedValue({
      id: "evaluation-newer",
      evaluatedAt: new Date("2026-09-14T12:00:00.000Z"),
      createdAt: new Date("2026-09-14T12:00:01.000Z"),
    });

    const result = await handleSaveMatchResult(input(), "user-1", "nexus");

    expect(prisma.jobEvaluation.create).toHaveBeenCalledTimes(1);
    expect(prisma.job.update).not.toHaveBeenCalled();
    expect(JSON.parse(result.content[0].text).current).toBe(false);
  });

  it("uses evaluatedAt, createdAt, and id ordering to decide the current cache", async () => {
    (prisma.jobEvaluation.findFirst as any).mockResolvedValue({
      id: "evaluation-other",
    });

    const result = await handleSaveMatchResult(input(), "user-1", "nexus");

    expect(prisma.jobEvaluation.findFirst).toHaveBeenLastCalledWith({
      where: { jobId: "job-1", evaluatorKey: "goal160" },
      orderBy: [
        { evaluatedAt: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      select: { id: true },
    });
    expect(prisma.job.update).not.toHaveBeenCalled();
    expect(JSON.parse(result.content[0].text).current).toBe(false);
  });

  it("returns the caller write key for an idempotent result-hash retry", async () => {
    const request = input();
    (prisma.jobEvaluation.findUnique as any).mockResolvedValue({
      id: "evaluation-existing",
      resultHash: request.evaluation.resultHash,
      payloadHash: computeEvaluationPayloadHash(request),
    });
    (prisma.jobEvaluation.findFirst as any).mockResolvedValue({
      id: "evaluation-existing",
    });

    const result = await handleSaveMatchResult(request, "user-1", "nexus");

    expect(prisma.jobEvaluation.create).not.toHaveBeenCalled();
    expect(prisma.job.update).not.toHaveBeenCalled();
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      ok: true,
      idempotent: true,
      resultHash: request.evaluation.resultHash,
      current: true,
    });
    expect(prisma.jobEvaluation.findFirst).toHaveBeenLastCalledWith({
      where: { jobId: "job-1", evaluatorKey: "goal160" },
      orderBy: [
        { evaluatedAt: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      select: { id: true },
    });
  });

  it("reports an idempotent result-hash retry as non-current when a newer row wins", async () => {
    const request = input();
    (prisma.jobEvaluation.findUnique as any).mockResolvedValue({
      id: "evaluation-existing",
      resultHash: request.evaluation.resultHash,
      payloadHash: computeEvaluationPayloadHash(request),
    });
    (prisma.jobEvaluation.findFirst as any).mockResolvedValue({
      id: "evaluation-newer",
    });

    const result = await handleSaveMatchResult(request, "user-1", "nexus");

    expect(JSON.parse(result.content[0].text)).toMatchObject({
      idempotent: true,
      current: false,
    });
  });

  it("persists a new caller write key even when its payload is unchanged", async () => {
    const request = input({ resultHash: "e".repeat(64) });

    const result = await handleSaveMatchResult(request, "user-1", "nexus");

    expect(prisma.jobEvaluation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resultHash: "e".repeat(64),
        payloadHash: computeEvaluationPayloadHash(request),
      }),
    });
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      ok: true,
      idempotent: false,
      resultHash: "e".repeat(64),
    });
  });

  it("rejects caller resultHash reuse with a conflicting payload", async () => {
    (prisma.jobEvaluation.findUnique as any).mockResolvedValue({
      id: "evaluation-existing",
      resultHash: "c".repeat(64),
      payloadHash: "d".repeat(64),
    });

    const result = await handleSaveMatchResult(
      input({ lane: "applied_ai" }),
      "user-1",
      "nexus",
    );

    expect(result.content[0].text).toBe("Unable to save match result.");
    expect(prisma.jobEvaluation.create).not.toHaveBeenCalled();
  });

  it("acknowledges a concurrent retry that loses the unique-key create race", async () => {
    const request = input();
    (prisma.$transaction as any).mockRejectedValueOnce({ code: "P2002" });
    (prisma.jobEvaluation.findUnique as any).mockResolvedValue({
      id: "evaluation-winner",
      resultHash: request.evaluation.resultHash,
      payloadHash: computeEvaluationPayloadHash(request),
    });
    (prisma.jobEvaluation.findFirst as any).mockResolvedValue({
      id: "evaluation-winner",
    });

    const result = await handleSaveMatchResult(request, "user-1", "nexus");

    expect(JSON.parse(result.content[0].text)).toMatchObject({
      ok: true,
      jobId: request.jobId,
      resultHash: request.evaluation.resultHash,
      idempotent: true,
      current: true,
    });
  });

  it("reports a unique-key race acknowledgement as non-current when a newer row wins", async () => {
    const request = input();
    (prisma.$transaction as any).mockRejectedValueOnce({ code: "P2002" });
    (prisma.jobEvaluation.findUnique as any).mockResolvedValue({
      id: "evaluation-winner",
      resultHash: request.evaluation.resultHash,
      payloadHash: computeEvaluationPayloadHash(request),
    });
    (prisma.jobEvaluation.findFirst as any).mockResolvedValue({
      id: "evaluation-newer",
    });

    const result = await handleSaveMatchResult(request, "user-1", "nexus");

    expect(JSON.parse(result.content[0].text)).toMatchObject({
      idempotent: true,
      current: false,
    });
  });

  it("keeps a failed unique-race lookup behind the generic MCP error", async () => {
    (prisma.$transaction as any).mockRejectedValueOnce({ code: "P2002" });
    (prisma.jobEvaluation.findUnique as any).mockRejectedValueOnce(
      new Error("database topology"),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await handleSaveMatchResult(input(), "user-1", "nexus");

    expect(result.content[0].text).toBe("Unable to save match result.");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("acknowledges a Nexus-produced payload with its submitted result hash", async () => {
    const request = McpSaveMatchResultSchema.parse(nexusGoal160SaveMatchResult);

    const result = await handleSaveMatchResult(request, "user-1", "nexus");

    expect(JSON.parse(result.content[0].text)).toMatchObject({
      ok: true,
      jobId: request.jobId,
      resultHash: request.evaluation?.resultHash,
    });
  });

  it("logs database detail but returns a generic MCP error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    (prisma.jobEvaluation.findUnique as any).mockRejectedValue(
      new Error("secret database topology"),
    );

    const result = await handleSaveMatchResult(input(), "user-1", "nexus");

    expect(consoleError).toHaveBeenCalled();
    expect(result.content[0].text).toBe("Unable to save match result.");
    expect(result.content[0].text).not.toContain("topology");
    consoleError.mockRestore();
  });
});
