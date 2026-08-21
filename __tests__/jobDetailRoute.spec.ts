import { convertResumeToText } from "@/lib/ai/tools/preprocessing";
import prisma from "@/lib/db";
import { authorizeJobRead } from "@/lib/integrations/jobReadAuthorization";
import { getDefaultResumeForUser } from "@/lib/jobs/getDefaultResumeForUser";

vi.mock("@/lib/db", () => ({
  default: { job: { findFirst: vi.fn() } },
}));

vi.mock("@/lib/integrations/jobReadAuthorization", () => ({
  authorizeJobRead: vi.fn(),
}));

vi.mock("@/lib/jobs/getDefaultResumeForUser", () => ({
  getDefaultResumeForUser: vi.fn(),
}));

vi.mock("@/lib/ai/tools/preprocessing", () => ({
  convertResumeToText: vi.fn(),
}));

import { GET } from "@/app/api/integrations/jobs/[id]/route";

const db = prisma as unknown as {
  job: { findFirst: ReturnType<typeof vi.fn> };
};

const job = {
  id: "job-1",
  jobUrl: "https://example.com/jobs/1",
  description: "<p>Build &amp; ship software</p>",
  jobType: "Full-time",
  workplaceType: "Remote",
  salaryRange: "$150k-$180k",
  descriptionCompleteness: "full",
  JobTitle: { label: "Senior Engineer" },
  Company: { label: "Example Corp" },
  Location: { label: "New York, NY" },
};

const request = new Request("https://jobsync.test/api/integrations/jobs/job-1");
const context = { params: Promise.resolve({ id: "job-1" }) };

describe("GET /api/integrations/jobs/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeJobRead as any).mockResolvedValue({
      ok: true,
      userId: "owner-user",
    });
    db.job.findFirst.mockResolvedValue(job);
    (getDefaultResumeForUser as any).mockResolvedValue({
      id: "resume-1",
      title: "Default resume",
    });
    (convertResumeToText as any).mockResolvedValue(" Resume\n\n•  Detail ");
  });

  it("returns only the strict normalized detail contract", async () => {
    const response = await GET(request, context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: {
        id: "job-1",
        jobUrl: "https://example.com/jobs/1",
        title: "Senior Engineer",
        company: "Example Corp",
        location: "New York, NY",
        workplaceType: "Remote",
        jobType: "Full-time",
        salaryRange: "$150k-$180k",
        description: "Build & ship software",
        descriptionCompleteness: "full",
      },
      defaultResume: {
        id: "resume-1",
        title: "Default resume",
        content: "Resume\n\n• Detail",
      },
    });
  });

  it("returns authorization failures before any lookup", async () => {
    (authorizeJobRead as any).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Invalid token" }, { status: 401 }),
    });

    const response = await GET(request, context);

    expect(response.status).toBe(401);
    expect(db.job.findFirst).not.toHaveBeenCalled();
    expect(getDefaultResumeForUser).not.toHaveBeenCalled();
  });

  it("uses an owner-scoped lookup and does not leak non-owned jobs", async () => {
    db.job.findFirst.mockResolvedValue(null);

    const response = await GET(request, context);

    expect(db.job.findFirst).toHaveBeenCalledWith({
      where: { id: "job-1", userId: "owner-user" },
      select: expect.any(Object),
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Job not found" });
    expect(getDefaultResumeForUser).not.toHaveBeenCalled();
  });

  it("returns a null default resume when the user has none", async () => {
    (getDefaultResumeForUser as any).mockResolvedValue(null);

    const response = await GET(request, context);
    const body = await response.json();

    expect(body.defaultResume).toBeNull();
    expect(convertResumeToText).not.toHaveBeenCalled();
  });
});
