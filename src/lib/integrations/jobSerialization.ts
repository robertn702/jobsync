import { createHash } from "crypto";
import MarkdownIt from "markdown-it";
import {
  normalizeBullets,
  normalizeHeadings,
  normalizeWhitespace,
  removeHtmlTags,
} from "@/lib/ai/tools/text-processing";
import { classifyDescriptionCompleteness } from "@/lib/jobs/descriptionCompleteness";
import type { DescriptionCompleteness } from "@/models/job.model";

const markdown = new MarkdownIt({ html: true, linkify: false, breaks: true });

export interface JobFingerprintInput {
  id: string;
  jobUrl: string | null;
  title: string;
  company: string;
  location: string | null;
  workplaceType: string | null;
  jobType: string;
  salaryRange: string | null;
}

export interface DefaultResumeFingerprintInput {
  id: string;
  title: string;
  normalizedContent: string;
}

const hashFingerprintInput = (input: object): string =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");

export function normalizeStoredDescription(description: string): string {
  let normalized = removeHtmlTags(markdown.render(description));
  normalized = normalizeWhitespace(normalized);
  normalized = normalizeBullets(normalized);
  normalized = normalizeHeadings(normalized);
  return normalizeWhitespace(normalized);
}

export function resolveDescriptionCompleteness(
  storedCompleteness: DescriptionCompleteness | null | undefined,
  normalizedDescription: string,
): DescriptionCompleteness {
  return (
    storedCompleteness ??
    classifyDescriptionCompleteness(normalizedDescription)
  );
}

export function createJobFingerprint(
  input: JobFingerprintInput,
  normalizedDescription: string,
  descriptionCompleteness: DescriptionCompleteness,
): string {
  return hashFingerprintInput({
    version: 1,
    id: input.id,
    jobUrl: input.jobUrl,
    title: input.title,
    company: input.company,
    location: input.location,
    workplaceType: input.workplaceType,
    jobType: input.jobType,
    salaryRange: input.salaryRange,
    normalizedDescription,
    descriptionCompleteness,
  });
}

export function createDefaultResumeFingerprint(
  input: DefaultResumeFingerprintInput,
): string {
  return hashFingerprintInput({
    version: 1,
    id: input.id,
    title: input.title,
    normalizedContent: input.normalizedContent,
  });
}
