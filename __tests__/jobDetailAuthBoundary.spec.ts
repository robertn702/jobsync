import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: { job: { findFirst: vi.fn() } },
}));

import { GET } from "@/app/api/integrations/jobs/[id]/route";

describe("GET /api/integrations/jobs/[id] authorization boundary", () => {
  it("rejects missing Authorization before querying job data", async () => {
    const response = await GET(
      new Request("https://jobsync.test/api/integrations/jobs/job-1"),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Missing or malformed Authorization header",
    });
    expect(prisma.job.findFirst).not.toHaveBeenCalled();
  });
});
