import type {
  AnalyzedStatement,
  ChequeCategory,
  ColumnMapping,
  IntegrityReport,
  NormalizedTransaction,
  ParsedWorkbookRaw,
  PaymentMode,
  PdfRowMoneyHint,
} from '../types/statement';
import {
  extractDatesFromText,
  isLikelyCurrencyToken,
  parseIndianAmount,
  parseIndianCurrency,
  parseIndianDate,
} from '../utils/indianFormat';
import {
  detectIndianBank,
  extractAccountHolderName,
  extractAccountNumber,
  extractExplicitOpeningBalance,
} from './bankIntelligence';

const PAGE_NOISE_PATTERNS = [
  /^page\s+\d+\s*(of|\/)\s*\d+/i,
  /^statement\s+of\s+account/i,
  /^generated\s+on\b/i,
  /^end\s+of\s+statement/i,
  /^this\s+is\s+a\s+computer\s+generated/i,
  /^registered\s+office/i,
  /^corporate\s+office/i,
  /^branch\s+address/i,
  /^account\s+summary/i,
  /^closing\s+balance\s*[:\-]/i,
  /^total\s+(debit|credit|withdrawal|deposit)/i,
  /^\*{3,}\s*end/i,
  /^note\s*:/i,
  /^disclaimer\s*:/i,
];

const CREDIT_KEYWORD_RX =
  /\b(BY\s+CLG|BY\s+CLEARING|BY\s+TRANSFER|BY\s+TRF|BY\s+CASH|BY\s+INST|NEFT[\s\/\-]*CR|RTGS[\s\/\-]*CR|IMPS[\s\/\-]*(IN|CR)|UPI[\s\/\-]*CR|CR[\s\/\-]*NEFT|CR[\s\/\-]*RTGS|DEPOSIT|CREDIT|INT\.?\s*PAID|REFUND|REVERSAL|CASHBACK)\b/i;

const DEBIT_KEYWORD_RX =
  /\b(TO\s+CLG|TO\s+CLEARING|TO\s+TRANSFER|TO\s+TRF|TO\s+CASH|TO\s+SELF|CHQ\s*PAID|CHEQUE\s*PAID|NEFT[\s\/\-]*DR|RTGS[\s\/\-]*DR|IMPS[\s\/\-]*(OUT|DR)|UPI[\s\/\-]*DR|DR[\s\/\-]*NEFT|DR[\s\/\-]*RTGS|ACH[\s\/\-]*DR|NACH[\s\/\-]*DR|ECS[\s\/\-]*DR|WITHDRAWAL|WDL|DEBIT|CHARGES|ATM\s*WDL|POS\s*PURCHASE|TAX\s*DEDUCTED)\b/i;

function isRepeatedHeaderRow(row: string[], headers: string[]): boolean {
  const rowText = row.map((c) => c.toLowerCase().trim()).filter(Boolean).join('|');
  const hdrText = headers.map((c) => c.toLowerCase().trim()).filter(Boolean).join('|');
  if (rowText && hdrText && rowText === hdrText) return true;

  const joined = row.join(' ').toLowerCase();
  const hasDateHdr = /\b(txn\s*date|transaction\s*date|tran\s*date|value\s*date|date)\b/.test(joined);
  const hasAmtHdr = /\b(debit|withdrawal|credit|deposit|balance|particulars|narration|description)\b/.test(
    joined,
  );
  const hasActualDate = row.some((c) => parseIndianDate(c) !== null || extractDatesFromText(c).dates.length > 0);
  return hasDateHdr && hasAmtHdr && !hasActualDate;
}

function isNoiseOrSummaryRow(row: string[]): boolean {
  const joined = row.join(' ').trim();
  if (!joined) return true;
  if (PAGE_NOISE_PATTERNS.some((rx) => rx.test(joined))) return true;
  if (/^[\-=_*.\s]+$/.test(joined)) return true;
  return false;
}

function isOpeningOrClosingSummaryRow(narration: string): 'opening' | 'closing' | null {
  const lower = narration.toLowerCase().trim();
  if (/^(opening\s*balance|open\s*bal|b\/f\b|brought\s*forward|balance\s*b\/f)\b/.test(lower)) {
    return 'opening';
  }
  if (/^(closing\s*balance|close\s*bal|c\/f\b|carried\s*forward|balance\s*c\/f|grand\s*total)\b/.test(lower)) {
    return 'closing';
  }
  return null;
}

function detectPaymentMode(narration: string, refNo: string, debit: number): PaymentMode {
  const text = `${narration} ${refNo}`.toUpperCase();
  if (/\bRTGS\b|RTGS[\/\-:]/.test(text)) return 'RTGS';
  if (/\bNEFT\b|NEFT[\/\-:]/.test(text)) return 'NEFT';
  if (/\bIMPS\b|IMPS[\/\-:]/.test(text)) return 'IMPS';
  if (/\bUPI\b|UPI[\/\-:]/.test(text)) return 'UPI';
  if (
    /\b(CHQ|CHEQUE|CLG|CTS|INW\s*CLG|MICR)\b/.test(text) ||
    (debit > 0 && /^\d{5,7}$/.test(refNo.trim()))
  ) {
    return 'CHEQUE';
  }
  if (/\b(CASH|ATM|CDM)\b/.test(text)) return 'CASH';
  if (/\b(CHARGES|CHG|SMS\s*CHG|GST|PENALTY|FEE|FOLIO|AMC)\b/.test(text)) return 'CHARGES';
  if (/\b(FT|FUND\s*TRANSFER|TRF|TRANSFER|INB|INTERNAL)\b/.test(text)) return 'FT';
  return 'OTHER';
}

function cleanEntityToken(raw: string): string {
  return raw
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, ' ')
    .replace(/\b(UTR|REF|TXN|IMPS|NEFT|RTGS|UPI|CHQ|CTS|CLG|INW|CR|DR|P2A|P2M|INB)\b/gi, ' ')
    .replace(/\b\d{10,22}\b/g, ' ')
    .replace(/[\/|_\-*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCounterparty(narration: string, mode: PaymentMode): string {
  const clean = narration.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Unspecified';

  if (clean.includes('/')) {
    const parts = clean
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean);

    const candidates = parts.filter((part) => {
      const u = part.toUpperCase();
      if (/^(NEFT|RTGS|IMPS|UPI|CR|DR|INB|TRF|FT|P2A|P2M|CLG|CTS|BY|TO|MB|IB)$/i.test(u)) return false;
      if (/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(u)) return false;
      if (/^\d{5,}$/.test(part)) return false;
      if (/^[A-Z]{4,6}[RN]?\d{8,}$/i.test(u)) return false;
      if (/^@[a-z0-9]+$/i.test(part) || /^[a-z0-9._-]+@[a-z]+$/i.test(part)) return false;
      if (/^(PAYMENT|TRANSFER|NA|OK|BILL|INVOICE)$/i.test(u)) return false;
      return part.length >= 3;
    });

    if (candidates.length > 0) {
      const alphaCandidate = candidates.find((c) => /[A-Za-z]{3,}/.test(c));
      if (alphaCandidate) return alphaCandidate.slice(0, 64);
    }
  }

  if (clean.includes('-')) {
    const parts = clean
      .split('-')
      .map((p) => p.trim())
      .filter(Boolean);
    const candidates = parts.filter((part) => {
      const u = part.toUpperCase();
      if (/^(NEFT|RTGS|IMPS|UPI|CR|DR|INB|BY TRANSFER|TO TRANSFER|TO CLG|CHQ PAID)$/i.test(u)) return false;
      if (/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(u)) return false;
      if (/^\d{5,}$/.test(part)) return false;
      if (/^[A-Z]{4,6}[RN]?\d{8,}$/i.test(u)) return false;
      return /[A-Za-z]{3,}/.test(part);
    });
    if (candidates.length > 0) {
      return candidates[0].slice(0, 64);
    }
  }

  if (mode === 'CHEQUE') {
    return extractChequePayee(clean);
  }

  const cleaned = cleanEntityToken(clean);
  return cleaned ? cleaned.slice(0, 64) : clean.slice(0, 64);
}

const ELECTRONIC_EXCLUSION_RX =
  /\b(NEFT|RTGS|IMPS|UPI|ATM|POS|NACH|ECS|ACH|SMS\s*CHG|BANK\s*CHG|DEBIT\s*CARD|CARD\s*TXN|INTERCHANGE)\b/i;
const CHEQUE_KEYWORD_RX =
  /\b(CLG|CLEARING|CHQ\s*PAID|CHQ\s*NO|CHQ\.?|CHEQUE|TO\s*CLG|INW\s*CLG|INWARD\s*CLG|CTS|BY\s*CLG|ISSUED\s*CHQ|MICR|TO\s*SELF)\b/i;

function extractChequeNumber(narration: string, refNo: string): string | null {
  const cleanRef = refNo.trim();
  if (/^0*\d{5,8}$/.test(cleanRef)) {
    return cleanRef;
  }

  const refMatch = cleanRef.match(/\b(\d{6})\b/);
  if (refMatch) return refMatch[1];

  const patterns = [
    /(?:CHQ|CHEQUE)\s*(?:NO\.?|NUM|NUMBER|#|:|-)?\s*[:\-#]?\s*(\d{5,8})/i,
    /(?:CTS|CLG|INW)\s*[:\-\s#]*(\d{5,8})/i,
    /\bNO\.?\s*[:\-]?\s*(\d{6})\b/i,
    /\b(\d{6})\b/,
  ];

  for (const rx of patterns) {
    const m = narration.match(rx);
    if (m && m[1]) {
      return m[1];
    }
  }

  return null;
}

function extractChequePayee(narration: string): string {
  let s = ` ${narration} `;

  if (/\b(TO\s+SELF|BY\s+SELF|\bSELF\b|SELF\s+CHQ)\b/i.test(s)) {
    return 'Self / Cash Withdrawal';
  }

  s = s
    .replace(
      /\b(CHQ\s*PAID\s*TO|PAID\s*TO|TO\s*CLG\s*[-:/]?|INW\s*CLG\s*[-:/]?|INWARD\s*CLEARING|BY\s*CLG\s*[-:/]?|CTS\s*CLG\s*[-:/]?|CTS\s*[-:/]?|CLEARING\s*[-:/]?|CLG\s*[-:/]?|CHEQUE\s*PAID|CHQ\s*PAID|CHQ\s*NO\.?|CHEQUE\s*NO\.?|CHQ|CHEQUE|MICR)\b/gi,
      ' ',
    )
    .replace(/\b(TO\s+TRANSFER|BY\s+TRANSFER|INTRA\s*BANK|OWN\s*BANK)\b/gi, ' ')
    .replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g, ' ')
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/gi, ' ')
    .replace(/\bBR(?:ANCH)?\s*[:\-]?\s*\d{3,6}\b/gi, ' ')
    .replace(/\b\d{5,18}\b/g, ' ')
    .replace(/[\/|_\-*#:,;()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  s = s.replace(/^(TO|BY|FOR|IN\s+FAVOUR\s+OF|FAVOUR\s+OF|FAV)\s+/i, '').trim();

  return s.length >= 2 ? s.slice(0, 64) : 'Clearing Beneficiary (See Narration)';
}

function classifyChequeCategory(narration: string): ChequeCategory {
  const u = narration.toUpperCase();
  if (/\b(SELF|CASH|WITHDRAWAL)\b/.test(u)) {
    return 'Self / Cash Withdrawal';
  }
  if (/\b(TRF|TRANSFER|INTRA|OWN\s*BANK|INTERNAL)\b/.test(u) && !/\b(CLG|CTS|INW|CLEARING)\b/.test(u)) {
    return 'Intra-Bank Transfer';
  }
  return 'Outstation / Local Clearing';
}

function detectClearedCheque(
  narration: string,
  refNo: string,
  debit: number,
  credit: number,
): {
  isChequeCleared: boolean;
  chequeNumber: string | null;
  chequePayee: string | null;
  chequeCategory: ChequeCategory | null;
} {
  if (debit <= 0 || credit > 0) {
    return { isChequeCleared: false, chequeNumber: null, chequePayee: null, chequeCategory: null };
  }

  const combined = `${narration} ${refNo}`;
  if (ELECTRONIC_EXCLUSION_RX.test(combined)) {
    return { isChequeCleared: false, chequeNumber: null, chequePayee: null, chequeCategory: null };
  }

  const refIsChequeNumber = /^0*\d{5,8}$/.test(refNo.trim());
  const hasChequeKeyword = CHEQUE_KEYWORD_RX.test(narration);

  if (!refIsChequeNumber && !hasChequeKeyword) {
    return { isChequeCleared: false, chequeNumber: null, chequePayee: null, chequeCategory: null };
  }

  const chequeNumber = extractChequeNumber(narration, refNo);
  const chequePayee = extractChequePayee(narration);
  const chequeCategory = classifyChequeCategory(narration);

  return {
    isChequeCleared: true,
    chequeNumber: chequeNumber || refNo.trim() || 'Not Printed',
    chequePayee,
    chequeCategory,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

interface DraftTx {
  rowIndex: number;
  date: string;
  isoDate: string;
  valueDate: string;
  narrationParts: string[];
  refNo: string;
  debit: number;
  credit: number;
  pendingAmount: number;
  explicitDrCr: 'DR' | 'CR' | null;
  xMatchedPolarity: 'DR' | 'CR' | null;
  balance: number | null;
  rawMergedRows: number;
  rawRowText: string;
  rawDebitStr: string;
  rawCreditStr: string;
  rawBalanceStr: string;
  classificationMethod: string;
}

interface DraftExtractionResult {
  drafts: DraftTx[];
  explicitOpeningBalance: number | null;
  explicitClosingBalance: number | null;
  mergedContinuationRows: number;
}

function extractDraftsByMappedColumns(
  rows: string[][],
  mapping: ColumnMapping,
  initialOpeningBalance: number | null,
  pdfMoneyHints?: Record<number, PdfRowMoneyHint>,
): DraftExtractionResult {
  const { headerRowIndex, headers, roles } = mapping;
  const idxOf = (role: ColumnMapping['roles'][number]) => roles.indexOf(role);
  const dateIdx = idxOf('date');
  const valueDateIdx = idxOf('valueDate');
  const narrationIdx = idxOf('narration');
  const refNoIdx = idxOf('refNo');
  const debitIdx = idxOf('debit');
  const creditIdx = idxOf('credit');
  const amountIdx = idxOf('amount');
  const drcrIdx = idxOf('drcr');
  const balanceIdx = idxOf('balance');

  const getCell = (row: string[], colIdx: number): string => {
    if (colIdx < 0 || colIdx >= row.length) return '';
    return (row[colIdx] || '').trim();
  };

  let explicitOpeningBalance = initialOpeningBalance;
  let explicitClosingBalance: number | null = null;
  let mergedContinuationRows = 0;
  const drafts: DraftTx[] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    if (isNoiseOrSummaryRow(row)) continue;
    if (isRepeatedHeaderRow(row, headers)) continue;

    const rawRowText = row.filter(Boolean).join(' | ');
    const rawDateStr = getCell(row, dateIdx);
    let parsedDate = parseIndianDate(rawDateStr);
    let parsedValueDate = parseIndianDate(getCell(row, valueDateIdx));
    let extraDateRemainder = '';

    // Handle merged "TranDate ValueDate" inside a single PDF cell
    if (!parsedDate && rawDateStr) {
      const inline = extractDatesFromText(rawDateStr);
      if (inline.dates.length > 0) {
        parsedDate = inline.dates[0];
        if (!parsedValueDate && inline.dates.length > 1) {
          parsedValueDate = inline.dates[1];
        }
        extraDateRemainder = inline.remainder;
      }
    }

    const narrationCell = [extraDateRemainder, getCell(row, narrationIdx)].filter(Boolean).join(' ').trim();
    const refCell = getCell(row, refNoIdx);

    const summaryKind = isOpeningOrClosingSummaryRow(narrationCell || row.join(' '));
    const balCellStr = getCell(row, balanceIdx);
    const balParsed = parseIndianAmount(balCellStr);
    if (summaryKind === 'opening') {
      if (balParsed) {
        explicitOpeningBalance = balParsed.indicator === 'DR' && balParsed.value > 0 ? -balParsed.value : balParsed.value;
      } else {
        for (let c = row.length - 1; c >= 0; c--) {
          const p = parseIndianAmount(row[c]);
          if (p) {
            explicitOpeningBalance = p.indicator === 'DR' && p.value > 0 ? -p.value : p.value;
            break;
          }
        }
      }
      continue;
    }
    if (summaryKind === 'closing') {
      if (balParsed) {
        explicitClosingBalance = balParsed.indicator === 'DR' && balParsed.value > 0 ? -balParsed.value : balParsed.value;
      }
      continue;
    }

    let debit = 0;
    let credit = 0;
    let pendingAmount = 0;
    let explicitDrCr: 'DR' | 'CR' | null = null;
    let xMatchedPolarity: 'DR' | 'CR' | null = null;
    let rawDebitStr = debitIdx >= 0 ? getCell(row, debitIdx) : '';
    let rawCreditStr = creditIdx >= 0 ? getCell(row, creditIdx) : '';
    let rawBalanceStr = balCellStr;
    let balanceVal: number | null = balParsed
      ? balParsed.indicator === 'DR' && balParsed.value > 0
        ? -balParsed.value
        : balParsed.value
      : null;
    let classificationMethod = 'Mapped Columns';

    if (debitIdx >= 0 || creditIdx >= 0) {
      const dVal = debitIdx >= 0 ? Math.abs(parseIndianCurrency(rawDebitStr)) : 0;
      const cVal = creditIdx >= 0 ? Math.abs(parseIndianCurrency(rawCreditStr)) : 0;
      if (dVal > 0) debit = dVal;
      if (cVal > 0) credit = cVal;
    }

    if (debit === 0 && credit === 0 && amountIdx >= 0) {
      const amtStr = getCell(row, amountIdx);
      const aParsed = parseIndianAmount(amtStr);
      if (aParsed && aParsed.value !== 0) {
        const flagRaw = getCell(row, drcrIdx).toUpperCase();
        if (flagRaw.includes('CR') || flagRaw === 'C' || aParsed.indicator === 'CR') {
          explicitDrCr = 'CR';
          credit = Math.abs(aParsed.value);
          rawCreditStr = amtStr;
          classificationMethod = 'Explicit Cr Flag';
        } else if (
          flagRaw.includes('DR') ||
          flagRaw === 'D' ||
          aParsed.indicator === 'DR' ||
          aParsed.value < 0
        ) {
          explicitDrCr = 'DR';
          debit = Math.abs(aParsed.value);
          rawDebitStr = amtStr;
          classificationMethod = 'Explicit Dr Flag';
        } else {
          pendingAmount = Math.abs(aParsed.value);
          rawDebitStr = amtStr;
          rawCreditStr = amtStr;
        }
      }
    }

    // PDF Right-to-Left Spatial Reconciliation Supplement:
    // If mapped PDF cells missed an amount or balance due to tight X-spacing, apply strict 2-decimal PDF money hints
    const pdfHint = pdfMoneyHints?.[r];
    if (pdfHint) {
      if (xMatchedPolarity === null) xMatchedPolarity = pdfHint.xMatchedPolarity;
      if (debit === 0 && credit === 0 && pendingAmount === 0) {
        debit = pdfHint.debitVal;
        credit = pdfHint.creditVal;
        pendingAmount = pdfHint.pendingVal;
        explicitDrCr = pdfHint.pendingIndicator;
        rawDebitStr = pdfHint.debitStr || rawDebitStr;
        rawCreditStr = pdfHint.creditStr || rawCreditStr;
        classificationMethod =
          pdfHint.debitVal > 0 || pdfHint.creditVal > 0
            ? 'PDF Right-to-Left Positional'
            : pdfHint.xMatchedPolarity
              ? 'PDF X-Coordinate Column Match'
              : 'PDF Positional Amount';
      }
      if (balanceVal === null && pdfHint.balanceVal !== null) {
        balanceVal = pdfHint.balanceVal;
        rawBalanceStr = pdfHint.balanceStr || rawBalanceStr;
      }
    }

    const hasFinancialAmounts = debit > 0 || credit > 0 || pendingAmount > 0 || balanceVal !== null;

    // Multi-line Narration Merging (Style A: continuation row below transaction)
    if (!parsedDate && !hasFinancialAmounts && drafts.length > 0) {
      const extraText =
        narrationCell ||
        row
          .filter((_, ci) => ci !== refNoIdx)
          .filter(Boolean)
          .join(' ')
          .trim();

      if (extraText) {
        const parent = drafts[drafts.length - 1];
        parent.narrationParts.push(extraText);
        if (refCell && !parent.refNo.includes(refCell)) {
          parent.refNo = parent.refNo ? `${parent.refNo} ${refCell}` : refCell;
        }
        parent.rawMergedRows += 1;
        parent.rawRowText += ` // ${rawRowText}`;
        mergedContinuationRows += 1;
      }
      continue;
    }

    // Style B: previous line had Date + NarrationPart1 (no amounts), current line has NarrationPart2 + Amounts
    if (!parsedDate && hasFinancialAmounts && drafts.length > 0) {
      const prev = drafts[drafts.length - 1];
      if (prev.debit === 0 && prev.credit === 0 && prev.pendingAmount === 0 && prev.balance === null) {
        if (narrationCell) prev.narrationParts.push(narrationCell);
        if (refCell && !prev.refNo.includes(refCell)) {
          prev.refNo = prev.refNo ? `${prev.refNo} ${refCell}` : refCell;
        }
        prev.debit = round2(debit);
        prev.credit = round2(credit);
        prev.pendingAmount = round2(pendingAmount);
        prev.explicitDrCr = explicitDrCr;
        prev.xMatchedPolarity = xMatchedPolarity;
        prev.balance = balanceVal !== null ? round2(balanceVal) : null;
        prev.rawMergedRows += 1;
        prev.rawRowText += ` // ${rawRowText}`;
        prev.rawDebitStr = rawDebitStr;
        prev.rawCreditStr = rawCreditStr;
        prev.rawBalanceStr = rawBalanceStr;
        prev.classificationMethod = classificationMethod;
        mergedContinuationRows += 1;
        continue;
      }
    }

    if (!parsedDate && !hasFinancialAmounts) {
      continue;
    }

    const effectiveDate =
      parsedDate ||
      (drafts.length > 0
        ? { display: drafts[drafts.length - 1].date, iso: drafts[drafts.length - 1].isoDate }
        : null);
    if (!effectiveDate) continue;

    drafts.push({
      rowIndex: r + 1,
      date: effectiveDate.display,
      isoDate: effectiveDate.iso,
      valueDate: parsedValueDate ? parsedValueDate.display : effectiveDate.display,
      narrationParts: narrationCell ? [narrationCell] : [],
      refNo: refCell,
      debit: round2(debit),
      credit: round2(credit),
      pendingAmount: round2(pendingAmount),
      explicitDrCr,
      xMatchedPolarity,
      balance: balanceVal !== null ? round2(balanceVal) : null,
      rawMergedRows: 1,
      rawRowText,
      rawDebitStr,
      rawCreditStr,
      rawBalanceStr,
      classificationMethod,
    });
  }

  return {
    drafts,
    explicitOpeningBalance,
    explicitClosingBalance,
    mergedContinuationRows,
  };
}

/**
 * Layer 2: Headerless & Pattern-First Row Detection
 * Parses ANY bank statement row by date/amount structure even when headers are absent,
 * split across multiple lines, or use non-standard terminology.
 */
function extractDraftsPatternFirst(
  rows: string[][],
  headers: string[],
  initialOpeningBalance: number | null,
  pdfMoneyHints?: Record<number, PdfRowMoneyHint>,
): DraftExtractionResult {
  let explicitOpeningBalance = initialOpeningBalance;
  let explicitClosingBalance: number | null = null;
  let mergedContinuationRows = 0;
  const drafts: DraftTx[] = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    if (isNoiseOrSummaryRow(row)) continue;
    if (headers.length > 0 && isRepeatedHeaderRow(row, headers)) continue;

    const rawRowText = row.filter(Boolean).join(' | ');
    const joinedRow = row.filter(Boolean).join(' ').trim();
    const summaryKind = isOpeningOrClosingSummaryRow(joinedRow);
    if (summaryKind) {
      const tokens = row.flatMap((c) => c.split(/\s+/)).filter(Boolean);
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (isLikelyCurrencyToken(tokens[i])) {
          const p = parseIndianAmount(tokens[i]);
          if (p) {
            const val = p.indicator === 'DR' && p.value > 0 ? -p.value : p.value;
            if (summaryKind === 'opening') explicitOpeningBalance = val;
            else explicitClosingBalance = val;
            break;
          }
        }
      }
      continue;
    }

    const nonEmptyCells = row.map((c) => c.trim()).filter(Boolean);
    if (nonEmptyCells.length === 0) continue;

    // 1. Detect dates near the left side of the row (first 3 cells)
    const foundDates: Array<{ display: string; iso: string }> = [];
    const consumedCellIndices = new Set<number>();
    const leftoverFromDateCells: string[] = [];

    for (let c = 0; c < Math.min(nonEmptyCells.length, 3); c++) {
      const cell = nonEmptyCells[c];
      const exact = parseIndianDate(cell);
      if (exact) {
        foundDates.push(exact);
        consumedCellIndices.add(c);
      } else if (c <= 1) {
        const inline = extractDatesFromText(cell);
        if (inline.dates.length > 0) {
          foundDates.push(...inline.dates);
          consumedCellIndices.add(c);
          if (inline.remainder) leftoverFromDateCells.push(inline.remainder);
        }
      }
    }

    // 2. Scan right-hand cells strictly for 2-decimal currency amounts (never integers/cheque nos)
    interface ExtractedMoney {
      cellIdx: number;
      raw: string;
      value: number;
      indicator: 'DR' | 'CR' | null;
    }
    const monies: ExtractedMoney[] = [];
    let standaloneDrCr: 'DR' | 'CR' | null = null;

    for (let c = 0; c < nonEmptyCells.length; c++) {
      if (consumedCellIndices.has(c)) continue;
      const cell = nonEmptyCells[c];
      const upper = cell.toUpperCase();

      if (/^(DR|CR|D|C)$/i.test(upper)) {
        standaloneDrCr = upper.startsWith('C') ? 'CR' : 'DR';
        consumedCellIndices.add(c);
        continue;
      }

      if (isLikelyCurrencyToken(cell)) {
        const parsed = parseIndianAmount(cell);
        if (parsed) {
          monies.push({ cellIdx: c, raw: cell, value: parsed.value, indicator: parsed.indicator });
          consumedCellIndices.add(c);
          continue;
        }
      }

      // Handle cell containing multiple space-separated decimal amounts
      if (c >= nonEmptyCells.length - 3) {
        const subTokens = cell.split(/\s+/);
        let allMonetary = subTokens.length > 1;
        const subMonies: Array<{ raw: string; value: number; indicator: 'DR' | 'CR' | null }> = [];
        for (let t = 0; t < subTokens.length; t++) {
          const tok = subTokens[t];
          if (/^(CR|DR)\.?$/i.test(tok) && subMonies.length > 0) {
            subMonies[subMonies.length - 1].indicator = tok.toUpperCase().startsWith('C') ? 'CR' : 'DR';
            subMonies[subMonies.length - 1].raw += ` ${tok}`;
          } else if (isLikelyCurrencyToken(tok)) {
            const p = parseIndianAmount(tok);
            if (p) subMonies.push({ raw: tok, value: p.value, indicator: p.indicator });
            else allMonetary = false;
          } else {
            allMonetary = false;
          }
        }
        if (allMonetary && subMonies.length > 0) {
          for (const sm of subMonies) {
            monies.push({ cellIdx: c, raw: sm.raw, value: sm.value, indicator: sm.indicator });
          }
          consumedCellIndices.add(c);
        }
      }
    }

    // 3. Collect narration & reference number from remaining cells
    const narrationChunks: string[] = [...leftoverFromDateCells];
    let detectedRef = '';

    for (let c = 0; c < nonEmptyCells.length; c++) {
      if (consumedCellIndices.has(c)) continue;
      const cell = nonEmptyCells[c];
      if (!detectedRef && (/^0*\d{5,8}$/.test(cell) || /^[A-Z0-9]{8,22}$/i.test(cell))) {
        detectedRef = cell;
      } else {
        narrationChunks.push(cell);
      }
    }

    const narrationText = narrationChunks.join(' ').replace(/\s+/g, ' ').trim();
    const pdfHint = pdfMoneyHints?.[r];

    // Multi-line Narration Merging: no date AND no monetary amounts -> continuation line
    if (foundDates.length === 0 && monies.length === 0 && !pdfHint) {
      if (drafts.length > 0 && narrationText) {
        const parent = drafts[drafts.length - 1];
        parent.narrationParts.push(narrationText);
        if (detectedRef && !parent.refNo.includes(detectedRef)) {
          parent.refNo = parent.refNo ? `${parent.refNo} ${detectedRef}` : detectedRef;
        }
        parent.rawMergedRows += 1;
        parent.rawRowText += ` // ${rawRowText}`;
        mergedContinuationRows += 1;
      }
      continue;
    }

    let debit = 0;
    let credit = 0;
    let pendingAmount = 0;
    let explicitDrCr: 'DR' | 'CR' | null = standaloneDrCr;
    let xMatchedPolarity: 'DR' | 'CR' | null = null;
    let balanceVal: number | null = null;
    let rawDebitStr = '';
    let rawCreditStr = '';
    let rawBalanceStr = '';
    let classificationMethod = 'Pattern-First Detection';

    if (pdfHint) {
      debit = pdfHint.debitVal;
      credit = pdfHint.creditVal;
      pendingAmount = pdfHint.pendingVal;
      explicitDrCr = pdfHint.pendingIndicator || standaloneDrCr;
      xMatchedPolarity = pdfHint.xMatchedPolarity;
      balanceVal = pdfHint.balanceVal;
      rawDebitStr = pdfHint.debitStr;
      rawCreditStr = pdfHint.creditStr;
      rawBalanceStr = pdfHint.balanceStr;
      classificationMethod =
        debit > 0 || credit > 0
          ? 'PDF Right-to-Left Positional'
          : xMatchedPolarity
            ? 'PDF X-Coordinate Column Match'
            : 'PDF Positional Amount';
    } else if (monies.length >= 3) {
      // Case A: [Debit, Credit, Balance]
      const bal = monies[monies.length - 1];
      const crTok = monies[monies.length - 2];
      const drTok = monies[monies.length - 3];
      balanceVal = bal.indicator === 'DR' && bal.value > 0 ? -bal.value : bal.value;
      rawBalanceStr = bal.raw;
      const m1 = Math.abs(drTok.value);
      const m2 = Math.abs(crTok.value);
      if (m1 > 0 && m2 === 0) {
        debit = m1;
        rawDebitStr = drTok.raw;
        classificationMethod = '3-Column Positional (Debit)';
      } else if (m2 > 0 && m1 === 0) {
        credit = m2;
        rawCreditStr = crTok.raw;
        classificationMethod = '3-Column Positional (Credit)';
      } else if (m1 > 0) {
        pendingAmount = m1;
        rawDebitStr = drTok.raw;
      } else if (m2 > 0) {
        pendingAmount = m2;
        rawCreditStr = crTok.raw;
      }
    } else if (monies.length === 2) {
      // Case B: [TransactionAmount, Balance] (rightmost = Balance)
      const txn = monies[0];
      const bal = monies[1];
      balanceVal = bal.indicator === 'DR' && bal.value > 0 ? -bal.value : bal.value;
      rawBalanceStr = bal.raw;
      const ind = txn.indicator || standaloneDrCr || (txn.value < 0 ? 'DR' : null);
      if (ind === 'CR') {
        explicitDrCr = 'CR';
        credit = Math.abs(txn.value);
        rawCreditStr = txn.raw;
        classificationMethod = 'Explicit Cr Tag';
      } else if (ind === 'DR') {
        explicitDrCr = 'DR';
        debit = Math.abs(txn.value);
        rawDebitStr = txn.raw;
        classificationMethod = 'Explicit Dr Tag';
      } else {
        pendingAmount = Math.abs(txn.value);
        rawDebitStr = txn.raw;
        rawCreditStr = txn.raw;
      }
    } else if (monies.length === 1) {
      const txn = monies[0];
      const ind = txn.indicator || standaloneDrCr || (txn.value < 0 ? 'DR' : null);
      if (ind === 'CR') {
        explicitDrCr = 'CR';
        credit = Math.abs(txn.value);
        rawCreditStr = txn.raw;
        classificationMethod = 'Explicit Cr Tag';
      } else if (ind === 'DR') {
        explicitDrCr = 'DR';
        debit = Math.abs(txn.value);
        rawDebitStr = txn.raw;
        classificationMethod = 'Explicit Dr Tag';
      } else {
        pendingAmount = Math.abs(txn.value);
        rawDebitStr = txn.raw;
        rawCreditStr = txn.raw;
      }
    }

    // Style B merge: previous line had Date + NarrationPart1 (no money), current line has Money (no Date)
    if (foundDates.length === 0 && (monies.length > 0 || pdfHint) && drafts.length > 0) {
      const prev = drafts[drafts.length - 1];
      if (prev.debit === 0 && prev.credit === 0 && prev.pendingAmount === 0 && prev.balance === null) {
        if (narrationText) prev.narrationParts.push(narrationText);
        if (detectedRef && !prev.refNo.includes(detectedRef)) {
          prev.refNo = prev.refNo ? `${prev.refNo} ${detectedRef}` : detectedRef;
        }
        prev.debit = round2(debit);
        prev.credit = round2(credit);
        prev.pendingAmount = round2(pendingAmount);
        prev.explicitDrCr = explicitDrCr;
        prev.xMatchedPolarity = xMatchedPolarity;
        prev.balance = balanceVal !== null ? round2(balanceVal) : null;
        prev.rawMergedRows += 1;
        prev.rawRowText += ` // ${rawRowText}`;
        prev.rawDebitStr = rawDebitStr;
        prev.rawCreditStr = rawCreditStr;
        prev.rawBalanceStr = rawBalanceStr;
        prev.classificationMethod = classificationMethod;
        mergedContinuationRows += 1;
        continue;
      }
    }

    if (foundDates.length === 0) continue;

    const txnDate = foundDates[0];
    const valDate = foundDates.length > 1 ? foundDates[1] : foundDates[0];

    drafts.push({
      rowIndex: r + 1,
      date: txnDate.display,
      isoDate: txnDate.iso,
      valueDate: valDate.display,
      narrationParts: narrationText ? [narrationText] : [],
      refNo: detectedRef,
      debit: round2(debit),
      credit: round2(credit),
      pendingAmount: round2(pendingAmount),
      explicitDrCr,
      xMatchedPolarity,
      balance: balanceVal !== null ? round2(balanceVal) : null,
      rawMergedRows: 1,
      rawRowText,
      rawDebitStr,
      rawCreditStr,
      rawBalanceStr,
      classificationMethod,
    });
  }

  const validDrafts = drafts.filter(
    (d) => d.debit > 0 || d.credit > 0 || d.pendingAmount > 0 || d.balance !== null,
  );

  return {
    drafts: validDrafts,
    explicitOpeningBalance,
    explicitClosingBalance,
    mergedContinuationRows,
  };
}

/**
 * Layer 3: 3-Way Automatic Debit vs. Credit Classifier
 * Resolves chronological sort order and classifies any ambiguous amount using:
 * 1) Explicit Dr/Cr indicator
 * 2) Running Balance Delta Math (CurrentBalance vs PreviousBalance)
 * 3) Indian Banking Narration Keyword Fallback
 */
function resolveChronologyAndClassify(
  drafts: DraftTx[],
  explicitOpeningBalance: number | null,
): { ordered: DraftTx[]; sortOrder: 'ascending' | 'descending' } {
  let sortOrder: 'ascending' | 'descending' = 'ascending';

  if (drafts.length >= 2) {
    let ascMatches = 0;
    let descMatches = 0;
    for (let i = 1; i < drafts.length; i++) {
      const prev = drafts[i - 1];
      const curr = drafts[i];
      if (prev.balance !== null && curr.balance !== null) {
        const currAmt = curr.pendingAmount || curr.credit || curr.debit;
        const prevAmt = prev.pendingAmount || prev.credit || prev.debit;

        if (curr.pendingAmount > 0) {
          if (Math.abs(Math.abs(curr.balance - prev.balance) - currAmt) <= 0.05) ascMatches++;
          if (Math.abs(Math.abs(prev.balance - curr.balance) - prevAmt) <= 0.05) descMatches++;
        } else {
          if (Math.abs(round2(prev.balance + curr.credit - curr.debit - curr.balance)) <= 0.05) {
            ascMatches++;
          }
          if (Math.abs(round2(curr.balance + prev.credit - prev.debit - prev.balance)) <= 0.05) {
            descMatches++;
          }
        }
      }
    }

    if (descMatches > ascMatches) {
      sortOrder = 'descending';
    } else if (ascMatches === descMatches && drafts[0].isoDate > drafts[drafts.length - 1].isoDate) {
      sortOrder = 'descending';
    }
  }

  const ordered = sortOrder === 'descending' ? [...drafts].reverse() : [...drafts];

  // Classify any pendingAmount rows via 3-way fallback + X-coordinate matching
  for (let i = 0; i < ordered.length; i++) {
    const d = ordered[i];
    if (d.debit > 0 || d.credit > 0 || d.pendingAmount <= 0) continue;

    // Tier 1: Explicit indicator
    if (d.explicitDrCr === 'CR') {
      d.credit = d.pendingAmount;
      d.pendingAmount = 0;
      d.classificationMethod = 'Explicit Cr Flag';
      continue;
    }
    if (d.explicitDrCr === 'DR') {
      d.debit = d.pendingAmount;
      d.pendingAmount = 0;
      d.classificationMethod = 'Explicit Dr Flag';
      continue;
    }

    // Tier 2: Running Balance Delta Math (100% foolproof when balance is available)
    const prevBal = i > 0 ? ordered[i - 1].balance : explicitOpeningBalance;
    if (prevBal !== null && d.balance !== null) {
      const delta = round2(d.balance - prevBal);
      if (delta > 0.005) {
        d.credit = d.pendingAmount;
        d.pendingAmount = 0;
        d.classificationMethod = 'Running Balance Delta (+Cr)';
        continue;
      }
      if (delta < -0.005) {
        d.debit = d.pendingAmount;
        d.pendingAmount = 0;
        d.classificationMethod = 'Running Balance Delta (-Dr)';
        continue;
      }
    }

    // Tier 2b: PDF Header X-Coordinate Matching
    if (d.xMatchedPolarity === 'CR') {
      d.credit = d.pendingAmount;
      d.pendingAmount = 0;
      d.classificationMethod = 'PDF X-Coordinate Header Match (Cr)';
      continue;
    }
    if (d.xMatchedPolarity === 'DR') {
      d.debit = d.pendingAmount;
      d.pendingAmount = 0;
      d.classificationMethod = 'PDF X-Coordinate Header Match (Dr)';
      continue;
    }

    // Tier 3: Narration Keyword Fallback
    const narr = d.narrationParts.join(' ');
    if (CREDIT_KEYWORD_RX.test(narr) && !DEBIT_KEYWORD_RX.test(narr)) {
      d.credit = d.pendingAmount;
      d.classificationMethod = 'Narration Keyword (Cr)';
    } else {
      d.debit = d.pendingAmount;
      d.classificationMethod = 'Narration Keyword (Dr)';
    }
    d.pendingAmount = 0;
  }

  return { ordered, sortOrder };
}

export function normalizeStatement(
  raw: ParsedWorkbookRaw,
  mapping: ColumnMapping,
  forceColumnMapping = false,
): AnalyzedStatement {
  const { rows, preambleText, fileName, fileType, fileSizeBytes, pdfMoneyHints } = raw;
  const initialOpening = extractExplicitOpeningBalance(preambleText);

  let extraction: DraftExtractionResult;

  if (
    mapping.headerRowIndex >= 0 ||
    (forceColumnMapping && mapping.roles.some((r) => r !== 'ignore'))
  ) {
    extraction = extractDraftsByMappedColumns(rows, mapping, initialOpening, pdfMoneyHints);
    if (extraction.drafts.length === 0 && !forceColumnMapping) {
      extraction = extractDraftsPatternFirst(rows, mapping.headers, initialOpening, pdfMoneyHints);
    }
  } else {
    extraction = extractDraftsPatternFirst(rows, [], initialOpening, pdfMoneyHints);
  }

  const { ordered: orderedDrafts, sortOrder } = resolveChronologyAndClassify(
    extraction.drafts,
    extraction.explicitOpeningBalance,
  );

  const discrepancyIds = new Set<string>();
  const transactions: NormalizedTransaction[] = orderedDrafts.map((d, idx) => {
    const narration = d.narrationParts.join(' ').replace(/\s+/g, ' ').trim() || 'No Narration';
    const paymentMode = detectPaymentMode(narration, d.refNo, d.debit);
    const counterparty = extractCounterparty(narration, paymentMode);
    const chequeInfo = detectClearedCheque(narration, d.refNo, d.debit, d.credit);
    const id = `tx-${idx + 1}-${d.rowIndex}`;

    return {
      id,
      rowIndex: d.rowIndex,
      date: d.date,
      isoDate: d.isoDate,
      valueDate: d.valueDate,
      narration,
      refNo: d.refNo || '—',
      debit: d.debit,
      credit: d.credit,
      balance: d.balance,
      paymentMode,
      counterparty,
      isChequeCleared: chequeInfo.isChequeCleared,
      chequeNumber: chequeInfo.chequeNumber,
      chequePayee: chequeInfo.chequePayee,
      chequeCategory: chequeInfo.chequeCategory,
      auditStatus: 'none',
      auditNote: '',
      rawMergedRows: d.rawMergedRows,
      hasBalanceDiscrepancy: false,
      debugInfo: {
        rawRowText: d.rawRowText,
        rawDebitStr: d.rawDebitStr || (d.debit > 0 ? String(d.debit) : ''),
        rawCreditStr: d.rawCreditStr || (d.credit > 0 ? String(d.credit) : ''),
        rawBalanceStr: d.rawBalanceStr || (d.balance !== null ? String(d.balance) : ''),
        classificationMethod: d.classificationMethod,
        autoCorrectedSwap: false,
      },
    };
  });

  // Requirement 4: Built-in Math Auto-Correction Check
  // Verify PrevBalance + Credit - Debit === CurrentBalance (±0.05); if swapped, flip Debit & Credit!
  if (extraction.explicitOpeningBalance !== null && transactions.length > 0) {
    const t0 = transactions[0];
    const t0Bal = t0.balance;
    if (t0Bal !== null) {
      const open = extraction.explicitOpeningBalance;
      const expected0 = round2(open + t0.credit - t0.debit);
      if (Math.abs(expected0 - t0Bal) > 0.05 && t0.debit !== t0.credit) {
        const swapped0 = round2(open + t0.debit - t0.credit);
        if (Math.abs(swapped0 - t0Bal) <= 0.05) {
          const tmp = t0.debit;
          t0.debit = t0.credit;
          t0.credit = tmp;
          t0.paymentMode = detectPaymentMode(t0.narration, t0.refNo, t0.debit);
          const chq0 = detectClearedCheque(t0.narration, t0.refNo, t0.debit, t0.credit);
          t0.isChequeCleared = chq0.isChequeCleared;
          t0.chequeNumber = chq0.chequeNumber;
          t0.chequePayee = chq0.chequePayee;
          t0.chequeCategory = chq0.chequeCategory;
          t0.debugInfo.autoCorrectedSwap = true;
          t0.debugInfo.classificationMethod = 'Auto-Corrected via Opening Balance Math';
        }
      }
    }
  }

  for (let i = 1; i < transactions.length; i++) {
    const prev = transactions[i - 1];
    const curr = transactions[i];
    if (prev.balance !== null && curr.balance !== null) {
      const expected = round2(prev.balance + curr.credit - curr.debit);
      if (Math.abs(expected - curr.balance) > 0.05) {
        const swapped = round2(prev.balance + curr.debit - curr.credit);
        if (Math.abs(swapped - curr.balance) <= 0.05 && curr.debit !== curr.credit) {
          const tmp = curr.debit;
          curr.debit = curr.credit;
          curr.credit = tmp;
          curr.paymentMode = detectPaymentMode(curr.narration, curr.refNo, curr.debit);
          const chq = detectClearedCheque(curr.narration, curr.refNo, curr.debit, curr.credit);
          curr.isChequeCleared = chq.isChequeCleared;
          curr.chequeNumber = chq.chequeNumber;
          curr.chequePayee = chq.chequePayee;
          curr.chequeCategory = chq.chequeCategory;
          curr.debugInfo.autoCorrectedSwap = true;
          curr.debugInfo.classificationMethod = 'Auto-Corrected via Running Balance Math';
        } else {
          curr.hasBalanceDiscrepancy = true;
          discrepancyIds.add(curr.id);
        }
      }
    }
  }

  let totalCredits = 0;
  let totalDebits = 0;
  let creditCount = 0;
  let debitCount = 0;

  for (const tx of transactions) {
    totalCredits = round2(totalCredits + tx.credit);
    totalDebits = round2(totalDebits + tx.debit);
    if (tx.credit > 0) creditCount++;
    if (tx.debit > 0) debitCount++;
  }

  let openingBalance = extraction.explicitOpeningBalance;
  let openingBalanceSource: IntegrityReport['openingBalanceSource'] =
    openingBalance !== null ? 'explicit' : 'unavailable';

  const firstWithBal = transactions.find((t) => t.balance !== null);
  const lastWithBal = [...transactions].reverse().find((t) => t.balance !== null);

  if (openingBalance === null && firstWithBal && firstWithBal.balance !== null) {
    openingBalance = round2(firstWithBal.balance - firstWithBal.credit + firstWithBal.debit);
    openingBalanceSource = 'derived';
  }

  const closingBalance =
    extraction.explicitClosingBalance !== null
      ? extraction.explicitClosingBalance
      : lastWithBal && lastWithBal.balance !== null
        ? lastWithBal.balance
        : null;

  const netCashFlow = round2(totalCredits - totalDebits);

  let computedClosingBalance: number | null = null;
  let discrepancy: number | null = null;
  let integrityStatus: IntegrityReport['status'] = 'unverifiable';

  if (openingBalance !== null && closingBalance !== null && transactions.length > 0) {
    computedClosingBalance = round2(openingBalance + totalCredits - totalDebits);
    discrepancy = round2(closingBalance - computedClosingBalance);
    if (Math.abs(discrepancy) <= 0.05 && discrepancyIds.size === 0) {
      integrityStatus = 'verified';
    } else {
      integrityStatus = 'discrepancy';
    }
  }

  const sampleNarrations = transactions
    .slice(0, 15)
    .map((t) => t.narration)
    .join('\n');
  const detectedBank = detectIndianBank(preambleText, fileName, sampleNarrations);
  const accountHolderName = extractAccountHolderName(preambleText);
  const accountNumber = extractAccountNumber(preambleText);
  const statementPeriod =
    transactions.length > 0
      ? `${transactions[0].date} to ${transactions[transactions.length - 1].date}`
      : null;

  return {
    raw,
    mapping,
    metadata: {
      fileName,
      fileType,
      fileSizeBytes,
      detectedBank,
      accountHolderName,
      accountNumber,
      statementPeriod,
      headerRowIndex: mapping.headerRowIndex,
      totalRawRows: rows.length,
      mergedContinuationRows: extraction.mergedContinuationRows,
      sortOrder,
    },
    integrity: {
      openingBalance,
      openingBalanceSource,
      closingBalance,
      computedClosingBalance,
      totalCredits,
      totalDebits,
      creditCount,
      debitCount,
      netCashFlow,
      discrepancy,
      status: integrityStatus,
      discrepancyRowIds: Array.from(discrepancyIds),
    },
    transactions,
  };
}
