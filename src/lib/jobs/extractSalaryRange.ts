const CURRENCY_CODE = "USD|CAD|AUD|NZD|EUR|GBP";
const CURRENCY_SYMBOL = "[$€£¥]";
const CURRENCY = `${CURRENCY_SYMBOL}|${CURRENCY_CODE}`;
const AMOUNT = String.raw`(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?[kKmM])?`;
const PAY_PERIOD = String.raw`(?:per\s+(?:hour|day|week|month|year|annum)|\/\s*(?:hr|hour|day|week|month|yr|year)|(?:an|a)\s+hour)`;

const RANGE_PATTERN = new RegExp(
  String.raw`(?<![\w.%])(?:(?<prefix>${CURRENCY})\s*)?(?<minimum>${AMOUNT})\s*(?:-|–|—|to|through)\s*(?:(?<middle>${CURRENCY})\s*)?(?<maximum>${AMOUNT})(?:\s*(?<suffix>${CURRENCY_CODE}))?(?:\s*(?<period>${PAY_PERIOD}))?(?![\w%])`,
  "gi",
);

const SALARY_CONTEXT = /\b(?:salary|pay|compensation|comp|wage|base)\b/i;
const CURRENCY_CODE_PATTERN = new RegExp(`^(?:${CURRENCY_CODE})$`, "i");
const CURRENCY_SYMBOL_PATTERN = new RegExp(`^${CURRENCY_SYMBOL}$`);

function annualAmount(value: string): number {
  const normalized = value.replaceAll(",", "").replaceAll(" ", "");
  const suffix = normalized.at(-1)?.toLowerCase();
  const amount = Number.parseFloat(suffix === "k" || suffix === "m" ? normalized.slice(0, -1) : normalized);

  if (suffix === "k") return amount * 1_000;
  if (suffix === "m") return amount * 1_000_000;
  return amount;
}

export function extractSalaryRange(description: string): string | null {
  RANGE_PATTERN.lastIndex = 0;

  for (const match of description.matchAll(RANGE_PATTERN)) {
    const groups = match.groups;
    if (!groups) continue;

    const markers = [groups.prefix, groups.middle, groups.suffix].filter(
      (value): value is string => Boolean(value),
    );
    if (markers.length === 0) continue;

    const start = match.index ?? 0;
    const context = description.slice(
      Math.max(0, start - 40),
      Math.min(description.length, start + match[0].length + 40),
    );
    const hasCurrencyCode = markers.some((marker) =>
      CURRENCY_CODE_PATTERN.test(marker),
    );
    const repeatedCurrencySymbols = markers.filter((marker) =>
      CURRENCY_SYMBOL_PATTERN.test(marker),
    ).length >= 2;
    const hasPayContext = SALARY_CONTEXT.test(context);
    const hasPayPeriod = Boolean(groups.period);

    if (!hasCurrencyCode && !repeatedCurrencySymbols && !hasPayContext && !hasPayPeriod) {
      continue;
    }

    if (
      !hasPayPeriod &&
      annualAmount(groups.minimum) < 10_000 &&
      annualAmount(groups.maximum) < 10_000
    ) {
      continue;
    }

    return match[0].trim();
  }

  return null;
}
