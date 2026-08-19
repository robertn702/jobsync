import { z } from "zod";

const GREENHOUSE_HOSTS = new Set([
  "job-boards.greenhouse.io",
  "job-boards.eu.greenhouse.io",
  "boards.greenhouse.io",
]);

const GreenhouseJobSchema = z.object({
  location: z.object({ name: z.string() }).nullable().optional(),
});

function parseGreenhouseJobUrl(jobUrl: string) {
  try {
    const url = new URL(jobUrl);
    const segments = url.pathname.split("/").filter(Boolean);

    if (
      url.protocol !== "https:" ||
      !GREENHOUSE_HOSTS.has(url.hostname) ||
      segments.length !== 3 ||
      segments[1] !== "jobs" ||
      !/^\d+$/.test(segments[2])
    ) {
      return null;
    }

    return { boardToken: segments[0], jobId: segments[2] };
  } catch {
    return null;
  }
}

export async function getGreenhouseLocation(jobUrl?: string): Promise<string | undefined> {
  if (!jobUrl) return undefined;

  const job = parseGreenhouseJobUrl(jobUrl);
  if (!job) return undefined;

  try {
    const response = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(job.boardToken)}/jobs/${job.jobId}`,
      { signal: AbortSignal.timeout(3_000) },
    );
    if (!response.ok) return undefined;

    const parsed = GreenhouseJobSchema.safeParse(await response.json());
    const location = parsed.success ? parsed.data.location?.name.trim() : undefined;
    return location || undefined;
  } catch {
    return undefined;
  }
}
