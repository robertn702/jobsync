import { getOwnedJobDetail } from "@/lib/integrations/jobDetail";
import { getDefaultResumeDetailItem } from "@/lib/integrations/jobIndex";
import { authorizeJobRead } from "@/lib/integrations/jobReadAuthorization";

vi.mock("@/lib/integrations/jobReadAuthorization", () => ({
  authorizeJobRead: vi.fn(),
}));

vi.mock("@/lib/integrations/jobDetail", () => ({
  getOwnedJobDetail: vi.fn(),
}));

vi.mock("@/lib/integrations/jobIndex", () => ({
  getDefaultResumeDetailItem: vi.fn(),
}));

import { GET } from "@/app/api/integrations/jobs/[id]/route";

const request = () =>
  new Request(
    "https://jobsync.test/api/integrations/jobs/job-1?userId=attacker-user",
    { headers: { "x-user-id": "attacker-user" } },
  );

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/integrations/jobs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeJobRead as any).mockResolvedValue({
      ok: true,
      userId: "owner-user",
    });
    (getOwnedJobDetail as any).mockResolvedValue({
      id: "job-1",
      jobUrl: null,
      title: "Senior Engineer",
      company: "Example",
      location: "New York, NY",
      workplaceType: "HYBRID",
      jobType: "FT",
      salaryRange: "$190,000-$220,000",
      description: "Normalized description",
      descriptionCompleteness: "full",
    });
    (getDefaultResumeDetailItem as any).mockResolvedValue({
      id: "resume-1",
      title: "Default Resume",
      content: "Normalized resume content",
    });
  });

  it("returns the owned job and normalized default resume", async () => {
    const response = await GET(request(), context("job-1"));

    expect(response.status).toBe(200);
    expect(getOwnedJobDetail).toHaveBeenCalledWith("owner-user", "job-1");
    expect(getDefaultResumeDetailItem).toHaveBeenCalledWith("owner-user");
    await expect(response.json()).resolves.toEqual({
      job: expect.objectContaining({ id: "job-1", jobUrl: null }),
      defaultResume: {
        id: "resume-1",
        title: "Default Resume",
        content: "Normalized resume content",
      },
    });
  });

  it.each(["foreign-job", "missing-job"])(
    "returns the same safe not-found response for %s",
    async (id) => {
      (getOwnedJobDetail as any).mockResolvedValue(null);

      const response = await GET(request(), context(id));

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Job not found" });
      expect(getDefaultResumeDetailItem).not.toHaveBeenCalled();
    },
  );

  it("returns an owned job when no default resume exists", async () => {
    (getDefaultResumeDetailItem as any).mockResolvedValue(null);

    const response = await GET(request(), context("job-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: expect.objectContaining({ id: "job-1" }),
      defaultResume: null,
    });
  });

  it("returns authorization failures without querying data", async () => {
    (authorizeJobRead as any).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Invalid token" }, { status: 401 }),
    });

    const response = await GET(request(), context("job-1"));

    expect(response.status).toBe(401);
    expect(getOwnedJobDetail).not.toHaveBeenCalled();
    expect(getDefaultResumeDetailItem).not.toHaveBeenCalled();
  });
});
