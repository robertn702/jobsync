import { saveLegacyMatchCache } from "@/lib/jobs/matchCache";

describe("saveLegacyMatchCache", () => {
  it("atomically writes only when no canonical Goal160 evaluation exists", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = { job: { updateMany } } as any;

    expect(
      await saveLegacyMatchCache(db, {
        jobId: "job-1",
        userId: "user-1",
        matchScore: 42,
        matchData: "{}",
      }),
    ).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "job-1",
        userId: "user-1",
        evaluations: { none: { evaluatorKey: "goal160" } },
      },
      data: { matchScore: 42, matchData: "{}" },
    });
  });

  it("reports that the structured cache was preserved", async () => {
    const db = { job: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } } as any;
    expect(
      await saveLegacyMatchCache(db, {
        jobId: "job-1",
        userId: "user-1",
        matchScore: 42,
        matchData: "{}",
      }),
    ).toBe(false);
  });
});
