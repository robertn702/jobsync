import { APP_CONSTANTS } from "@/lib/constants";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

const WINDOW = APP_CONSTANTS.MCP_RATE_LIMIT_WINDOW_MS;
const CLEANUP_THRESHOLD = 500;

function getMaxRateLimit(): number {
  const value = process.env.MCP_RATE_LIMIT_MAX?.trim();

  if (!value) return APP_CONSTANTS.MCP_RATE_LIMIT_MAX;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    return APP_CONSTANTS.MCP_RATE_LIMIT_MAX;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return APP_CONSTANTS.MCP_RATE_LIMIT_MAX;
  }

  return parsed;
}

export function checkMcpRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
  resetIn: number;
} {
  const max = getMaxRateLimit();
  if (max === 0) {
    return { allowed: true, remaining: Infinity, resetIn: 0 };
  }

  const now = Date.now();

  if (store.size > CLEANUP_THRESHOLD) {
    for (const [key, entry] of store) {
      if (now > entry.resetTime) store.delete(key);
    }
  }

  const entry = store.get(userId);

  if (!entry || now > entry.resetTime) {
    store.set(userId, { count: 1, resetTime: now + WINDOW });
    return { allowed: true, remaining: max - 1, resetIn: WINDOW };
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0, resetIn: entry.resetTime - now };
  }

  entry.count++;
  return { allowed: true, remaining: max - entry.count, resetIn: entry.resetTime - now };
}
