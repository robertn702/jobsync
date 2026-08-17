import prisma from "@/lib/db";
import {
  normalizeStoredDescription,
  resolveDescriptionCompleteness,
} from "@/lib/integrations/jobSerialization";
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

type JobDetailRecord = {
  id: string;
  jobUrl: string | null;
  description: string;
  jobType: string;
  workplaceType: string | null;
  salaryRange: string | null;
  descriptionCompleteness: string | null;
  JobTitle: { label: string };
  Company: { label: string };
  Location: { label: string } | null;
};

export interface JobDetailItem {
  id: string;
  jobUrl: string | null;
  title: string;
  company: string;
  location: string | null;
  workplaceType: string | null;
  jobType: string;
  salaryRange: string | null;
  description: string;
  descriptionCompleteness: DescriptionCompleteness;
}

export async function getOwnedJobDetail(
  userId: string,
  id: string,
): Promise<JobDetailItem | null> {
  const record = (await prisma.job.findFirst({
    where: { id, userId },
    select: jobDetailSelect,
  })) as JobDetailRecord | null;
  if (!record) return null;

  const description = normalizeStoredDescription(record.description);

  return {
    id: record.id,
    jobUrl: record.jobUrl,
    title: record.JobTitle.label,
    company: record.Company.label,
    location: record.Location?.label ?? null,
    workplaceType: record.workplaceType,
    jobType: record.jobType,
    salaryRange: record.salaryRange,
    description,
    descriptionCompleteness: resolveDescriptionCompleteness(
      record.descriptionCompleteness as DescriptionCompleteness | null,
      description,
    ),
  };
}
