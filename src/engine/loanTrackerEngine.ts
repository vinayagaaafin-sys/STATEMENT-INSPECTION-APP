import type {
  InstitutionalLoanGroup,
  LoanAnalysisSummary,
  LoanRiskClassification,
  NormalizedTransaction,
  TracedDueDebit,
  TracedLoanChain,
} from '../types/statement';

const INSTITUTIONAL_KEYWORD_PATTERNS: Array<{ label: string; rx: RegExp }> = [
  { label: 'EMI', rx: /\bEMI\b/i },
  { label: 'LOAN', rx: /\b(TERM\s*LOAN|HAND\s*LOAN|BUSINESS\s*LOAN|LOAN)\b/i },
  { label: 'ACH', rx: /\bACH[\s\/\-]?(?:DR|DEBIT)?\b/i },
  { label: 'NACH', rx: /\bNACH[\s\/\-]?(?:DR|DEBIT)?\b/i },
  { label: 'ECS', rx: /\bECS[\s\/\-]?(?:DR|DEBIT)?\b/i },
  { label: 'FINANCE', rx: /\bFINANCE\b/i },
  { label: 'CAPITAL', rx: /\bCAPITAL\b/i },
  { label: 'FINSERV', rx: /\bFINSERV\b/i },
  { label: 'BAJAJ', rx: /\bBAJAJ\b/i },
  { label: 'TATA CAP', rx: /\bTATA\s*CAP(?:ITAL)?\b/i },
  { label: 'CHOLA', rx: /\bCHOLA(?:MANDALAM)?\b/i },
  { label: 'SHRIRAM', rx: /\bSHRIRAM\b/i },
  { label: 'HDB', rx: /\bHDB\s*(?:FIN|FINANCIAL|FS)?\b/i },
  { label: 'MUTHOOT', rx: /\bMUTHOOT\b/i },
  { label: 'MANAPPURAM', rx: /\bMANAPPURAM\b/i },
  { label: 'LENDINGKART', rx: /\bLENDINGKART\b/i },
  { label: 'UGRO', rx: /\bUGRO\b/i },
  { label: 'NEOGROWTH', rx: /\bNEO\s*GROWTH|\bNEO\b/i },
  { label: 'OD INT', rx: /\b(?:OD|CC)\s*INT(?:EREST)?\b/i },
  { label: 'INSTALLMENT', rx: /\bINSTAL{1,2}MENT\b/i },
  { label: 'L&T FIN', rx: /\bL\s*&\s*T\s*FIN/i },
  { label: 'SMFG / FULLERTON', rx: /\b(?:FULLERTON|SMFG)\b/i },
  { label: 'IIFL', rx: /\bIIFL\b/i },
  { label: 'INDIABULLS', rx: /\bINDIABULLS\b/i },
  { label: 'PIRAMAL', rx: /\bPIRAMAL\b/i },
  { label: 'ADITYA BIRLA FIN', rx: /\bADITYA\s*BIRLA\b/i },
  { label: 'HERO FINCORP', rx: /\bHERO\s*FIN/i },
  { label: 'MAHINDRA FIN', rx: /\bMAHINDRA\s*FIN/i },
  { label: 'SUNDARAM FIN', rx: /\bSUNDARAM\s*FIN/i },
  { label: 'CLIX / PROTIUM', rx: /\b(?:CLIX|PROTIUM|FLEXILOANS|POONAWALLA|MAS\s*FIN|KISETSU)\b/i },
];

const STATUTORY_OR_UTILITY_EXCLUSION_RX =
  /\b(GST\s*PAYMENT|CGST|SGST|IGST|TDS\s*CHALLAN|INCOME\s*TAX|ADVANCE\s*TAX|EPFO|ESIC|PF\s*PAYMENT|BESCOM|MSEDCL|TANGEDCO|ELECTRICITY\s*BILL|WATER\s*BILL|AIRTEL|JIO\s*FIBER|BROADBAND)\b/i;

const ENTITY_STOP_WORDS = new Set([
  'M',
  'S',
  'MS',
  'MR',
  'MRS',
  'SHRI',
  'SMT',
  'DR',
  'PVT',
  'PRIVATE',
  'LTD',
  'LIMITED',
  'LLP',
  'OPC',
  'INC',
  'CORP',
  'CO',
  'NEFT',
  'RTGS',
  'IMPS',
  'UPI',
  'CHQ',
  'CHEQUE',
  'CLG',
  'CTS',
  'INW',
  'ACH',
  'NACH',
  'ECS',
  'FT',
  'TRF',
  'TRANSFER',
  'CR',
  'DR',
  'BY',
  'TO',
  'FROM',
  'FOR',
  'THE',
  'AND',
  'OF',
  'A',
  'IN',
  'ON',
  'PAID',
  'PMT',
  'PAY',
  'BILL',
  'REF',
  'TXN',
  'UTR',
  'TRAN',
  'INB',
  'MB',
  'IB',
  'P2A',
  'P2M',
  'SELF',
  'CASH',
  'UNSPECIFIED',
  'NO',
  'NARRATION',
  'LOAN',
  'DISBURSAL',
  'DISBURSEMENT',
  'REPAYMENT',
  'INT',
  'INTEREST',
  'DUE',
  'EMI',
  'INSTALLMENT',
  'INSTALMENT',
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
  'INV',
  'INVOICE',
]);

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function extractInstitutionalLenderName(tx: NormalizedTransaction): {
  lenderName: string;
  normalizedKey: string;
} {
  const combined = `${tx.counterparty} ${tx.narration}`;

  // Prefer canonical well-known NBFC/lender match if present so variations collapse cleanly
  const canonicalNbfcs: Array<{ name: string; rx: RegExp }> = [
    { name: 'Bajaj Finserv / Finance', rx: /\bBAJAJ\b/i },
    { name: 'Tata Capital', rx: /\bTATA\s*CAP(?:ITAL)?\b/i },
    { name: 'Cholamandalam Finance', rx: /\bCHOLA(?:MANDALAM)?\b/i },
    { name: 'Shriram Finance', rx: /\bSHRIRAM\b/i },
    { name: 'HDB Financial Services', rx: /\bHDB\b/i },
    { name: 'Muthoot Finance', rx: /\bMUTHOOT\b/i },
    { name: 'Manappuram Finance', rx: /\bMANAPPURAM\b/i },
    { name: 'Lendingkart Finance', rx: /\bLENDINGKART\b/i },
    { name: 'UGRO Capital', rx: /\bUGRO\b/i },
    { name: 'NeoGrowth Credit', rx: /\bNEO\s*GROWTH|\bNEO\b/i },
    { name: 'L&T Finance', rx: /\bL\s*&\s*T\s*FIN/i },
    { name: 'SMFG India Credit / Fullerton', rx: /\b(?:FULLERTON|SMFG)\b/i },
    { name: 'IIFL Finance', rx: /\bIIFL\b/i },
    { name: 'Indiabulls Finance', rx: /\bINDIABULLS\b/i },
    { name: 'Piramal Capital & Finance', rx: /\bPIRAMAL\b/i },
    { name: 'Aditya Birla Finance', rx: /\bADITYA\s*BIRLA\b/i },
    { name: 'Hero FinCorp', rx: /\bHERO\s*FIN/i },
    { name: 'Mahindra Finance', rx: /\bMAHINDRA\s*FIN/i },
    { name: 'Sundaram Finance', rx: /\bSUNDARAM\s*FIN/i },
    { name: 'Clix Capital', rx: /\bCLIX\b/i },
    { name: 'Protium Finance', rx: /\bPROTIUM\b/i },
    { name: 'FlexiLoans', rx: /\bFLEXILOANS\b/i },
    { name: 'Poonawalla Fincorp', rx: /\bPOONAWALLA\b/i },
    { name: 'Overdraft / CC Interest', rx: /\b(?:OD|CC)\s*INT(?:EREST)?\b/i },
  ];

  for (const c of canonicalNbfcs) {
    if (c.rx.test(combined)) {
      return {
        lenderName: c.name,
        normalizedKey: c.name.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
      };
    }
  }

  // Otherwise clean counterparty (only if it has real entity tokens) or narration
  const cpTokens = normalizeEntityTokens(tx.counterparty || '');
  const rawBase = cpTokens.length > 0 ? tx.counterparty : tx.narration;

  const cleaned = rawBase
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, ' ')
    .replace(
      /\b(?:TO|BY|FROM|CLG|CHQ|CHEQUE|CTS|INW|ACH|NACH|ECS|EMI|LOAN|REPAYMENT|INSTAL{1,2}MENT|NEFT|RTGS|IMPS|UPI|FT|TRF|DR|CR|INT|INTEREST|DUE|PMT|PAID|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/gi,
      ' ',
    )
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/[^A-Za-z\s&.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter((w) => w.length >= 2).slice(0, 4);
  const label = words.length > 0 ? toTitleCase(words.join(' ')) : 'Institutional Loan Account';
  return {
    lenderName: label,
    normalizedKey: label.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
  };
}

export function normalizeEntityTokens(raw: string): string[] {
  const cleaned = raw
    .toUpperCase()
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, ' ') // IFSC
    .replace(/\b[A-Z]{2,6}\d{6,}\b/g, ' ') // Alphanumeric UTRs
    .replace(/\b\d+\b/g, ' ')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];
  return cleaned
    .split(' ')
    .filter((tok) => tok.length >= 2 && !ENTITY_STOP_WORDS.has(tok));
}

export function buildEntityKey(raw: string): string {
  return normalizeEntityTokens(raw).slice(0, 4).join(' ');
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function tokensFuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4) {
    if (a.startsWith(b) || b.startsWith(a)) return true;
    const maxLen = Math.max(a.length, b.length);
    const dist = levenshteinDistance(a, b);
    if (1 - dist / maxLen >= 0.78) return true;
  }
  return false;
}

const GENERIC_BUSINESS_SUFFIXES = new Set([
  'ENTERPRISE',
  'ENTERPRISES',
  'TRADING',
  'TRADERS',
  'HOLDINGS',
  'ASSOCIATES',
  'VENTURES',
  'INDIA',
  'INDUSTRIES',
  'SERVICES',
  'SOLUTIONS',
  'GROUP',
  'COMPANY',
  'BROTHERS',
  'SONS',
  'AGENCY',
  'AGENCIES',
]);

export function computeCounterpartySimilarity(
  sourceTokens: string[],
  targetText: string,
): { score: number; reason: string } {
  if (sourceTokens.length === 0) return { score: 0, reason: '' };
  const targetTokens = normalizeEntityTokens(targetText);
  if (targetTokens.length === 0) return { score: 0, reason: '' };

  let matchedCount = 0;
  let strongDistinctiveMatch = false;

  for (const sTok of sourceTokens) {
    const matched = targetTokens.some((tTok) => tokensFuzzyMatch(sTok, tTok));
    if (matched) {
      matchedCount += 1;
      if (sTok.length >= 4 && !GENERIC_BUSINESS_SUFFIXES.has(sTok)) {
        strongDistinctiveMatch = true;
      }
    }
  }

  if (matchedCount === 0) return { score: 0, reason: '' };

  // Avoid false-positive matching solely on a single generic word like "ENTERPRISES" or "INDIA"
  if (matchedCount === 1 && !strongDistinctiveMatch) {
    return { score: 0, reason: '' };
  }

  // Require either >=2 overlapping tokens OR a single distinctive >=5-char entity token when source has 1-2 tokens
  const ratioSource = matchedCount / sourceTokens.length;
  const ratioTarget = matchedCount / Math.max(1, Math.min(targetTokens.length, 4));
  const combinedScore = Math.max(ratioSource, (ratioSource + ratioTarget) / 2);

  if (matchedCount >= 2 && combinedScore >= 0.5) {
    return {
      score: Math.min(1, round2(combinedScore)),
      reason: `Matched ${matchedCount} entity tokens`,
    };
  }

  if (
    matchedCount === 1 &&
    strongDistinctiveMatch &&
    sourceTokens.length <= 2 &&
    sourceTokens.some((t) => t.length >= 5 && !GENERIC_BUSINESS_SUFFIXES.has(t))
  ) {
    return {
      score: 0.72,
      reason: 'Primary counterparty name match',
    };
  }

  return { score: 0, reason: '' };
}

function isEligibleLargeCreditEntity(tx: NormalizedTransaction): boolean {
  const tokens = normalizeEntityTokens(`${tx.counterparty} ${tx.narration}`);
  if (tokens.length === 0) return false;
  const upper = `${tx.counterparty} ${tx.narration}`.toUpperCase();
  if (/^\s*(CASH\s*DEPOSIT|BY\s*CASH|CDM\s*DEPOSIT|SELF\s*DEPOSIT)\s*$/i.test(upper)) {
    return false;
  }
  return true;
}

function classifyPrivateChainRisk(
  lenderName: string,
  credits: NormalizedTransaction[],
  debits: TracedDueDebit[],
): LoanRiskClassification {
  const combined = [
    lenderName,
    ...credits.map((c) => c.narration),
    ...debits.map((d) => d.transaction.narration),
  ]
    .join(' ')
    .toUpperCase();

  if (
    /\b(BANK|NBFC|FINSERV|BAJAJ|TATA\s*CAP|CHOLA|SHRIRAM|HDB|MUTHOOT|MANAPPURAM|LENDINGKART|UGRO|IIFL|PIRAMAL|ADITYA\s*BIRLA|HERO\s*FIN|MAHINDRA\s*FIN|SUNDARAM\s*FIN|CLIX|PROTIUM|POONAWALLA)\b/.test(
      combined,
    )
  ) {
    return 'Confirmed Bank/NBFC Loan';
  }

  if (
    debits.length >= 2 ||
    /\b(LOAN|INTEREST|INT\s*PMT|EMI|DUE|FINANCE|FINANCIER|FINVEST|CREDIT|CAPITAL|HAND\s*LOAN)\b/.test(
      combined,
    )
  ) {
    return 'Suspected Private Loan (Recurring Dues)';
  }

  return 'Associate / Enterprise Fund Rotation';
}

export function analyzeLoansAndBorrowings(
  transactions: NormalizedTransaction[],
  thresholdAmount: number,
): LoanAnalysisSummary {
  // Step A: Institutional Loan & EMI Detection
  const institutionalMap = new Map<
    string,
    {
      lenderName: string;
      normalizedKey: string;
      keywords: Set<string>;
      transactions: NormalizedTransaction[];
    }
  >();
  for (const tx of transactions) {
    if (tx.debit <= 0) continue;
    const text = `${tx.counterparty} ${tx.narration}`;

    const matchedKeywords = INSTITUTIONAL_KEYWORD_PATTERNS.filter((p) => p.rx.test(text)).map(
      (p) => p.label,
    );

    if (matchedKeywords.length === 0) continue;

    // Exclude statutory tax/utility payments unless explicit loan/NBFC keyword matched
    const hasHardLoanOrNbfc = matchedKeywords.some(
      (k) => !['ACH', 'NACH', 'ECS'].includes(k),
    );
    if (!hasHardLoanOrNbfc && STATUTORY_OR_UTILITY_EXCLUSION_RX.test(text)) {
      continue;
    }

    const { lenderName, normalizedKey } = extractInstitutionalLenderName(tx);

    const existing = institutionalMap.get(normalizedKey);
    if (existing) {
      existing.transactions.push(tx);
      matchedKeywords.forEach((k) => existing.keywords.add(k));
    } else {
      institutionalMap.set(normalizedKey, {
        lenderName,
        normalizedKey,
        keywords: new Set(matchedKeywords),
        transactions: [tx],
      });
    }
  }

  const institutionalLoans: InstitutionalLoanGroup[] = Array.from(institutionalMap.values())
    .map((group, idx) => {
      const totalOutflow = round2(group.transactions.reduce((s, t) => s + t.debit, 0));
      const emiFrequency = group.transactions.length;
      return {
        id: `inst-loan-${idx + 1}`,
        lenderName: group.lenderName,
        normalizedKey: group.normalizedKey,
        emiFrequency,
        averageDueAmount: round2(totalOutflow / Math.max(1, emiFrequency)),
        totalOutflow,
        firstDebitDate: group.transactions[0]?.date || '—',
        lastDebitDate: group.transactions[group.transactions.length - 1]?.date || '—',
        riskTag: 'Confirmed Bank/NBFC Loan' as const,
        matchedKeywords: Array.from(group.keywords),
        transactions: group.transactions,
      };
    })
    .sort((a, b) => b.totalOutflow - a.totalOutflow);

  // Step B: Large Credit + Counterparty Follow-Up (Private Loan / Enterprise / Associate Tracing)
  const effectiveThreshold = Math.max(10_000, thresholdAmount);
  const largeCreditGroups = new Map<
    string,
    {
      lenderPartyName: string;
      normalizedEntityKey: string;
      tokens: string[];
      firstIdx: number;
      firstIsoDate: string;
      creditTransactions: NormalizedTransaction[];
    }
  >();

  transactions.forEach((tx, idx) => {
    if (tx.credit < effectiveThreshold) return;
    if (!isEligibleLargeCreditEntity(tx)) return;

    const cpTokens = normalizeEntityTokens(tx.counterparty || '');
    const rawName = cpTokens.length > 0 ? tx.counterparty : tx.narration;
    const tokens = normalizeEntityTokens(rawName).slice(0, 4);
    if (tokens.length === 0) return;

    // Try merging with an already seen large-credit entity via fuzzy match
    let matchedGroupKey: string | null = null;
    for (const [key, grp] of largeCreditGroups.entries()) {
      const sim = computeCounterpartySimilarity(grp.tokens, tokens.join(' '));
      if (sim.score >= 0.65) {
        matchedGroupKey = key;
        break;
      }
    }

    if (matchedGroupKey) {
      largeCreditGroups.get(matchedGroupKey)!.creditTransactions.push(tx);
    } else {
      const entityKey = tokens.join(' ');
      largeCreditGroups.set(entityKey, {
        lenderPartyName: toTitleCase(entityKey).slice(0, 60),
        normalizedEntityKey: entityKey,
        tokens,
        firstIdx: idx,
        firstIsoDate: tx.isoDate,
        creditTransactions: [tx],
      });
    }
  });

  const tracedLoanChains: TracedLoanChain[] = [];

  for (const group of largeCreditGroups.values()) {
    const subsequentDebits: TracedDueDebit[] = [];

    for (let i = group.firstIdx + 1; i < transactions.length; i++) {
      const dTx = transactions[i];
      if (dTx.debit <= 0) continue;

      const candidateText = [dTx.counterparty, dTx.chequePayee || '', dTx.narration]
        .filter(Boolean)
        .join(' ');

      const sim = computeCounterpartySimilarity(group.tokens, candidateText);
      if (sim.score >= 0.65) {
        const modeLabel = dTx.isChequeCleared
          ? `Cleared Cheque #${dTx.chequeNumber || dTx.refNo}`
          : dTx.paymentMode;
        subsequentDebits.push({
          transaction: dTx,
          matchScore: sim.score,
          matchReason: `${sim.reason} (${modeLabel})`,
        });
      }
    }

    if (subsequentDebits.length === 0) continue;

    const principalReceived = round2(
      group.creditTransactions.reduce((sum, c) => sum + c.credit, 0),
    );
    const totalRepaid = round2(
      subsequentDebits.reduce((sum, d) => sum + d.transaction.debit, 0),
    );
    const netOutstandingBalance = round2(Math.max(0, principalReceived - totalRepaid));
    const riskClassification = classifyPrivateChainRisk(
      group.lenderPartyName,
      group.creditTransactions,
      subsequentDebits,
    );

    tracedLoanChains.push({
      id: `traced-chain-${tracedLoanChains.length + 1}`,
      lenderPartyName: group.lenderPartyName,
      normalizedEntityKey: group.normalizedEntityKey,
      initialCreditDate: group.creditTransactions[0].date,
      principalReceived,
      creditTransactions: group.creditTransactions,
      subsequentDebits,
      totalRepaid,
      netOutstandingBalance,
      riskClassification,
    });
  }

  tracedLoanChains.sort((a, b) => b.principalReceived - a.principalReceived);

  const tracedPrivateTxIds = new Set<string>(
    tracedLoanChains.flatMap((c) => c.subsequentDebits.map((d) => d.transaction.id)),
  );

  const STRONG_INSTITUTIONAL_TAGS = new Set([
    'EMI',
    'LOAN',
    'ACH',
    'NACH',
    'ECS',
    'INSTALLMENT',
    'OD INT',
    'FINSERV',
    'BAJAJ',
    'TATA CAP',
    'CHOLA',
    'SHRIRAM',
    'HDB',
    'MUTHOOT',
    'MANAPPURAM',
    'LENDINGKART',
    'UGRO',
    'NEOGROWTH',
    'L&T FIN',
    'SMFG / FULLERTON',
    'IIFL',
    'INDIABULLS',
    'PIRAMAL',
    'ADITYA BIRLA FIN',
    'HERO FINCORP',
    'MAHINDRA FIN',
    'SUNDARAM FIN',
    'CLIX / PROTIUM',
  ]);

  const filteredInstitutionalLoans = institutionalLoans.filter((grp) => {
    const hasStrongInstitutionalSignal = grp.matchedKeywords.some((k) =>
      STRONG_INSTITUTIONAL_TAGS.has(k),
    );
    if (hasStrongInstitutionalSignal) return true;
    // Generic FINANCE / CAPITAL group: keep in Institutional only if not already traced in Private Loan Chains
    const allTracedInPrivate = grp.transactions.every((t) => tracedPrivateTxIds.has(t.id));
    return !allTracedInPrivate;
  });

  const filteredInstitutionalTxIds = new Set<string>(
    filteredInstitutionalLoans.flatMap((g) => g.transactions.map((t) => t.id)),
  );

  const institutionalEmiOutflow = round2(
    filteredInstitutionalLoans.reduce((sum, g) => sum + g.totalOutflow, 0),
  );
  const tracedPrivatePrincipal = round2(
    tracedLoanChains.reduce((sum, c) => sum + c.principalReceived, 0),
  );
  const tracedPrivateRepaid = round2(
    tracedLoanChains.reduce((sum, c) => sum + c.totalRepaid, 0),
  );
  const tracedPrivateNetOutstanding = round2(
    tracedLoanChains.reduce((sum, c) => sum + c.netOutstandingBalance, 0),
  );

  // Avoid double-counting outflow if a traced private chain happens to be a confirmed NBFC already counted in institutionalLoans
  const nonOverlappingTracedRepaid = round2(
    tracedLoanChains.reduce((sum, chain) => {
      const uncountedDebits = chain.subsequentDebits
        .filter((d) => !filteredInstitutionalTxIds.has(d.transaction.id))
        .reduce((s, d) => s + d.transaction.debit, 0);
      return sum + uncountedDebits;
    }, 0),
  );

  return {
    institutionalLoans: filteredInstitutionalLoans,
    tracedLoanChains,
    institutionalLoanCount: filteredInstitutionalLoans.length,
    institutionalEmiOutflow,
    tracedPrivateCount: tracedLoanChains.length,
    tracedPrivatePrincipal,
    tracedPrivateRepaid,
    tracedPrivateNetOutstanding,
    totalDetectedLoansCount: filteredInstitutionalLoans.length + tracedLoanChains.length,
    totalDetectedDebtExposure: round2(institutionalEmiOutflow + tracedPrivatePrincipal),
    totalRecurringAndRepaidOutflow: round2(institutionalEmiOutflow + nonOverlappingTracedRepaid),
  };
}

export interface ManualPartyTraceResult {
  query: string;
  matchingCredits: NormalizedTransaction[];
  matchingDebits: NormalizedTransaction[];
  totalCreditsIn: number;
  totalDebitsOut: number;
  netBalance: number;
}

export function traceCounterpartyActivity(
  transactions: NormalizedTransaction[],
  query: string,
): ManualPartyTraceResult {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return {
      query: '',
      matchingCredits: [],
      matchingDebits: [],
      totalCreditsIn: 0,
      totalDebitsOut: 0,
      netBalance: 0,
    };
  }

  const queryLower = cleanQuery.toLowerCase();
  const queryTokens = normalizeEntityTokens(cleanQuery);

  const matchesTx = (tx: NormalizedTransaction): boolean => {
    const haystack = [tx.counterparty, tx.chequePayee || '', tx.narration, tx.refNo]
      .filter(Boolean)
      .join(' ');
    if (haystack.toLowerCase().includes(queryLower)) return true;
    if (queryTokens.length > 0) {
      const sim = computeCounterpartySimilarity(queryTokens, haystack);
      return sim.score >= 0.65;
    }
    return false;
  };

  const matchingCredits = transactions.filter((t) => t.credit > 0 && matchesTx(t));
  const matchingDebits = transactions.filter((t) => t.debit > 0 && matchesTx(t));
  const totalCreditsIn = round2(matchingCredits.reduce((s, t) => s + t.credit, 0));
  const totalDebitsOut = round2(matchingDebits.reduce((s, t) => s + t.debit, 0));

  return {
    query: cleanQuery,
    matchingCredits,
    matchingDebits,
    totalCreditsIn,
    totalDebitsOut,
    netBalance: round2(totalCreditsIn - totalDebitsOut),
  };
}
