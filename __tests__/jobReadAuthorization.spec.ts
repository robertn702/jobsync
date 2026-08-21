import { authorizeJobRead } from "@/lib/integrations/jobReadAuthorization";
import { resolveMcpToken } from "@/lib/mcp/auth";
import { checkMcpRateLimit } from "@/lib/mcp/rate-limit";

vi.mock("@/lib/mcp/auth", () => ({
  resolveMcpToken: vi.fn(),
}));

vi.mock("@/lib/mcp/rate-limit", () => ({
  checkMcpRateLimit: vi.fn(),
}));

function requestWithCallerUser(userId = "attacker-user"): Request {
  return new Request(`http://localhost/api/integrations/jobs?userId=${userId}`, {
    headers: { "x-user-id": userId },
  });
}

describe("authorizeJobRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkMcpRateLimit as any).mockReturnValue({
      allowed: true,
      remaining: 59,
      resetIn: 60_000,
    });
  });

  it.each(["Invalid token", "Token expired"])(
    "passes through token authentication failure: %s",
    async (error) => {
      (resolveMcpToken as any).mockResolvedValue({ ok: false, status: 401, error });

      const result = await authorizeJobRead(requestWithCallerUser());

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected authorization failure");
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({ error });
      expect(checkMcpRateLimit).not.toHaveBeenCalled();
    },
  );

  it.each(["jobs:read", "jobs:write"])("accepts compatible scope %s", async (scope) => {
    (resolveMcpToken as any).mockResolvedValue({
      ok: true,
      userId: "owner-user",
      scopes: [scope],
      tokenName: "integration-token",
    });

    await expect(authorizeJobRead(requestWithCallerUser())).resolves.toEqual({
      ok: true,
      userId: "owner-user",
    });
    expect(checkMcpRateLimit).toHaveBeenCalledWith("owner-user");
  });

  it.each([[[]], [["questions:write"]]])("rejects scopes without job read access: %j", async (scopes) => {
    (resolveMcpToken as any).mockResolvedValue({
      ok: true,
      userId: "owner-user",
      scopes,
      tokenName: "integration-token",
    });

    const result = await authorizeJobRead(requestWithCallerUser());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected authorization failure");
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toEqual({
      error: "Insufficient scope. Required: jobs:read",
    });
    expect(checkMcpRateLimit).not.toHaveBeenCalled();
  });

  it("ignores caller-provided user IDs and returns the token owner", async () => {
    (resolveMcpToken as any).mockResolvedValue({
      ok: true,
      userId: "owner-user",
      scopes: ["jobs:read"],
      tokenName: "integration-token",
    });

    await expect(authorizeJobRead(requestWithCallerUser("attacker-user"))).resolves.toEqual({
      ok: true,
      userId: "owner-user",
    });
    expect(checkMcpRateLimit).toHaveBeenCalledWith("owner-user");
  });

  it("applies the existing rate limit to the token-derived owner", async () => {
    (resolveMcpToken as any).mockResolvedValue({
      ok: true,
      userId: "owner-user",
      scopes: ["jobs:read"],
      tokenName: "integration-token",
    });
    (checkMcpRateLimit as any).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetIn: 1_500,
    });

    const result = await authorizeJobRead(requestWithCallerUser());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected rate limit failure");
    expect(checkMcpRateLimit).toHaveBeenCalledWith("owner-user");
    expect(result.response.status).toBe(429);
    expect(result.response.headers.get("Retry-After")).toBe("2");
  });
});
