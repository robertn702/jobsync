import { createHash } from "node:crypto";
import { z } from "zod";
import prisma from "@/lib/db";
import { APP_CONSTANTS } from "@/lib/constants";
import { McpSaveMatchResultSchema } from "@/models/mcp.schema";
import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";
import { parseJobMatch } from "@/lib/ai/jobMatch/parse";
import type { JobMatchData, StructuredJobEvaluation } from "@/models/ai.schemas";
import type { DescriptionCompleteness } from "@/models/job.model";
import { saveLegacyMatchCache } from "@/lib/jobs/matchCache";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeEvaluationPayloadHash(
  input: z.infer<typeof McpSaveMatchResultSchema>,
): string {
  if (!input.evaluation) throw new Error("Structured evaluation required");
  const { resultHash: _writeKey, ...evaluation } = input.evaluation;
  return createHash("sha256")
    .update(canonicalJson({
      jobId: input.jobId,
      resumeId: input.resumeId,
      matchText: input.matchText,
      evaluation,
    }))
    .digest("hex");
}

type McpTextResult = Promise<{ content: Array<{ type: "text"; text: string }> }>;

const currentEvaluationOrder = [
  { evaluatedAt: "desc" as const },
  { createdAt: "desc" as const },
  { id: "desc" as const },
];

async function isCurrentJobEvaluation(
  findFirst: (args: {
    where: { jobId: string; evaluatorKey: string };
    orderBy: typeof currentEvaluationOrder;
    select: { id: true };
  }) => Promise<{ id: string } | null>,
  jobId: string,
  evaluatorKey: string,
  evaluationId: string,
): Promise<boolean> {
  const newest = await findFirst({
    where: { jobId, evaluatorKey },
    orderBy: currentEvaluationOrder,
    select: { id: true },
  });
  return newest?.id === evaluationId;
}

export async function handleSaveMatchResult(
  input: z.infer<typeof McpSaveMatchResultSchema>,
  userId: string,
  tokenName: string,
): McpTextResult {
  const rateCheck = checkMcpRateLimit(userId);
  if (!rateCheck.allowed) {
    const resetSec = Math.ceil(rateCheck.resetIn / 1000);
    return {
      content: [{ type: "text", text: `Rate limit exceeded. Try again in ${resetSec}s.` }],
    };
  }

  const parsed = parseJobMatch(input.matchText);
  if (!parsed.scores) {
    return {
      content: [{
        type: "text",
        text:
          "Could not parse a SCORES line. Include a leading 'SCORES: " +
          "match=<0-100> recommendation=<strong|good|partial|weak>' line.",
      }],
    };
  }
  const scores = parsed.scores;

  let resume = input.resumeId != null
    ? await prisma.resume.findFirst({
        where: { id: input.resumeId, profile: { userId } },
        select: { id: true, title: true },
      })
    : null;
  if (!resume) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { defaultResumeId: true },
    });
    resume = user?.defaultResumeId
      ? await prisma.resume.findFirst({
          where: { id: user.defaultResumeId, profile: { userId } },
          select: { id: true, title: true },
        })
      : null;
  }

  const job = await prisma.job.findFirst({
    where: {
      id: input.jobId,
      userId,
      ...(input.evaluation ? {} : { createdVia: { not: null } }),
    },
    select: { descriptionCompleteness: true },
  });
  if (!job) {
    return {
      content: [{
        type: "text",
        text: "Job not found, not owned by this token's user, or not eligible for a match via MCP.",
      }],
    };
  }

  const matchScore = input.evaluation?.fitScore ?? scores.matchScore;
  let acknowledgement:
    | { ok: true; jobId: string; resultHash: string; idempotent: boolean; current: boolean }
    | undefined;
  let structuredScorePreserved = false;

  try {
    if (!input.evaluation) {
      structuredScorePreserved = !(await saveLegacyMatchCache(prisma, {
        jobId: input.jobId,
        userId,
        matchScore,
        matchData: JSON.stringify({
          matchScore,
          recommendation: scores.recommendation,
          body: parsed.body,
          resumeId: resume?.id,
          resumeTitle: resume?.title,
          matchedAt: new Date().toISOString(),
          provider: APP_CONSTANTS.MCP_MATCH_PROVIDER_MARKER,
          model: tokenName,
          analyzed: true,
          descriptionCompleteness:
            (job.descriptionCompleteness as DescriptionCompleteness | null) ?? undefined,
        } satisfies JobMatchData),
      }));
    } else {
      const evaluation = input.evaluation;
      const payloadHash = computeEvaluationPayloadHash(input);
      acknowledgement = await prisma.$transaction(async (tx) => {
        const existing = await tx.jobEvaluation.findUnique({
          where: {
            jobId_evaluatorKey_resultHash: {
              jobId: input.jobId,
              evaluatorKey: evaluation.evaluatorKey,
              resultHash: evaluation.resultHash,
            },
          },
          select: { id: true, resultHash: true, payloadHash: true },
        });
        if (existing) {
          if (existing.payloadHash !== payloadHash) {
            throw new Error("Caller resultHash was already used for a different payload");
          }
          const current = await isCurrentJobEvaluation(
            (args) => tx.jobEvaluation.findFirst(args),
            input.jobId,
            evaluation.evaluatorKey,
            existing.id,
          );
          return {
            ok: true as const,
            jobId: input.jobId,
            resultHash: existing.resultHash,
            idempotent: true,
            current,
          };
        }

        const created = await tx.jobEvaluation.create({
          data: {
            jobId: input.jobId,
            evaluatorKey: evaluation.evaluatorKey,
            lane: evaluation.lane,
            fitScore: evaluation.fitScore,
            pursuitPriority: evaluation.pursuitPriority,
            criteriaVersion: evaluation.criteriaVersion,
            hardGates: JSON.stringify(evaluation.hardGates),
            dimensionScores: JSON.stringify(evaluation.dimensionScores),
            evaluatorDefinitionHash: evaluation.evaluatorDefinitionHash,
            inputHash: evaluation.inputHash,
            resultHash: evaluation.resultHash,
            payloadHash,
            evaluatedAt: new Date(evaluation.evaluatedAt),
          },
        });
        const current = await isCurrentJobEvaluation(
          (args) => tx.jobEvaluation.findFirst(args),
          input.jobId,
          evaluation.evaluatorKey,
          created.id,
        );

        if (current) {
          const cachedEvaluation: StructuredJobEvaluation = evaluation;
          const matchData: JobMatchData = {
            matchScore,
            recommendation: scores.recommendation,
            body: parsed.body,
            resumeId: resume?.id,
            resumeTitle: resume?.title,
            matchedAt: evaluation.evaluatedAt,
            provider: APP_CONSTANTS.MCP_MATCH_PROVIDER_MARKER,
            model: tokenName,
            analyzed: true,
            descriptionCompleteness:
              (job.descriptionCompleteness as DescriptionCompleteness | null) ?? undefined,
            ...cachedEvaluation,
          };
          await tx.job.update({
            where: { id: input.jobId, userId },
            data: { matchScore, matchData: JSON.stringify(matchData) },
          });
        }

        return {
          ok: true as const,
          jobId: input.jobId,
          resultHash: evaluation.resultHash,
          idempotent: false,
          current,
        };
      });
    }
  } catch (error: unknown) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined;
    if (code === "P2025") {
      return {
        content: [{
          type: "text",
          text: "Job not found, not owned by this token's user, or not eligible for a match via MCP.",
        }],
      };
    }
    if (code === "P2002" && input.evaluation) {
      try {
        const existing = await prisma.jobEvaluation.findUnique({
          where: {
            jobId_evaluatorKey_resultHash: {
              jobId: input.jobId,
              evaluatorKey: input.evaluation.evaluatorKey,
              resultHash: input.evaluation.resultHash,
            },
          },
          select: { id: true, resultHash: true, payloadHash: true },
        });
        if (existing?.payloadHash === computeEvaluationPayloadHash(input)) {
          const current = await isCurrentJobEvaluation(
            (args) => prisma.jobEvaluation.findFirst(args),
            input.jobId,
            input.evaluation.evaluatorKey,
            existing.id,
          );
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                ok: true,
                jobId: input.jobId,
                resultHash: existing.resultHash,
                idempotent: true,
                current,
              }),
            }],
          };
        }
      } catch (lookupError) {
        console.error("Failed to resolve MCP match result create race", lookupError);
        return { content: [{ type: "text", text: "Unable to save match result." }] };
      }
    }
    console.error("Failed to save MCP match result", error);
    return { content: [{ type: "text", text: "Unable to save match result." }] };
  }

  if (acknowledgement) {
    return { content: [{ type: "text", text: JSON.stringify(acknowledgement) }] };
  }
  if (structuredScorePreserved) {
    return {
      content: [{
        type: "text",
        text: `Legacy match accepted for job ${input.jobId}; structured Goal160 score preserved.`,
      }],
    };
  }
  return {
    content: [{
      type: "text",
      text: `Match saved for job ${input.jobId}: ${scores.recommendation} (score ${matchScore}).`,
    }],
  };
}
