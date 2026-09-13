type LegacyMatchDatabase = {
  job: {
    updateMany(args: {
      where: {
        id: string;
        userId: string;
        evaluations: { none: { evaluatorKey: "goal160" } };
      };
      data: { matchScore: number; matchData: string };
    }): Promise<{ count: number }>;
  };
};

export async function saveLegacyMatchCache(
  db: LegacyMatchDatabase,
  input: {
    jobId: string;
    userId: string;
    matchScore: number;
    matchData: string;
  },
): Promise<boolean> {
  const result = await db.job.updateMany({
    where: {
      id: input.jobId,
      userId: input.userId,
      evaluations: { none: { evaluatorKey: "goal160" } },
    },
    data: { matchScore: input.matchScore, matchData: input.matchData },
  });
  return result.count > 0;
}
