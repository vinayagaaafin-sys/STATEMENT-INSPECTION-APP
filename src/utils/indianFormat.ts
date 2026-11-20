const MONTH_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function formatINR(amount: number, includeDecimals = true): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const isNeg = safe < 0;
  const absVal = Math.abs(safe);
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0,
  }).format(absVal);

  return `${isNeg ? '-' : ''}₹ ${formatted}`;
}

export function formatRs(amount: number, includeDecimals = true): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const isNeg = safe < 0;
  const absVal = Math.abs(safe);
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0,
  }).format(absVal);

  return `${isNeg ? '-' : ''}Rs. ${formatted}`;
}

export function formatCompactINR(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10_000_000) {
    return `${sign}₹${(abs / 10_000_000).toFixed(2)} Cr`;
  }
  if (abs >= 100_000) {
    const lakhs = abs / 100_000;
    return `${sign}₹${Number.isInteger(lakhs) ? lakhs : lakhs.toFixed(2)} L`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    return `${sign}₹${Number.isInteger(k) ? k : k.toFixed(1)} K`;
  }
  return `${sign}₹${abs.toFixed(0)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface ParsedAmountResult {
  value: number;
  indicator: 'DR' | 'CR' | null;
}

/**
 * Strict Indian Currency Number Sanitizer:
 * 1) Strips currency symbols (₹, Rs., INR), spaces, and trailing Cr/Dr indicators.
 * 2) Removes ALL commas (Indian 12,34,567.89 and Western 1,234,567.89).
 * 3) Validates exact numeric pattern /^-?\d+(\.\d{1,2})?$/ before parsing.
 * 4) Returns 0 for '-', 'nil', 'blank', or '0.00'.
 */
export function parseIndianCurrency(rawStr: string | number | null | undefined): number {
  if (rawStr === null || rawStr === undefined) return 0;
  if (typeof rawStr === 'number') {
    return Number.isFinite(rawStr) ? Math.round((rawStr + Number.EPSILON) * 100) / 100 : 0;
  }

  let s = String(rawStr).replace(/\u00A0/g, ' ').trim();
  if (!s) return 0;

  const upper = s.toUpperCase();
  if (upper === '-' || upper === '--' || upper === 'NIL' || upper === 'N/A' || upper === 'NA') {
    return 0;
  }

  const isParenthesizedNeg = /^\(.*\)$/.test(s);

  // Strip currency symbols, Cr/Dr markers, all commas, parentheses, and spaces
  s = s
    .replace(/INR|RS\.?|₹/gi, '')
    .replace(/\(?\s*(CR|DR)\.?\s*\)?/gi, '')
    .replace(/[(),\s]/g, '')
    .replace(/^\+/, '')
    .trim();

  if (!s || s === '-') return 0;

  // Handle >2 decimal precision edge cases cleanly by truncating/rounding only if numeric
  if (/^-?\d+\.\d{3,}$/.test(s)) {
    const val = Number(s);
    if (!Number.isFinite(val)) return 0;
    const rounded = Math.round((val + Number.EPSILON) * 100) / 100;
    return isParenthesizedNeg && rounded > 0 ? -rounded : rounded;
  }

  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) {
    return 0;
  }

  const num = Number.parseFloat(s);
  if (!Number.isFinite(num)) return 0;
  return isParenthesizedNeg && num > 0 ? -num : num;
}

export function parseIndianAmount(raw: string | number | null | undefined): ParsedAmountResult | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return {
      value: Math.round((raw + Number.EPSILON) * 100) / 100,
      indicator: raw < 0 ? 'DR' : null,
    };
  }

  const original = String(raw).replace(/\u00A0/g, ' ').trim();
  if (!original) return null;
  const upper = original.toUpperCase();
  if (upper === '-' || upper === '--' || upper === 'NIL' || upper === 'N/A' || upper === 'NA') {
    return null;
  }

  let indicator: 'DR' | 'CR' | null = null;
  if (/\bCR\b|\(CR\)|CR\.?$/i.test(upper)) {
    indicator = 'CR';
  } else if (/\bDR\b|\(DR\)|DR\.?$/i.test(upper)) {
    indicator = 'DR';
  }

  const sanitized = original
    .replace(/INR|RS\.?|₹/gi, '')
    .replace(/\(?\s*(CR|DR)\.?\s*\)?/gi, '')
    .replace(/[(),\s]/g, '')
    .replace(/^\+/, '')
    .trim();

  if (!sanitized || sanitized === '-' || !/^-?\d+(\.\d+)?$/.test(sanitized)) {
    return null;
  }

  const value = parseIndianCurrency(original);
  if (value < 0 && !indicator) {
    indicator = 'DR';
  }

  return { value, indicator };
}

export interface ParsedDateResult {
  display: string;
  iso: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function buildValidDate(day: number, month: number, year: number): ParsedDateResult | null {
  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }
  if (year < 1990 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return {
    display: `${pad2(day)}-${pad2(month)}-${year}`,
    iso: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

export function parseIndianDate(raw: string | number | null | undefined): ParsedDateResult | null {
  if (raw === null || raw === undefined) return null;

  // Handle Excel numeric date serial (e.g. 45321)
  if (typeof raw === 'number' || /^\d{5}(\.\d+)?$/.test(String(raw).trim())) {
    const serial = typeof raw === 'number' ? raw : Number.parseFloat(String(raw).trim());
    if (serial >= 35000 && serial <= 65000) {
      const utcDays = Math.floor(serial - 25569);
      const dt = new Date(utcDays * 86400 * 1000);
      return buildValidDate(dt.getUTCDate(), dt.getUTCMonth() + 1, dt.getUTCFullYear());
    }
  }

  let str = String(raw).trim();
  if (!str) return null;

  // Strip trailing timestamp if present (e.g., "14/11/2026 10:23:45" or "2026-11-14T00:00:00")
  str = str.split(/[T\s]+\d{1,2}:\d{2}/)[0].trim();

  // 1. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (and 2-digit year)
  let m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const p1 = Number.parseInt(m[1], 10);
    const p2 = Number.parseInt(m[2], 10);
    const yr = Number.parseInt(m[3], 10);
    // Indian bank statements are DD/MM/YYYY; fallback to MM/DD only if p2 > 12
    if (p2 <= 12) {
      return buildValidDate(p1, p2, yr);
    }
    if (p1 <= 12) {
      return buildValidDate(p2, p1, yr);
    }
    return null;
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD
  m = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) {
    return buildValidDate(
      Number.parseInt(m[3], 10),
      Number.parseInt(m[2], 10),
      Number.parseInt(m[1], 10),
    );
  }

  // 3. DD-MMM-YYYY or DD MMM YYYY or DD-MMM-YY (e.g., 14-Nov-2026, 02 Jan 26)
  m = str.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/,]+(\d{2,4})$/);
  if (m) {
    const day = Number.parseInt(m[1], 10);
    const mon = MONTH_MAP[m[2].toLowerCase()];
    const yr = Number.parseInt(m[3], 10);
    if (mon) {
      return buildValidDate(day, mon, yr);
    }
  }

  // 4. MMM DD, YYYY
  m = str.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mon = MONTH_MAP[m[1].toLowerCase()];
    const day = Number.parseInt(m[2], 10);
    const yr = Number.parseInt(m[3], 10);
    if (mon) {
      return buildValidDate(day, mon, yr);
    }
  }

  return null;
}

const STRICT_DECIMAL_MONEY_TOKEN_RX =
  /^[-+(]?(?:₹|INR|RS\.?)?\s*(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2}\)?(?:\s*(?:CR|DR)\.?)?$/i;

export function isStrictDecimalMoneyToken(raw: string): boolean {
  const s = String(raw || '').replace(/\u00A0/g, ' ').trim();
  if (!s) return false;
  if (!STRICT_DECIMAL_MONEY_TOKEN_RX.test(s)) return false;
  return parseIndianAmount(s) !== null;
}

export function isLikelyCurrencyToken(raw: string): boolean {
  // Enforce strict 2-decimal precision so cheque numbers / UTRs / dates are never matched
  return isStrictDecimalMoneyToken(raw);
}

const INLINE_DATE_RX =
  /\b(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\s\-\/](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[\s\-\/,]+\d{2,4})\b/gi;

export function extractDatesFromText(raw: string): {
  dates: ParsedDateResult[];
  remainder: string;
} {
  const dates: ParsedDateResult[] = [];
  let remainder = raw;
  const matches = Array.from(raw.matchAll(INLINE_DATE_RX));
  for (const match of matches) {
    const token = match[0];
    const parsed = parseIndianDate(token);
    if (parsed) {
      dates.push(parsed);
    }
  }
  if (dates.length > 0) {
    // Strip matched leading dates from remainder
    remainder = raw.replace(INLINE_DATE_RX, ' ').replace(/\s+/g, ' ').trim();
  }
  return { dates, remainder };
}

