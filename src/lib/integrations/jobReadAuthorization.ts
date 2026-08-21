import { resolveMcpToken } from "@/lib/mcp/auth";
import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";

type JobReadAuthorization =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

export async function authorizeJobRead(req: Request): Promise<JobReadAuthorization> {
  const auth = await resolveMcpToken(req);
  if (!auth.ok) {
    return {
      ok: false,
      response: Response.json({ error: auth.error }, { status: auth.status }),
    };
  }

  if (!auth.scopes.includes("jobs:read") && !auth.scopes.includes("jobs:write")) {
    return {
      ok: false,
      response: Response.json(
        { error: "Insufficient scope. Required: jobs:read" },
        { status: 403 },
      ),
    };
  }

  const rateLimit = checkMcpRateLimit(auth.userId);
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil(rateLimit.resetIn / 1000);
    return {
      ok: false,
      response: Response.json(
        { error: `Rate limit exceeded. Try again in ${retryAfter}s.` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      ),
    };
  }

  return { ok: true, userId: auth.userId };
}
