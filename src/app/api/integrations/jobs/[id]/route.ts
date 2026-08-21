import { convertResumeToText } from "@/lib/ai/tools/preprocessing";
import {
  normalizeBullets,
  normalizeHeadings,
  normalizeWhitespace,
} from "@/lib/ai/tools/text-processing";
import prisma from "@/lib/db";
import { authorizeJobRead } from "@/lib/integrations/jobReadAuthorization";
import { canonicalizeResume } from "@/lib/integrations/jobIndex";
import {
  normalizeStoredDescription,
  resolveDescriptionCompleteness,
} from "@/lib/integrations/jobSerialization";
import { getDefaultResumeForUser } from "@/lib/jobs/getDefaultResumeForUser";
import type { DescriptionCompleteness } from "@/models/job.model";

const jobDetailSelect = {
  id: true,
  jobUrl: true,
  description: true,
  jobType: true,
  workplaceType: true,
  salaryRange: true,
  descriptionCompleteness: true,
  JobTitle: { select: { label: true } },
  Company: { select: { label: true } },
  Location: { select: { label: true } },
} as const;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const authorization = await authorizeJobRead(req);
  if (!authorization.ok) return authorization.response;

  const { id } = await params;

  try {
    const job = await prisma.job.findFirst({
      where: { id, userId: authorization.userId },
      select: jobDetailSelect,
    });
    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    const normalizedDescription = normalizeStoredDescription(job.description);
    const resume = await getDefaultResumeForUser(authorization.userId);
    const defaultResume = resume
      ? {
          id: resume.id,
          title: resume.title,
          content: normalizeHeadings(
            normalizeBullets(
              normalizeWhitespace(
                await convertResumeToText(canonicalizeResume(resume)),
              ),
            ),
          ),
        }
      : null;

    return Response.json({
      job: {
        id: job.id,
        jobUrl: job.jobUrl,
        title: job.JobTitle.label,
        company: job.Company.label,
        location: job.Location?.label ?? null,
        workplaceType: job.workplaceType,
        jobType: job.jobType,
        salaryRange: job.salaryRange,
        description: normalizedDescription,
        descriptionCompleteness: resolveDescriptionCompleteness(
          job.descriptionCompleteness as DescriptionCompleteness | null,
          normalizedDescription,
        ),
      },
      defaultResume,
    });
  } catch (error) {
    console.error("Failed to load integration job:", error);
    return Response.json({ error: "Failed to load job" }, { status: 500 });
  }
}
