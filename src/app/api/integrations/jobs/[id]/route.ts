import { getOwnedJobDetail } from "@/lib/integrations/jobDetail";
import { getDefaultResumeDetailItem } from "@/lib/integrations/jobIndex";
import { authorizeJobRead } from "@/lib/integrations/jobReadAuthorization";

const notFoundResponse = () =>
  Response.json({ error: "Job not found" }, { status: 404 });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const authorization = await authorizeJobRead(req);
  if (!authorization.ok) return authorization.response;

  try {
    const { id } = await params;
    const job = await getOwnedJobDetail(authorization.userId, id);
    if (!job) return notFoundResponse();

    const defaultResume = await getDefaultResumeDetailItem(
      authorization.userId,
    );
    return Response.json({ job, defaultResume });
  } catch (error) {
    console.error("Failed to read integration job:", error);
    return Response.json({ error: "Failed to read job" }, { status: 500 });
  }
}
