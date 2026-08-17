import { authorizeJobRead } from "@/lib/integrations/jobReadAuthorization";
import {
  getDefaultResumeIndexItem,
  listJobIndex,
} from "@/lib/integrations/jobIndex";

vi.mock("@/lib/integrations/jobReadAuthorization", () => ({
  authorizeJobRead: vi.fn(),
}));

vi.mock("@/lib/integrations/jobIndex", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/jobIndex")>();
  return {
    ...actual,
    getDefaultResumeIndexItem: vi.fn(),
    listJobIndex: vi.fn(),
  };
});

import { GET } from "@/app/api/integrations/jobs/route";

describe("GET /api/integrations/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authorizeJobRead as any).mockResolvedValue({
      ok: true,
      userId: "owner-user",
    });
    (listJobIndex as any).mockResolvedValue({ jobs: [], nextCursor: null });
    (getDefaultResumeIndexItem as any).mockResolvedValue(null);
  });

  it("uses only the token-derived owner and returns the compact response", async () => {
    (listJobIndex as any).mockResolvedValue({
      jobs: [
        {
          id: "job-1",
          fingerprint: "job-fingerprint",
          status: "draft",
          descriptionCompleteness: "full",
          descriptionEligible: true,
        },
      ],
      nextCursor: null,
    });
    (getDefaultResumeIndexItem as any).mockResolvedValue({
      id: "resume-1",
      fingerprint: "resume-fingerprint",
    });
    const request = new Request(
      "https://jobsync.test/api/integrations/jobs?userId=attacker-user&limit=25",
      { headers: { "x-user-id": "attacker-user" } },
    );

    const response = await GET(request);
    const data = await response.json();

    expect(listJobIndex).toHaveBeenCalledWith("owner-user", undefined, 25);
    expect(getDefaultResumeIndexItem).toHaveBeenCalledWith("owner-user");
    expect(data.jobs[0]).not.toHaveProperty("description");
    expect(data.defaultResume).not.toHaveProperty("content");
  });

  it("authorizes before rejecting malformed pagination", async () => {
    const response = await GET(
      new Request("https://jobsync.test/api/integrations/jobs?limit=0"),
    );

    expect(authorizeJobRead).toHaveBeenCalledOnce();
    expect(response.status).toBe(400);
    expect(listJobIndex).not.toHaveBeenCalled();
  });

  it("returns authorization failures without querying data", async () => {
    (authorizeJobRead as any).mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Invalid token" }, { status: 401 }),
    });

    const response = await GET(
      new Request("https://jobsync.test/api/integrations/jobs?limit=0"),
    );

    expect(response.status).toBe(401);
    expect(listJobIndex).not.toHaveBeenCalled();
    expect(getDefaultResumeIndexItem).not.toHaveBeenCalled();
  });
});
