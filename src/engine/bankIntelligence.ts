import type { ColumnMapping, ColumnRole } from '../types/statement';
import { parseIndianCurrency } from '../utils/indianFormat';

interface BankSignature {
  name: string;
  patterns: RegExp[];
}

const INDIAN_BANK_SIGNATURES: BankSignature[] = [
  { name: 'Federal Bank', patterns: [/federal bank/i, /\bfdrl0\d{6}/i] },
  { name: 'State Bank of India (SBI)', patterns: [/state bank of india/i, /\bsbi\b/i, /\bsbin\d{7}/i] },
  { name: 'HDFC Bank', patterns: [/hdfc bank/i, /\bhdfc0\d{6}/i] },
  { name: 'ICICI Bank', patterns: [/icici bank/i, /\bicic0\d{6}/i] },
  { name: 'Axis Bank', patterns: [/axis bank/i, /\butib0\d{6}/i] },
  { name: 'Tamilnad Mercantile Bank (TMB)', patterns: [/tamilnad mercantile/i, /\btmb\b/i, /\btmbl0\d{6}/i] },
  { name: 'Kotak Mahindra Bank', patterns: [/kotak mahindra/i, /\bkkbk0\d{6}/i] },
  { name: 'Canara Bank', patterns: [/canara bank/i, /\bcnrb0\d{6}/i] },
  { name: 'Indian Bank', patterns: [/indian bank/i, /\bidib0\d{6}/i] },
  { name: 'Indian Overseas Bank (IOB)', patterns: [/indian overseas bank/i, /\biob\b/i, /\bioba0\d{6}/i] },
  { name: 'Union Bank of India', patterns: [/union bank of india/i, /\bubin0\d{6}/i] },
  { name: 'Bank of Baroda', patterns: [/bank of baroda/i, /\bbarb0\d{6}/i] },
  { name: 'Punjab National Bank (PNB)', patterns: [/punjab national bank/i, /\bpunb0\d{6}/i] },
  { name: 'Yes Bank', patterns: [/yes bank/i, /\byesb0\d{6}/i] },
  { name: 'IndusInd Bank', patterns: [/indusind bank/i, /\bindb0\d{6}/i] },
  { name: 'IDFC FIRST Bank', patterns: [/idfc first/i, /\bidfb0\d{6}/i] },
  { name: 'Karur Vysya Bank (KVB)', patterns: [/karur vysya/i, /\bkvbl0\d{6}/i] },
  { name: 'City Union Bank (CUB)', patterns: [/city union bank/i, /\bciub0\d{6}/i] },
  { name: 'South Indian Bank', patterns: [/south indian bank/i, /\bsibl0\d{6}/i] },
  { name: 'Karnataka Bank', patterns: [/karnataka bank/i, /\bkarb0\d{6}/i] },
  { name: 'CSB Bank', patterns: [/csb bank/i, /catholic syrian/i, /\bcsbk0\d{6}/i] },
  { name: 'RBL Bank', patterns: [/rbl bank/i, /\bratn0\d{6}/i] },
  { name: 'Bandhan Bank', patterns: [/bandhan bank/i, /\bbdbl0\d{6}/i] },
  { name: 'Bank of India', patterns: [/bank of india/i, /\bbkid0\d{6}/i] },
  { name: 'Central Bank of India', patterns: [/central bank of india/i, /\bcbin0\d{6}/i] },
  { name: 'DBS Bank India', patterns: [/dbs bank/i, /\bdbss0\d{6}/i] },
  { name: 'Standard Chartered Bank', patterns: [/standard chartered/i, /\bscbl0\d{6}/i] },
];

export function detectIndianBank(preambleText: string, fileName: string, sampleNarrationText: string): string {
  const headerAndFile = `${fileName}\n${preambleText}`;
  for (const bank of INDIAN_BANK_SIGNATURES) {
    if (bank.patterns.some((rx) => rx.test(headerAndFile))) {
      return bank.name;
    }
  }
  for (const bank of INDIAN_BANK_SIGNATURES) {
    if (bank.patterns.some((rx) => rx.test(sampleNarrationText))) {
      return bank.name;
    }
  }
  return 'Indian Corporate Bank (Auto-Normalized)';
}

export function extractAccountNumber(preambleText: string): string | null {
  const patterns = [
    /(?:account\s*(?:no|number|#)|a\/c\s*(?:no|number)?|acct\s*no)\s*[:\-]?\s*([X*\d]{6,20})/i,
    /(?:cur(?:rent)?\s*a\/c)\s*[:\-]?\s*([X*\d]{6,20})/i,
  ];
  for (const rx of patterns) {
    const m = preambleText.match(rx);
    if (m && m[1]) {
      return m[1].trim();
    }
  }
  return null;
}

export function extractAccountHolderName(preambleText: string): string | null {
  const lines = preambleText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const labelPatterns = [
    /(?:account\s*holder(?:'s)?\s*name|customer\s*name|account\s*name|a\/c\s*name|entity\s*name|company\s*name|name)\s*[:\-]\s*([A-Za-z0-9&.,'()\/\-\s]{3,70})/i,
  ];

  for (const line of lines) {
    for (const rx of labelPatterns) {
      const m = line.match(rx);
      if (m && m[1]) {
        const cleaned = m[1]
          .split(/\b(?:account\s*no|a\/c\s*no|cif|cust\s*id|branch|ifsc|statement|period|currency|address)\b/i)[0]
          .replace(/[:\-|]+$/, '')
          .trim();
        if (cleaned.length >= 3 && !/^\d+$/.test(cleaned)) {
          return cleaned;
        }
      }
    }
    if (/^(?:m\/s\.?\s+|shri\s+|smt\s+)/i.test(line)) {
      const cleaned = line
        .split(/\b(?:account\s*no|a\/c|ifsc|branch)\b/i)[0]
        .trim();
      if (cleaned.length >= 4 && cleaned.length <= 72) {
        return cleaned;
      }
    }
  }

  return null;
}

export function extractExplicitOpeningBalance(preambleText: string): number | null {
  const patterns = [
    /(?:opening\s*balance|open\s*bal|b\/f\s*balance|brought\s*forward)\s*[:\-]?\s*(?:INR|RS\.?|₹)?\s*([\d,]+\.\d{2}(?:\s*(?:CR|DR))?)/i,
  ];
  for (const rx of patterns) {
    const m = preambleText.match(rx);
    if (m && m[1]) {
      const val = parseIndianCurrency(m[1]);
      if (Number.isFinite(val)) {
        return /\bDR\b/i.test(m[1]) && val > 0 ? -val : val;
      }
    }
  }
  return null;
}

function normalizeHeaderToken(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/[._/\-#()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchColumnRole(rawHeader: string): ColumnRole {
  const h = normalizeHeaderToken(rawHeader);
  if (!h) return 'ignore';

  // Value date before transaction date
  if (/(^|\b)(value\s*date|val\s*date|value\s*dt|val\s*dt|v\s*date|vdt|effective\s*date)(\b|$)/.test(h)) {
    return 'valueDate';
  }

  // Transaction Date
  if (
    /(^|\b)(txn\s*date|transaction\s*date|tran\s*date|post\s*date|posting\s*date|tr\s*date|tr\s*dt|trans\s*date|txn\s*dt|entry\s*date|date|dt)(\b|$)/.test(
      h,
    )
  ) {
    return 'date';
  }

  // Dr/Cr indicator column
  if (
    /^(dr\s*cr|cr\s*dr|d\s*c|c\s*d|type|txn\s*type|transaction\s*type|ind|indicator|dr\s*\/\s*cr)$/.test(h) ||
    /(dr\s*cr\s*ind|debit\s*credit\s*ind)/.test(h)
  ) {
    return 'drcr';
  }

  // Balance
  if (/(closing\s*bal|running\s*bal|available\s*bal|balance|bal\b)/.test(h) && !/opening/.test(h)) {
    return 'balance';
  }

  // Debit / Withdrawal
  if (/(withdrawal|debit|dr\s*amt|dr\s*amount|debit\s*amt|debit\s*amount|paid\s*out|outflow|^dr$)/.test(h)) {
    return 'debit';
  }

  // Credit / Deposit
  if (/(deposit|credit|cr\s*amt|cr\s*amount|credit\s*amt|credit\s*amount|paid\s*in|inflow|^cr$)/.test(h)) {
    return 'credit';
  }

  // Single Amount column
  if (/(transaction\s*amount|txn\s*amount|tran\s*amount|tran\s*amt|txn\s*amt|^amount$|^amt$)/.test(h)) {
    return 'amount';
  }

  // Cheque / Reference Number
  if (
    /(chq|cheque|ref\s*no|reference|instrument|tran\s*id|txn\s*id|utr|inst\s*no|chq\s*ref|^ref$)/.test(h) &&
    !/(date|amt|amount)/.test(h)
  ) {
    return 'refNo';
  }

  // Narration / Particulars / Description
  if (
    /(particular|description|narration|transaction\s*details|txn\s*details|tran\s*particular|remarks|details|memo|^desc$)/.test(
      h,
    )
  ) {
    return 'narration';
  }

  return 'ignore';
}

function scoreHeaderRow(row: string[]): number {
  if (row.length < 3) return -1;
  const roles = row.map(matchColumnRole);
  const uniqueRoles = new Set(roles.filter((r) => r !== 'ignore'));

  let score = 0;
  if (uniqueRoles.has('date') || uniqueRoles.has('valueDate')) score += 4;
  if (uniqueRoles.has('narration')) score += 4;
  if (uniqueRoles.has('debit') && uniqueRoles.has('credit')) score += 5;
  else if (uniqueRoles.has('amount')) score += 3;
  if (uniqueRoles.has('balance')) score += 3;
  if (uniqueRoles.has('refNo')) score += 2;
  if (uniqueRoles.has('drcr')) score += 2;

  // Penalize very long prose rows that happen to contain keywords like "Date" or "Balance"
  const totalChars = row.reduce((acc, c) => acc + c.length, 0);
  if (totalChars > 240) score -= 5;
  if (row.some((c) => c.length > 60)) score -= 4;

  // Require at least a date column + one financial/narration column
  if (!(uniqueRoles.has('date') || uniqueRoles.has('valueDate'))) {
    score -= 6;
  }

  return score;
}

export function detectHeaderAndMapping(rows: string[][], overrideHeaderIndex?: number): ColumnMapping {
  let headerRowIndex = overrideHeaderIndex ?? 0;

  if (overrideHeaderIndex === undefined) {
    let bestScore = -Infinity;
    const scanLimit = Math.min(rows.length, 100);
    for (let i = 0; i < scanLimit; i++) {
      const s = scoreHeaderRow(rows[i]);
      if (s > bestScore) {
        bestScore = s;
        headerRowIndex = i;
      }
    }
    if (bestScore < 5) {
      // No reliable header row detected — signal Headerless Pattern-First mode (-1)
      return {
        headerRowIndex: -1,
        headers: [],
        roles: [],
      };
    }
  }

  const rawHeaders = rows[headerRowIndex] || [];
  const roles = rawHeaders.map(matchColumnRole);

  // If no primary 'date' column was found, promote 'valueDate' to 'date'
  if (!roles.includes('date') && roles.includes('valueDate')) {
    const idx = roles.indexOf('valueDate');
    roles[idx] = 'date';
  }

  // Deduplicate roles so only the strongest/first column owns each singular role
  const seen = new Set<ColumnRole>();
  const finalRoles = roles.map((role) => {
    if (role === 'ignore') return 'ignore';
    if (seen.has(role)) return 'ignore';
    seen.add(role);
    return role;
  });

  return {
    headerRowIndex,
    headers: rawHeaders,
    roles: finalRoles,
  };
}
