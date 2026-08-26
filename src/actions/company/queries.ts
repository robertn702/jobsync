"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { APP_CONSTANTS } from "@/lib/constants";
import { requireUser } from "../shared";

type JobCountGroup = { companyId: string; _count: { id: number } };

const COMPANY_WITH_APPLIED_COUNT_SELECT = {
  id: true,
  label: true,
  value: true,
  logoUrl: true,
  _count: {
    select: {
      jobsApplied: {
        where: {
          applied: true,
        },
      },
    },
  },
};

// Prisma can only count the `applied` relation inline, so the rejected and
// total tallies come from separate groupBy queries and are spliced on here.
const attachJobCounts = (
  data: any[],
  rejectedCounts: JobCountGroup[],
  totalCounts: JobCountGroup[],
) => {
  const rejectedMap = new Map(
    rejectedCounts.map((r) => [r.companyId, r._count.id]),
  );

  const totalMap = new Map(totalCounts.map((r) => [r.companyId, r._count.id]));

  return data.map((company) => ({
    ...company,
    _count: {
      ...(company._count ?? {}),
      jobsRejected: rejectedMap.get(company.id) ?? 0,
      jobsTotal: totalMap.get(company.id) ?? 0,
    },
  }));
};

export const getCompanyList = async (
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE,
  countBy?: string,
  search?: string,
): Promise<any | undefined> => {
  try {
    const user = await requireUser();
    const skip = (page - 1) * limit;

    const whereClause: any = {
      createdBy: user.id,
    };

    if (search) {
      whereClause.label = { contains: search };
    }

    const [data, total, rejectedCounts, totalCounts] = await Promise.all([
      prisma.company.findMany({
        where: whereClause,
        skip,
        take: limit,
        ...(countBy ? { select: COMPANY_WITH_APPLIED_COUNT_SELECT } : {}),
        orderBy: {
          jobsApplied: {
            _count: "desc",
          },
        },
      }),
      prisma.company.count({
        where: whereClause,
      }),
      countBy
        ? prisma.job.groupBy({
            by: ["companyId"],
            where: {
              userId: user.id,
              applied: true,
              Status: { value: "rejected" },
            },
            _count: { id: true },
          })
        : Promise.resolve([]),
      countBy
        ? prisma.job.groupBy({
            by: ["companyId"],
            where: {
              userId: user.id,
            },
            _count: { id: true },
          })
        : Promise.resolve([]),
    ]);

    const dataWithRejected = countBy
      ? attachJobCounts(
          data as any[],
          rejectedCounts as JobCountGroup[],
          totalCounts as JobCountGroup[],
        )
      : data;

    return { data: dataWithRejected, total };
  } catch (error) {
    const msg = "Failed to fetch company list. ";
    return handleError(error, msg);
  }
};

export const getAllCompanies = async (): Promise<any | undefined> => {
  try {
    const user = await requireUser();

    const companies = await prisma.company.findMany({
      where: {
        createdBy: user.id,
      },
    });
    return companies;
  } catch (error) {
    const msg = "Failed to fetch all companies. ";
    return handleError(error, msg);
  }
};

export const getCompanyById = async (
  companyId: string,
): Promise<any | undefined> => {
  try {
    if (!companyId) {
      throw new Error("Please provide company id");
    }
    const user = await requireUser();

    const company = await prisma.company.findUnique({
      where: {
        id: companyId,
        createdBy: user.id,
      },
    });
    return company;
  } catch (error) {
    const msg = "Failed to fetch company by Id. ";
    console.error(msg);
    if (error instanceof Error) {
      return { success: false, message: error.message };
    }
  }
};
