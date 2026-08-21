import {
  getDefaultResumeIndexItem,
  listJobIndex,
} from "@/lib/integrations/jobIndex";

vi.mock("@/lib/integrations/jobIndex", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/jobIndex")>();
  return {
    ...actual,
    getDefaultResumeIndexItem: vi.fn(),
    listJobIndex: vi.fn(),
  };
});

import { GET } from "@/app/api/integrations/jobs/route";

describe("GET /api/integrations/jobs authorization boundary", () => {
  it("rejects missing Authorization before querying index data", async () => {
    const response = await GET(
      new Request("https://jobsync.test/api/integrations/jobs"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Missing or malformed Authorization header",
    });
    expect(listJobIndex).not.toHaveBeenCalled();
    expect(getDefaultResumeIndexItem).not.toHaveBeenCalled();
  });
});
