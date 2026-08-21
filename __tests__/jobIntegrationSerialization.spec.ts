import {
  createDefaultResumeFingerprint,
  createJobFingerprint,
  normalizeStoredDescription,
  resolveDescriptionCompleteness,
  type JobFingerprintInput,
} from "@/lib/integrations/jobSerialization";

const words = (count: number) =>
  Array.from({ length: count }, (_, index) => `word${index}`).join(" ");

const job: JobFingerprintInput = {
  id: "job-1",
  jobUrl: "https://example.com/jobs/1",
  title: "Senior Software Engineer",
  company: "Example Corp",
  location: "New York, NY",
  workplaceType: "hybrid",
  jobType: "Full-time",
  salaryRange: "$190,000-$220,000",
};

const normalizedDescription = "Build reliable systems. • Own services";

describe("normalizeStoredDescription", () => {
  it("normalizes stored HTML to deterministic plain text", () => {
    expect(
      normalizeStoredDescription(
        "<h2>Responsibilities</h2><p>Build &amp; operate systems.</p><ul><li>Own services</li><li>Mentor engineers</li></ul>",
      ),
    ).toBe("Responsibilities Build & operate systems. • Own services • Mentor engineers");
  });

  it("normalizes markdown bullets and whitespace without retaining markup", () => {
    expect(
      normalizeStoredDescription(
        "  RESPONSIBILITIES\r\n\r\n- Build systems\r\n* Mentor engineers  ",
      ),
    ).toBe("RESPONSIBILITIES • Build systems • Mentor engineers");
  });

  it("normalizes equivalent HTML and markdown to the same text", () => {
    expect(
      normalizeStoredDescription(
        "<h2>Responsibilities</h2><ul><li>Build systems</li><li>Mentor engineers</li></ul>",
      ),
    ).toBe(
      normalizeStoredDescription(
        "## Responsibilities\n\n- Build systems\n- Mentor engineers",
      ),
    );
  });

  it("normalizes mixed HTML and markdown", () => {
    expect(
      normalizeStoredDescription(
        "<h2>Responsibilities</h2>\n\n- Build **reliable** systems",
      ),
    ).toBe("Responsibilities • Build reliable systems");
  });
});

describe("resolveDescriptionCompleteness", () => {
  it("preserves stored completeness", () => {
    expect(resolveDescriptionCompleteness("partial", words(150))).toBe(
      "partial",
    );
  });

  it("classifies normalized text when stored completeness is missing", () => {
    expect(resolveDescriptionCompleteness(null, words(39))).toBe("title-only");
    expect(resolveDescriptionCompleteness(undefined, words(40))).toBe("partial");
    expect(resolveDescriptionCompleteness(null, words(150))).toBe("full");
  });
});

describe("createJobFingerprint", () => {
  it("is deterministic", () => {
    expect(createJobFingerprint(job, normalizedDescription, "full")).toBe(
      createJobFingerprint({ ...job }, normalizedDescription, "full"),
    );
  });

  it.each([
    ["id", "job-2"],
    ["jobUrl", "https://example.com/jobs/2"],
    ["title", "Staff Software Engineer"],
    ["company", "Another Corp"],
    ["location", "Calgary, AB"],
    ["workplaceType", "remote"],
    ["jobType", "Contract"],
    ["salaryRange", "$210,000"],
  ] satisfies Array<[keyof JobFingerprintInput, JobFingerprintInput[keyof JobFingerprintInput]]>)(
    "changes when %s changes",
    (field, value) => {
      expect(
        createJobFingerprint(
          { ...job, [field]: value },
          normalizedDescription,
          "full",
        ),
      ).not.toBe(createJobFingerprint(job, normalizedDescription, "full"));
    },
  );

  it("allows a nullable job URL", () => {
    expect(() =>
      createJobFingerprint({ ...job, jobUrl: null }, normalizedDescription, "full"),
    ).not.toThrow();
    expect(
      createJobFingerprint(
        { ...job, jobUrl: null },
        normalizedDescription,
        "full",
      ),
    ).not.toBe(
      createJobFingerprint(job, normalizedDescription, "full"),
    );
  });

  it("changes when normalized description content changes", () => {
    expect(
      createJobFingerprint(job, "Lead reliable systems.", "full"),
    ).not.toBe(
      createJobFingerprint(job, normalizedDescription, "full"),
    );
  });

  it("is stable when stored markup normalizes to the same description", () => {
    expect(
      createJobFingerprint(
        job,
        normalizeStoredDescription("<p>Build reliable systems.</p>"),
        "full",
      ),
    ).toBe(
      createJobFingerprint(
        job,
        normalizeStoredDescription("  Build reliable systems.  "),
        "full",
      ),
    );
  });

  it("changes when completeness changes", () => {
    expect(createJobFingerprint(job, normalizedDescription, "partial")).not.toBe(
      createJobFingerprint(job, normalizedDescription, "full"),
    );
  });
});

describe("createDefaultResumeFingerprint", () => {
  const resume = {
    id: "resume-1",
    title: "Backend Resume",
    normalizedContent: "SUMMARY\nBackend engineer",
  };

  it("is deterministic", () => {
    expect(createDefaultResumeFingerprint(resume)).toBe(
      createDefaultResumeFingerprint({ ...resume }),
    );
  });

  it.each([
    ["id", "resume-2"],
    ["title", "Platform Resume"],
    ["normalizedContent", "SUMMARY\nPlatform engineer"],
  ] as const)("changes when %s changes", (field, value) => {
    expect(
      createDefaultResumeFingerprint({ ...resume, [field]: value }),
    ).not.toBe(createDefaultResumeFingerprint(resume));
  });
});
