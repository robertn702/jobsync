import prisma from "@/lib/db";
import { calculatePercentageDifference } from "@/lib/utils";
import { requireUser } from "../shared";
import { getLocalDayRange } from "./shared";

export interface TopActivityType {
  label: string;
  hours: number;
}

export interface JobsActivitySummary {
  jobsApplied: number;
  jobsTrend: number;
  topActivities: TopActivityType[];
  otherHours: number;
  totalHours: number;
}

const roundToTenth = (hours: number) => Math.round(hours * 10) / 10;

// One read for the merged Jobs & Activity card. Both halves share
// getLocalDayRange so "7d" means the same window on each; the retired
// getJobsAppliedForPeriod counted a rolling 7x24h window instead.
// Auth guard sits outside the try so an unauthenticated call surfaces
// "Not authenticated" rather than this function's generic message.
export const getJobsActivitySummary = async (
  daysAgo: number,
): Promise<JobsActivitySummary> => {
  const user = await requireUser();

  try {
    const { start, end } = getLocalDayRange(daysAgo - 1);
    // The equally long window immediately before this one, for the trend.
    const { start: priorStart } = getLocalDayRange(daysAgo * 2 - 1);

    const [jobsApplied, priorJobs, activities] = await prisma.$transaction([
      prisma.job.count({
        where: {
          userId: user.id,
          applied: true,
          appliedDate: { gte: start, lte: end },
        },
      }),
      prisma.job.count({
        where: {
          userId: user.id,
          applied: true,
          appliedDate: { gte: priorStart, lt: start },
        },
      }),
      prisma.activity.findMany({
        where: {
          userId: user.id,
          startTime: { gte: start, lte: end },
        },
        select: {
          duration: true,
          activityType: { select: { label: true } },
        },
      }),
    ]);

    const groupedByType = activities.reduce(
      (acc: Record<string, number>, activity) => {
        const label = activity.activityType?.label || "Unknown";
        acc[label] = (acc[label] || 0) + (activity.duration || 0) / 60;
        return acc;
      },
      {},
    );

    const sorted = Object.entries(groupedByType)
      .map(([label, hours]) => ({ label, hours }))
      .sort((a, b) => b.hours - a.hours);

    const topActivities = sorted
      .slice(0, 3)
      .map(({ label, hours }) => ({ label, hours: roundToTenth(hours) }));
    const otherHours = roundToTenth(
      sorted.slice(3).reduce((sum, entry) => sum + entry.hours, 0),
    );
    // Totalled from the rounded parts so the number in the donut's
    // center always equals the legend beside it.
    const totalHours = roundToTenth(
      topActivities.reduce((sum, entry) => sum + entry.hours, 0) + otherHours,
    );

    const jobsTrend =
      calculatePercentageDifference(priorJobs, jobsApplied) ?? 0;

    return { jobsApplied, jobsTrend, topActivities, otherHours, totalHours };
  } catch (error) {
    const msg = "Failed to fetch jobs and activity summary";
    console.error(msg, error);
    throw new Error(msg);
  }
};
