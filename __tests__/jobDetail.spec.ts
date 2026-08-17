import prisma from "@/lib/db";
import { getDefaultResumeForUser } from "@/lib/jobs/getDefaultResumeForUser";
import { getOwnedJobDetail } from "@/lib/integrations/jobDetail";
import {
  getDefaultResumeDetailItem,
  getDefaultResumeIndexItem,
  listJobIndex,
} from "@/lib/integrations/jobIndex";
import {
  createDefaultResumeFingerprint,
  createJobFingerprint,
} from "@/lib/integrations/jobSerialization";

vi.mock("@/lib/db", () => ({
  default: { job: { findFirst: vi.fn(), findMany: vi.fn() } },
}));

vi.mock("@/lib/jobs/getDefaultResumeForUser", () => ({
  getDefaultResumeForUser: vi.fn(),
}));

const words = (count: number) =>
  Array.from({ length: count }, (_, index) => `word${index}`).join(" ");

const job = (overrides: Record<string, unknown> = {}) => ({
  id: "job-1",
  jobUrl: null,
  description: `<h2>Role</h2><p>${words(150)}</p>`,
  jobType: "FT",
  workplaceType: "HYBRID",
  salaryRange: "$190,000-$220,000",
  descriptionCompleteness: null,
  Status: { value: "draft" },
  JobTitle: { label: "Senior Engineer" },
  Company: { label: "Example" },
  Location: { label: "New York, NY" },
  ...overrides,
});

const resume = {
  id: "resume-1",
  title: "Default Resume",
  ContactInfo: {
    firstName: "Robert",
    lastName: "Nguyen",
    headline: "Engineer",
    email: "robert@example.com",
    phone: "555-555-5555",
  },
  ResumeSections: [
    {
      id: "section-1",
      sectionTitle: "Summary",
      sectionType: "summary",
      summary: { content: words(60) },
    },
  ],
};

describe("job integration detail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries by job ID and token-derived owner and preserves nullable fields", async () => {
    (prisma.job.findFirst as any).mockResolvedValue(
      job({ workplaceType: null, salaryRange: null, Location: null }),
    );

    const detail = await getOwnedJobDetail("owner-user", "job-1");

    expect(prisma.job.findFirst).toHaveBeenCalledWith({
      where: { id: "job-1", userId: "owner-user" },
      select: expect.any(Object),
    });
    expect(detail).toEqual(
      expect.objectContaining({
        id: "job-1",
        jobUrl: null,
        location: null,
        workplaceType: null,
        salaryRange: null,
        descriptionCompleteness: "full",
      }),
    );
    expect(detail?.description).not.toContain("<h2>");
  });

  it("returns null for foreign or missing jobs", async () => {
    (prisma.job.findFirst as any).mockResolvedValue(null);

    await expect(
      getOwnedJobDetail("owner-user", "foreign-job"),
    ).resolves.toBeNull();
  });

  it("uses the same normalized job representation as the index fingerprint", async () => {
    const record = job();
    (prisma.job.findFirst as any).mockResolvedValue(record);
    (prisma.job.findMany as any).mockResolvedValue([record]);

    const detail = await getOwnedJobDetail("owner-user", "job-1");
    const index = await listJobIndex("owner-user", undefined, 1);

    expect(detail).not.toBeNull();
    expect(index.jobs[0].fingerprint).toBe(
      createJobFingerprint(
        {
          id: detail!.id,
          jobUrl: detail!.jobUrl,
          title: detail!.title,
          company: detail!.company,
          location: detail!.location,
          workplaceType: detail!.workplaceType,
          jobType: detail!.jobType,
          salaryRange: detail!.salaryRange,
        },
        detail!.description,
        detail!.descriptionCompleteness,
      ),
    );
  });

  it("uses the same normalized resume representation as the index fingerprint", async () => {
    (getDefaultResumeForUser as any).mockResolvedValue(resume);

    const detail = await getDefaultResumeDetailItem("owner-user");
    const index = await getDefaultResumeIndexItem("owner-user");

    expect(detail).toEqual({
      id: "resume-1",
      title: "Default Resume",
      content: expect.any(String),
    });
    expect(index?.fingerprint).toBe(
      createDefaultResumeFingerprint({
        id: detail!.id,
        title: detail!.title,
        normalizedContent: detail!.content,
      }),
    );
  });

  it("returns null when there is no default resume", async () => {
    (getDefaultResumeForUser as any).mockResolvedValue(null);

    await expect(
      getDefaultResumeDetailItem("owner-user"),
    ).resolves.toBeNull();
  });
});
