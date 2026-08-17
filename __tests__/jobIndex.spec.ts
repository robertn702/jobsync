import prisma from "@/lib/db";
import { getDefaultResumeForUser } from "@/lib/jobs/getDefaultResumeForUser";
import {
  getDefaultResumeIndexItem,
  listJobIndex,
  parseJobIndexQuery,
} from "@/lib/integrations/jobIndex";

vi.mock("@/lib/db", () => ({
  default: { job: { findMany: vi.fn() } },
}));

vi.mock("@/lib/jobs/getDefaultResumeForUser", () => ({
  getDefaultResumeForUser: vi.fn(),
}));

const words = (count: number) =>
  Array.from({ length: count }, (_, index) => `word${index}`).join(" ");

const job = (overrides: Record<string, unknown> = {}) => ({
  id: "job-1",
  jobUrl: "https://example.com/job-1",
  description: words(150),
  jobType: "FT",
  workplaceType: "HYBRID",
  salaryRange: "$190,000-$220,000",
  descriptionCompleteness: "full",
  Status: { value: "draft" },
  JobTitle: { label: "Senior Engineer" },
  Company: { label: "Example" },
  Location: { label: "New York, NY" },
  ...overrides,
});

describe("job integration index", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses stable owned ID pagination and returns no raw descriptions", async () => {
    (prisma.job.findMany as any).mockResolvedValue([
      job({ id: "job-2" }),
      job({ id: "job-3", Status: { value: "rejected" } }),
      job({ id: "job-4" }),
    ]);

    const first = await listJobIndex("owner-user", "job-1", 2);

    expect(prisma.job.findMany).toHaveBeenCalledWith({
      where: { userId: "owner-user", id: { gt: "job-1" } },
      orderBy: { id: "asc" },
      take: 3,
      select: expect.any(Object),
    });
    expect(first.jobs).toHaveLength(2);
    expect(first.jobs[1].status).toBe("rejected");
    expect(first.jobs[0]).not.toHaveProperty("description");
    expect(first.nextCursor).toEqual(expect.any(String));

    expect(
      parseJobIndexQuery(
        `https://jobsync.test/api/integrations/jobs?cursor=${first.nextCursor}&limit=2`,
      ),
    ).toEqual({ cursorId: "job-3", limit: 2 });

    (prisma.job.findMany as any).mockResolvedValue([job({ id: "job-4" })]);
    const nextQuery = parseJobIndexQuery(
      `https://jobsync.test/api/integrations/jobs?cursor=${first.nextCursor}&limit=2`,
    );
    const second = await listJobIndex(
      "owner-user",
      nextQuery.cursorId,
      nextQuery.limit,
    );
    expect(prisma.job.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { userId: "owner-user", id: { gt: "job-3" } },
      }),
    );
    expect(second).toEqual({
      jobs: [expect.objectContaining({ id: "job-4" })],
      nextCursor: null,
    });
  });

  it("returns an empty terminal page", async () => {
    (prisma.job.findMany as any).mockResolvedValue([]);

    await expect(listJobIndex("owner-user", undefined, 100)).resolves.toEqual({
      jobs: [],
      nextCursor: null,
    });
  });

  it("falls back to computed completeness and exposes eligibility", async () => {
    (prisma.job.findMany as any).mockResolvedValue([
      job({
        description: words(39),
        descriptionCompleteness: null,
      }),
      job({
        id: "job-2",
        description: words(40),
        descriptionCompleteness: null,
      }),
    ]);

    const page = await listJobIndex("owner-user", undefined, 2);

    expect(page.jobs).toEqual([
      expect.objectContaining({
        descriptionCompleteness: "title-only",
        descriptionEligible: false,
      }),
      expect.objectContaining({
        descriptionCompleteness: "partial",
        descriptionEligible: true,
      }),
    ]);
  });

  it("changes fingerprints when relevant job content changes", async () => {
    (prisma.job.findMany as any)
      .mockResolvedValueOnce([job()])
      .mockResolvedValueOnce([job({ description: words(151) })]);

    const first = await listJobIndex("owner-user", undefined, 1);
    const changed = await listJobIndex("owner-user", undefined, 1);

    expect(first.jobs[0].fingerprint).not.toBe(changed.jobs[0].fingerprint);
  });

  it.each([
    "?limit=0",
    "?limit=101",
    "?limit=1.5",
    "?limit=1e2",
    "?limit=+1",
    "?limit=01",
    "?limit=1&limit=2",
    "?cursor=",
    "?cursor=not-a-cursor",
    "?cursor=eyJ2ZXJzaW9uIjoxLCJpZCI6ImpvYi0xIn0&cursor=duplicate",
  ])("rejects malformed pagination: %s", (query) => {
    expect(() =>
      parseJobIndexQuery(`https://jobsync.test/api/integrations/jobs${query}`),
    ).toThrow();
  });

  it("fingerprints the default resume without returning its content", async () => {
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
          sectionTitle: "Summary",
          sectionType: "summary",
          summary: { content: words(60) },
        },
      ],
    };
    (getDefaultResumeForUser as any).mockResolvedValue(resume);

    const first = await getDefaultResumeIndexItem("owner-user");
    (getDefaultResumeForUser as any).mockResolvedValue({
      ...resume,
      ResumeSections: [
        {
          ...resume.ResumeSections[0],
          summary: { content: `${words(60)} changed` },
        },
      ],
    });
    const changed = await getDefaultResumeIndexItem("owner-user");

    expect(getDefaultResumeForUser).toHaveBeenCalledWith("owner-user");
    expect(first).toEqual({
      id: "resume-1",
      fingerprint: expect.any(String),
    });
    expect(first).not.toHaveProperty("content");
    expect(first?.fingerprint).not.toBe(changed?.fingerprint);
  });

  it("returns null when the user has no default resume", async () => {
    (getDefaultResumeForUser as any).mockResolvedValue(null);

    await expect(getDefaultResumeIndexItem("owner-user")).resolves.toBeNull();
  });

  it("makes resume fingerprints independent of relation query order", async () => {
    const sections = [
      {
        id: "section-b",
        sectionTitle: "Experience",
        sectionType: "experience",
        workExperiences: [
          {
            id: "experience-b",
            Company: { label: "Beta" },
            jobTitle: { label: "Engineer" },
            location: { label: "Remote" },
            startDate: new Date("2022-01-01"),
            endDate: new Date("2023-01-01"),
            description: words(30),
          },
          {
            id: "experience-a",
            Company: { label: "Alpha" },
            jobTitle: { label: "Engineer" },
            location: { label: "Remote" },
            startDate: new Date("2020-01-01"),
            endDate: new Date("2021-01-01"),
            description: words(30),
          },
        ],
      },
      {
        id: "section-a",
        sectionTitle: "Summary",
        sectionType: "summary",
        summary: { content: words(60) },
      },
    ];
    (getDefaultResumeForUser as any).mockResolvedValue({
      id: "resume-1",
      title: "Default Resume",
      ResumeSections: sections,
    });
    const first = await getDefaultResumeIndexItem("owner-user");
    (getDefaultResumeForUser as any).mockResolvedValue({
      id: "resume-1",
      title: "Default Resume",
      ResumeSections: [...sections].reverse().map((section) => ({
        ...section,
        workExperiences: section.workExperiences
          ? [...section.workExperiences].reverse()
          : undefined,
      })),
    });
    const reordered = await getDefaultResumeIndexItem("owner-user");

    expect(first?.fingerprint).toBe(reordered?.fingerprint);
  });
});
