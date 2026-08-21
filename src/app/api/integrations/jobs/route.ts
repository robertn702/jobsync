import { authorizeJobRead } from "@/lib/integrations/jobReadAuthorization";
import {
  getDefaultResumeIndexItem,
  listJobIndex,
  parseJobIndexQuery,
} from "@/lib/integrations/jobIndex";

export async function GET(req: Request): Promise<Response> {
  const authorization = await authorizeJobRead(req);
  if (!authorization.ok) return authorization.response;

  let query: ReturnType<typeof parseJobIndexQuery>;
  try {
    query = parseJobIndexQuery(req.url);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid pagination" },
      { status: 400 },
    );
  }

  try {
    const [page, defaultResume] = await Promise.all([
      listJobIndex(authorization.userId, query.cursorId, query.limit),
      getDefaultResumeIndexItem(authorization.userId),
    ]);
    return Response.json({ ...page, defaultResume });
  } catch (error) {
    console.error("Failed to list integration jobs:", error);
    return Response.json({ error: "Failed to list jobs" }, { status: 500 });
  }
}
