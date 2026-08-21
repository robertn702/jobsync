import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { config } from "@/middleware";

describe("middleware API matcher", () => {
  const doesMatch = (url: string) =>
    unstable_doesMiddlewareMatch({ config, url });

  it("exempts the job integration index and details", () => {
    expect(doesMatch("/api/integrations/jobs")).toBe(false);
    expect(doesMatch("/api/integrations/jobs?limit=10")).toBe(false);
    expect(doesMatch("/api/integrations/jobs/child")).toBe(false);
    expect(doesMatch("/api/integrations/jobs/child/deeper")).toBe(true);
  });

  it("continues protecting unrelated APIs", () => {
    expect(doesMatch("/api/jobs")).toBe(true);
    expect(doesMatch("/api/integrations/jobs-export")).toBe(true);
    expect(doesMatch("/api/integrations/resumes")).toBe(true);
    expect(doesMatch("/api/mcp")).toBe(false);
  });
});
