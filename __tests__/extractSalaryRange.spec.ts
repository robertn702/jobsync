import { extractSalaryRange } from "@/lib/jobs/extractSalaryRange";

describe("extractSalaryRange", () => {
  it.each([
    ["Salary: $120k–$150k", "$120k–$150k"],
    ["Base pay is $120,000 to $150,000 USD.", "$120,000 to $150,000 USD"],
    ["Compensation: CAD 100,000 - 130,000", "CAD 100,000 - 130,000"],
    ["100,000–130,000 CAD", "100,000–130,000 CAD"],
    ["Pay range: $50-$75 per hour", "$50-$75 per hour"],
  ])("extracts an explicit range from %s", (description, expected) => {
    expect(extractSalaryRange(description)).toBe(expected);
  });

  it.each([
    "Experience with releases from 2024-2026.",
    "The team has 100-150 engineers.",
    "Annual bonus target is 10%-20%.",
    "Salary starts at $120,000.",
    "The project budget is $100-$200.",
  ])("does not invent a range from %s", (description) => {
    expect(extractSalaryRange(description)).toBeNull();
  });
});
