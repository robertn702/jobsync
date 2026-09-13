-- CreateTable
CREATE TABLE "JobEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "evaluatorKey" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "fitScore" INTEGER NOT NULL,
    "pursuitPriority" TEXT NOT NULL,
    "criteriaVersion" TEXT NOT NULL,
    "hardGates" TEXT NOT NULL,
    "dimensionScores" TEXT NOT NULL,
    "evaluatorDefinitionHash" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "resultHash" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "evaluatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobEvaluation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "JobEvaluation_jobId_evaluatorKey_resultHash_key" ON "JobEvaluation"("jobId", "evaluatorKey", "resultHash");

-- CreateIndex
CREATE INDEX "JobEvaluation_jobId_evaluatorKey_evaluatedAt_createdAt_idx" ON "JobEvaluation"("jobId", "evaluatorKey", "evaluatedAt", "createdAt");
