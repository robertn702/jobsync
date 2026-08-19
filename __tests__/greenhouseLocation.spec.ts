import { getGreenhouseLocation } from "@/lib/mcp/tools/greenhouseLocation";

describe("getGreenhouseLocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "job-boards.greenhouse.io",
    "job-boards.eu.greenhouse.io",
    "boards.greenhouse.io",
  ])("looks up canonical jobs from %s", async (host) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ location: { name: "Tel Aviv" } }),
    }) as any;

    await expect(
      getGreenhouseLocation(`https://${host}/acme/jobs/12345`),
    ).resolves.toBe("Tel Aviv");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345",
      expect.any(Object),
    );
  });

  it("does not fetch non-canonical caller URLs", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    await expect(
      getGreenhouseLocation("https://greenhouse.example/acme/jobs/12345"),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
