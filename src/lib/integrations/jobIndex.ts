import prisma from "@/lib/db";
import { convertResumeToText } from "@/lib/ai/tools/preprocessing";
import {
  normalizeBullets,
  normalizeHeadings,
  normalizeWhitespace,
} from "@/lib/ai/tools/text-processing";
import { getDefaultResumeForUser } from "@/lib/jobs/getDefaultResumeForUser";
import {
  createDefaultResumeFingerprint,
  createJobFingerprint,
  normalizeStoredDescription,
  resolveDescriptionCompleteness,
} from "@/lib/integrations/jobSerialization";
import type { DescriptionCompleteness } from "@/models/job.model";
import type { Resume } from "@/models/profile.model";

const DEFAULT_LIMIT = 100;
export const MAX_JOB_INDEX_LIMIT = 100;

const jobIndexSelect = {
  id: true,
  jobUrl: true,
  description: true,
  jobType: true,
  workplaceType: true,
  salaryRange: true,
  descriptionCompleteness: true,
  Status: { select: { value: true } },
  JobTitle: { select: { label: true } },
  Company: { select: { label: true } },
  Location: { select: { label: true } },
} as const;

type JobIndexRecord = {
  id: string;
  jobUrl: string | null;
  description: string;
  jobType: string;
  workplaceType: string | null;
  salaryRange: string | null;
  descriptionCompleteness: string | null;
  Status: { value: string };
  JobTitle: { label: string };
  Company: { label: string };
  Location: { label: string } | null;
};

export interface JobIndexItem {
  id: string;
  fingerprint: string;
  status: string;
  descriptionCompleteness: DescriptionCompleteness;
  descriptionEligible: boolean;
}

export interface DefaultResumeIndexItem {
  id: string;
  fingerprint: string;
}

export interface DefaultResumeDetailItem {
  id: string;
  title: string;
  content: string;
}

function sortById<T extends { id?: string }>(items: T[] | undefined): T[] | undefined {
  return items
    ? [...items].sort((left, right) =>
        (left.id ?? "").localeCompare(right.id ?? ""),
      )
    : items;
}

function canonicalizeResume(resume: Resume): Resume {
  return {
    ...resume,
    ResumeSections: sortById(resume.ResumeSections)?.map((section) => ({
      ...section,
      workExperiences: sortById(section.workExperiences),
      educations: sortById(section.educations),
      licenseOrCertifications: sortById(section.licenseOrCertifications),
      skills: section.skills
        ? [...section.skills].sort(
            (left, right) =>
              left.order - right.order ||
              (left.id ?? "").localeCompare(right.id ?? ""),
          )
        : section.skills,
    })),
  };
}

function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ version: 1, id }), "utf8").toString(
    "base64url",
  );
}

function decodeCursor(cursor: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new Error("cursor is invalid");
  }

  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== cursor) {
      throw new Error("Non-canonical cursor");
    }
    const parsed = JSON.parse(decoded) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 2 ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("id" in parsed) ||
      typeof parsed.id !== "string" ||
      parsed.id.length === 0
    ) {
      throw new Error("Invalid cursor payload");
    }
    return parsed.id;
  } catch {
    throw new Error("cursor is invalid");
  }
}

export function parseJobIndexQuery(url: string): {
  cursorId?: string;
  limit: number;
} {
  const { searchParams } = new URL(url);
  const limitValues = searchParams.getAll("limit");
  const cursorValues = searchParams.getAll("cursor");

  if (limitValues.length > 1) throw new Error("limit must be provided once");
  if (cursorValues.length > 1) throw new Error("cursor must be provided once");

  const limitValue = limitValues[0];
  const limit = limitValue === undefined ? DEFAULT_LIMIT : Number(limitValue);
  if (
    limitValue !== undefined &&
    !/^[1-9]\d*$/.test(limitValue)
  ) {
    throw new Error(
      `limit must be an integer from 1 to ${MAX_JOB_INDEX_LIMIT}`,
    );
  }
  if (!Number.isInteger(limit) || limit > MAX_JOB_INDEX_LIMIT) {
    throw new Error(
      `limit must be an integer from 1 to ${MAX_JOB_INDEX_LIMIT}`,
    );
  }

  const cursorValue = cursorValues[0];
  if (cursorValue === undefined) return { limit };
  if (cursorValue.length === 0) throw new Error("cursor is invalid");
  return { cursorId: decodeCursor(cursorValue), limit };
}

function serializeJobIndexItem(job: JobIndexRecord): JobIndexItem {
  const normalizedDescription = normalizeStoredDescription(job.description);
  const descriptionCompleteness = resolveDescriptionCompleteness(
    job.descriptionCompleteness as DescriptionCompleteness | null,
    normalizedDescription,
  );

  return {
    id: job.id,
    fingerprint: createJobFingerprint(
      {
        id: job.id,
        jobUrl: job.jobUrl,
        title: job.JobTitle.label,
        company: job.Company.label,
        location: job.Location?.label ?? null,
        workplaceType: job.workplaceType,
        jobType: job.jobType,
        salaryRange: job.salaryRange,
      },
      normalizedDescription,
      descriptionCompleteness,
    ),
    status: job.Status.value,
    descriptionCompleteness,
    descriptionEligible: descriptionCompleteness !== "title-only",
  };
}

async function getDefaultResumeSnapshot(userId: string): Promise<{
  id: string;
  title: string;
  content: string;
  fingerprint: string;
} | null> {
  const resume = await getDefaultResumeForUser(userId);
  if (!resume?.id) return null;

  let normalizedContent = await convertResumeToText(canonicalizeResume(resume));
  normalizedContent = normalizeWhitespace(normalizedContent);
  normalizedContent = normalizeBullets(normalizedContent);
  normalizedContent = normalizeHeadings(normalizedContent);

  return {
    id: resume.id,
    title: resume.title,
    content: normalizedContent,
    fingerprint: createDefaultResumeFingerprint({
      id: resume.id,
      title: resume.title,
      normalizedContent,
    }),
  };
}

export async function getDefaultResumeIndexItem(
  userId: string,
): Promise<DefaultResumeIndexItem | null> {
  const snapshot = await getDefaultResumeSnapshot(userId);
  if (!snapshot) return null;

  return { id: snapshot.id, fingerprint: snapshot.fingerprint };
}

export async function getDefaultResumeDetailItem(
  userId: string,
): Promise<DefaultResumeDetailItem | null> {
  const snapshot = await getDefaultResumeSnapshot(userId);
  if (!snapshot) return null;

  return {
    id: snapshot.id,
    title: snapshot.title,
    content: snapshot.content,
  };
}

export async function listJobIndex(
  userId: string,
  cursorId: string | undefined,
  limit: number,
): Promise<{ jobs: JobIndexItem[]; nextCursor: string | null }> {
  const records = (await prisma.job.findMany({
    where: {
      userId,
      ...(cursorId ? { id: { gt: cursorId } } : {}),
    },
    orderBy: { id: "asc" },
    take: limit + 1,
    select: jobIndexSelect,
  })) as JobIndexRecord[];
  const hasMore = records.length > limit;
  const jobs = records.slice(0, limit).map(serializeJobIndexItem);

  return {
    jobs,
    nextCursor:
      hasMore && jobs.length > 0 ? encodeCursor(jobs[jobs.length - 1].id) : null,
  };
}
