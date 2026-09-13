import { handleSaveMatchResultsBatch } from "@/lib/mcp/tools/saveMatchResultsBatch";
import { handleSaveMatchResult } from "@/lib/mcp/tools/saveMatchResult";

vi.mock("@/lib/mcp/tools/saveMatchResult", () => ({
  handleSaveMatchResult: vi.fn(),
}));

describe("handleSaveMatchResultsBatch errors", () => {
  it("logs unexpected detail and returns a generic per-item error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    (handleSaveMatchResult as any).mockRejectedValue(
      new Error("secret database topology"),
    );

    const result = await handleSaveMatchResultsBatch(
      {
        results: [{
          jobId: "job-1",
          matchText: "SCORES: match=50 recommendation=partial\n\nAnalysis body.",
        }],
      },
      "user-1",
      "client",
    );

    expect(consoleError).toHaveBeenCalled();
    expect(result.content[0].text).toContain("Unable to save match result.");
    expect(result.content[0].text).not.toContain("topology");
    consoleError.mockRestore();
  });
});
