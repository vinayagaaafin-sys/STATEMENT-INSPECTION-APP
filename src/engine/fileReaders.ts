import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ParsedWorkbookRaw, PdfRowMoneyHint } from '../types/statement';
import {
  isStrictDecimalMoneyToken,
  parseIndianAmount,
  parseIndianCurrency,
} from '../utils/indianFormat';
import {
  decryptProtectedWorkbookIfNeeded,
  IncorrectPasswordError,
  PasswordRequiredError,
} from './excelDecrypt';

export { IncorrectPasswordError, PasswordRequiredError };

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function cleanGrid(rawRows: unknown[][]): string[][] {
  const cleaned = rawRows.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) =>
      cell === null || cell === undefined ? '' : String(cell).replace(/\s+/g, ' ').trim(),
    ),
  );

  // Trim trailing empty cells on each row while keeping interior column indices intact
  return cleaned.filter((row) => row.some((c) => c.length > 0));
}

function buildPreambleText(rows: string[][], maxLines = 45): string {
  return rows
    .slice(0, maxLines)
    .map((r) => r.filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n');
}

export async function readCsvFile(file: File): Promise<ParsedWorkbookRaw> {
  const text = await file.text();
  // Strip UTF-8 BOM if present
  const cleanText = text.replace(/^\uFEFF/, '');

  const parsed = Papa.parse<string[]>(cleanText, {
    header: false,
    skipEmptyLines: false,
    delimitersToGuess: [',', '\t', '|', ';'],
  });

  const rows = cleanGrid(parsed.data || []);
  return {
    rows,
    preambleText: buildPreambleText(rows),
    fileName: file.name,
    fileType: 'CSV',
    fileSizeBytes: file.size,
  };
}

export async function readExcelFile(file: File, password?: string): Promise<ParsedWorkbookRaw> {
  const rawBuffer = await file.arrayBuffer();
  const buffer = await decryptProtectedWorkbookIfNeeded(rawBuffer, password);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: false,
      raw: false,
      password,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('password-protected') || msg.includes('file is password')) {
      throw password ? new IncorrectPasswordError() : new PasswordRequiredError(file.name);
    }
    if (msg.includes('password is incorrect') || msg.includes('incorrect password')) {
      throw new IncorrectPasswordError();
    }
    throw err;
  }

  // Choose the sheet with the most populated rows
  let bestSheetName = workbook.SheetNames[0];
  let bestRows: string[][] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rawGrid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });
    const normalized = cleanGrid(rawGrid);
    if (normalized.length > bestRows.length) {
      bestRows = normalized;
      bestSheetName = name;
    }
  }

  void bestSheetName;

  return {
    rows: bestRows,
    preambleText: buildPreambleText(bestRows),
    fileName: file.name,
    fileType: 'EXCEL',
    fileSizeBytes: file.size,
  };
}

interface PdfToken {
  text: string;
  x: number;
  endX: number;
  y: number;
}

interface PdfLine {
  y: number;
  page: number;
  tokens: PdfToken[];
}

function mergeLineTokens(items: Array<{ str: string; x: number; w: number; y: number }>): PdfToken[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const merged: PdfToken[] = [];

  for (const item of sorted) {
    const txt = item.str;
    if (!txt.trim()) continue;
    const trimmedStartGap = item.x;
    const itemWidth = Math.max(item.w, txt.length * 3.5);
    const prev = merged[merged.length - 1];

    // Merge glyphs/fragments that belong to the same column cell (small horizontal gap)
    if (prev && trimmedStartGap - prev.endX <= 5.5) {
      const gap = trimmedStartGap - prev.endX;
      const prevIsNumPart = /^[-+(]?[\d,.]+$/.test(prev.text.trim());
      const currIsNumPart = /^[\d,.]+\)?$/.test(txt.trim());
      // Never inject a space inside a split currency figure like "1,50," + "000.00"
      const needsSpace =
        prevIsNumPart && currIsNumPart
          ? false
          : gap > 1.2 && !prev.text.endsWith(' ') && !txt.startsWith(' ');
      prev.text = `${prev.text}${needsSpace ? ' ' : ''}${txt}`.replace(/\s+/g, ' ').trim();
      prev.endX = Math.max(prev.endX, item.x + itemWidth);
    } else {
      merged.push({
        text: txt.replace(/\s+/g, ' ').trim(),
        x: item.x,
        endX: item.x + itemWidth,
        y: item.y,
      });
    }
  }

  return merged;
}

function isLikelyHeaderLine(tokens: PdfToken[]): boolean {
  if (tokens.length < 3) return false;
  const joined = tokens.map((t) => t.text.toLowerCase()).join(' ');
  if (joined.length > 220) return false;
  const hasDate = /\b(date|dt|tran|txn)\b/.test(joined);
  const hasDescOrAmt =
    /(particulars|narration|description|remarks|details|debit|withdrawal|credit|deposit|balance|amount|dr\/cr)/.test(
      joined,
    );
  return hasDate && hasDescOrAmt;
}

function mergeTwoHeaderLines(top: PdfToken[], bottom: PdfToken[]): PdfToken[] {
  const combined: PdfToken[] = top.map((t) => ({ ...t }));
  for (const bt of bottom) {
    const bCenter = (bt.x + bt.endX) / 2;
    const match = combined.find((tt) => {
      const tCenter = (tt.x + tt.endX) / 2;
      const overlaps = bt.x <= tt.endX + 8 && bt.endX >= tt.x - 8;
      return overlaps || Math.abs(tCenter - bCenter) <= 22;
    });
    if (match) {
      match.text = `${match.text} ${bt.text}`.replace(/\s+/g, ' ').trim();
      match.x = Math.min(match.x, bt.x);
      match.endX = Math.max(match.endX, bt.endX);
    } else {
      combined.push({ ...bt });
    }
  }
  return combined.sort((a, b) => a.x - b.x);
}

const PDF_NOISE_LINE_RX =
  /^(page\s+\d+\s*(of|\/)\s*\d+|this is a computer generated|registered office|corporate office|toll\s*free|ifsc\s*code\s*:|micr\s*code\s*:)/i;

interface PdfDecimalMoneyToken {
  raw: string;
  value: number;
  indicator: 'DR' | 'CR' | null;
  centerX: number;
  endX: number;
}

function extractStrictPdfMoneyTokens(tokens: PdfToken[]): PdfDecimalMoneyToken[] {
  const result: PdfDecimalMoneyToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const trimmed = tok.text.trim();

    if (isStrictDecimalMoneyToken(trimmed)) {
      let combinedRaw = trimmed;
      const next = i + 1 < tokens.length ? tokens[i + 1] : null;
      if (next && /^(CR|DR)\.?$/i.test(next.text.trim()) && next.x - tok.endX <= 24) {
        combinedRaw = `${trimmed} ${next.text.trim()}`;
        i += 1;
      }
      const parsed = parseIndianAmount(combinedRaw);
      if (parsed) {
        result.push({
          raw: combinedRaw,
          value: parsed.value,
          indicator: parsed.indicator,
          centerX: (tok.x + tok.endX) / 2,
          endX: tok.endX,
        });
      }
      continue;
    }

    // Handle merged tokens containing multiple decimal amounts e.g. "1,50,000.00 12,50,000.00"
    const subParts = trimmed.split(/\s+/);
    if (subParts.length >= 2) {
      const span = Math.max(1, tok.endX - tok.x);
      let cursor = 0;
      for (let s = 0; s < subParts.length; s++) {
        const part = subParts[s];
        const partPos = trimmed.indexOf(part, cursor);
        cursor = partPos + part.length;
        if (isStrictDecimalMoneyToken(part)) {
          let combinedPart = part;
          if (s + 1 < subParts.length && /^(CR|DR)\.?$/i.test(subParts[s + 1])) {
            combinedPart = `${part} ${subParts[s + 1]}`;
            s += 1;
          }
          const parsed = parseIndianAmount(combinedPart);
          if (parsed) {
            const frac = (partPos + part.length / 2) / Math.max(1, trimmed.length);
            const approxCenter = tok.x + span * frac;
            result.push({
              raw: combinedPart,
              value: parsed.value,
              indicator: parsed.indicator,
              centerX: approxCenter,
              endX: tok.x + span * ((partPos + part.length) / Math.max(1, trimmed.length)),
            });
          }
        }
      }
    }
  }
  return result.sort((a, b) => a.endX - b.endX);
}

function buildPdfRowMoneyHint(
  tokens: PdfToken[],
  rowIndex: number,
  debitColX: number | null,
  creditColX: number | null,
): PdfRowMoneyHint | null {
  const moneyTokens = extractStrictPdfMoneyTokens(tokens);
  if (moneyTokens.length === 0) return null;

  const matchPolarityByX = (tok: PdfDecimalMoneyToken): 'DR' | 'CR' | null => {
    if (tok.indicator) return tok.indicator;
    if (tok.value < 0) return 'DR';
    if (debitColX !== null && creditColX !== null) {
      const distDr = Math.abs(tok.centerX - debitColX);
      const distCr = Math.abs(tok.centerX - creditColX);
      if (Math.abs(distDr - distCr) >= 12) {
        return distDr < distCr ? 'DR' : 'CR';
      }
    }
    return null;
  };

  if (moneyTokens.length >= 3) {
    // Case A: [Debit, Credit, Closing Balance] at right end of row
    const balTok = moneyTokens[moneyTokens.length - 1];
    const crTok = moneyTokens[moneyTokens.length - 2];
    const drTok = moneyTokens[moneyTokens.length - 3];

    const drVal = Math.abs(parseIndianCurrency(drTok.raw));
    const crVal = Math.abs(parseIndianCurrency(crTok.raw));
    const balRawVal = parseIndianCurrency(balTok.raw);
    const balVal = balTok.indicator === 'DR' && balRawVal > 0 ? -balRawVal : balRawVal;

    // Ignore whichever of Debit/Credit is 0.00; if both are > 0, crTok is immediately left of Balance
    const xPol = drVal > 0 && crVal > 0 ? matchPolarityByX(crTok) : null;
    return {
      rowIndex,
      debitStr: drVal > 0 ? drTok.raw : '0.00',
      creditStr: crVal > 0 ? crTok.raw : '0.00',
      balanceStr: balTok.raw,
      debitVal: drVal > 0 && crVal === 0 ? drVal : 0,
      creditVal: crVal > 0 && drVal === 0 ? crVal : 0,
      pendingVal: drVal > 0 && crVal > 0 ? crVal : 0,
      pendingIndicator: drVal > 0 && crVal > 0 ? crTok.indicator : null,
      balanceVal: balVal,
      xMatchedPolarity: xPol,
    };
  }

  if (moneyTokens.length === 2) {
    // Case B: [Transaction Amount, Closing Balance] (highest X = Closing Balance)
    const balTok = moneyTokens[1];
    const txnTok = moneyTokens[0];
    const txnVal = Math.abs(parseIndianCurrency(txnTok.raw));
    const balRawVal = parseIndianCurrency(balTok.raw);
    const balVal = balTok.indicator === 'DR' && balRawVal > 0 ? -balRawVal : balRawVal;
    const xPolarity = matchPolarityByX(txnTok);

    return {
      rowIndex,
      debitStr: xPolarity === 'DR' ? txnTok.raw : '',
      creditStr: xPolarity === 'CR' ? txnTok.raw : '',
      balanceStr: balTok.raw,
      debitVal: txnTok.indicator === 'DR' || txnTok.value < 0 ? txnVal : 0,
      creditVal: txnTok.indicator === 'CR' ? txnVal : 0,
      pendingVal: txnTok.indicator || txnTok.value < 0 ? 0 : txnVal,
      pendingIndicator: txnTok.indicator || (txnTok.value < 0 ? 'DR' : null),
      balanceVal: balVal,
      xMatchedPolarity: xPolarity,
    };
  }

  // Case C: 1 Decimal Money token on line
  const singleTok = moneyTokens[0];
  const singleVal = Math.abs(parseIndianCurrency(singleTok.raw));
  const xPolarity = matchPolarityByX(singleTok);

  return {
    rowIndex,
    debitStr: xPolarity === 'DR' ? singleTok.raw : '',
    creditStr: xPolarity === 'CR' ? singleTok.raw : '',
    balanceStr: '',
    debitVal: singleTok.indicator === 'DR' || singleTok.value < 0 ? singleVal : 0,
    creditVal: singleTok.indicator === 'CR' ? singleVal : 0,
    pendingVal: singleTok.indicator || singleTok.value < 0 ? 0 : singleVal,
    pendingIndicator: singleTok.indicator || (singleTok.value < 0 ? 'DR' : null),
    balanceVal: null,
    xMatchedPolarity: xPolarity,
  };
}

export async function readPdfFile(file: File, password?: string): Promise<ParsedWorkbookRaw> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    password,
  });

  let pdf: pdfjsLib.PDFDocumentProxy;
  try {
    pdf = await loadingTask.promise;
  } catch (err: unknown) {
    const pdfErr = err as { name?: string; code?: number; message?: string };
    if (
      pdfErr?.name === 'PasswordException' ||
      pdfErr?.code === pdfjsLib.PasswordResponses.NEED_PASSWORD ||
      pdfErr?.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD ||
      (pdfErr?.message || '').toLowerCase().includes('password')
    ) {
      if (pdfErr?.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD || Boolean(password)) {
        throw new IncorrectPasswordError();
      }
      throw new PasswordRequiredError(file.name);
    }
    throw err;
  }

  const allLines: PdfLine[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    const rawItems: Array<{ str: string; x: number; w: number; y: number }> = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const str = item.str;
      if (!str || !str.trim()) continue;
      const transform = item.transform;
      const x = transform[4];
      const y = transform[5];
      const w = typeof item.width === 'number' ? item.width : 0;
      rawItems.push({ str, x, w, y });
    }

    // Layer 1: Group items into visual horizontal lines using ±4px Y-tolerance
    rawItems.sort((a, b) => b.y - a.y || a.x - b.x);
    const pageRowBuckets: Array<{ y: number; items: typeof rawItems }> = [];

    for (const it of rawItems) {
      const bucket = pageRowBuckets.find((b) => Math.abs(b.y - it.y) <= 4.0);
      if (bucket) {
        bucket.items.push(it);
      } else {
        pageRowBuckets.push({ y: it.y, items: [it] });
      }
    }

    pageRowBuckets.sort((a, b) => b.y - a.y);
    for (const bucket of pageRowBuckets) {
      const tokens = mergeLineTokens(bucket.items);
      if (tokens.length === 0) continue;
      const lineStr = tokens.map((t) => t.text).join(' ').trim();
      if (PDF_NOISE_LINE_RX.test(lineStr)) continue;
      allLines.push({ y: bucket.y, page: p, tokens });
    }
  }

  // Locate single-line or 2-line split header in the first 120 lines
  let headerIdx = -1;
  let headerEndIdx = -1;
  let resolvedHeaderTokens: PdfToken[] = [];

  const scanCap = Math.min(allLines.length, 120);
  for (let i = 0; i < scanCap; i++) {
    if (isLikelyHeaderLine(allLines[i].tokens)) {
      headerIdx = i;
      headerEndIdx = i;
      resolvedHeaderTokens = allLines[i].tokens;
      if (i + 1 < allLines.length && Math.abs(allLines[i].y - allLines[i + 1].y) <= 18) {
        const nextJoined = allLines[i + 1].tokens.map((t) => t.text.toLowerCase()).join(' ');
        if (
          /\b(date|amt|amount|balance|no\.?|particulars|dr|cr)\b/.test(nextJoined) &&
          !/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/.test(nextJoined)
        ) {
          resolvedHeaderTokens = mergeTwoHeaderLines(allLines[i].tokens, allLines[i + 1].tokens);
          headerEndIdx = i + 1;
        }
      }
      break;
    }
    if (i + 1 < scanCap && Math.abs(allLines[i].y - allLines[i + 1].y) <= 18) {
      const merged2 = mergeTwoHeaderLines(allLines[i].tokens, allLines[i + 1].tokens);
      if (isLikelyHeaderLine(merged2)) {
        headerIdx = i;
        headerEndIdx = i + 1;
        resolvedHeaderTokens = merged2;
        break;
      }
    }
  }

  const rows: string[][] = [];
  const pdfMoneyHints: Record<number, PdfRowMoneyHint> = {};

  if (headerIdx === -1 || allLines.length === 0) {
    // Headerless PDF fallback: preserve clean X-ordered token rows + right-to-left money hints
    for (const line of allLines) {
      const rIdx = rows.length;
      rows.push(line.tokens.map((t) => t.text));
      const hint = buildPdfRowMoneyHint(line.tokens, rIdx, null, null);
      if (hint) pdfMoneyHints[rIdx] = hint;
    }
  } else {
    // Preamble lines before header
    for (let i = 0; i < headerIdx; i++) {
      rows.push([allLines[i].tokens.map((t) => t.text).join(' ')]);
    }

    const colCount = resolvedHeaderTokens.length;
    const colBounds: Array<{ start: number; end: number; headerEnd: number; headerStart: number }> = [];
    for (let c = 0; c < colCount; c++) {
      const curr = resolvedHeaderTokens[c];
      const prev = c > 0 ? resolvedHeaderTokens[c - 1] : null;
      const next = c < colCount - 1 ? resolvedHeaderTokens[c + 1] : null;
      const start = prev ? (prev.endX + curr.x) / 2 : -Infinity;
      const end = next ? (curr.endX + next.x) / 2 : Infinity;
      colBounds.push({
        start,
        end,
        headerStart: curr.x,
        headerEnd: curr.endX,
      });
    }

    // Identify X-positions of Withdrawals/Debit vs Deposits/Credit header columns
    let debitColX: number | null = null;
    let creditColX: number | null = null;
    for (let c = 0; c < colCount; c++) {
      const ht = resolvedHeaderTokens[c].text.toLowerCase();
      const center = (resolvedHeaderTokens[c].x + resolvedHeaderTokens[c].endX) / 2;
      if (debitColX === null && /(withdrawal|debit|\bdr\b|paid\s*out)/.test(ht)) {
        debitColX = center;
      } else if (creditColX === null && /(deposit|credit|\bcr\b|paid\s*in)/.test(ht)) {
        creditColX = center;
      }
    }

    // Learn actual right-aligned X-edges for numeric columns from the first 50 data rows
    const colNumericRightEdges = new Array<number | null>(colCount).fill(null);
    const edgeSamples: number[][] = Array.from({ length: colCount }, () => []);
    for (let i = headerEndIdx + 1; i < Math.min(allLines.length, headerEndIdx + 60); i++) {
      for (const tok of allLines[i].tokens) {
        if (isStrictDecimalMoneyToken(tok.text)) {
          const cCenter = (tok.x + tok.endX) / 2;
          for (let c = 0; c < colCount; c++) {
            if (cCenter >= colBounds[c].start && cCenter <= colBounds[c].end) {
              edgeSamples[c].push(tok.endX);
              break;
            }
          }
        }
      }
    }
    for (let c = 0; c < colCount; c++) {
      if (edgeSamples[c].length >= 2) {
        const sorted = [...edgeSamples[c]].sort((a, b) => a - b);
        colNumericRightEdges[c] = sorted[Math.floor(sorted.length / 2)];
      }
    }

    // Emit normalized header row
    rows.push(resolvedHeaderTokens.map((t) => t.text));

    // Bucket subsequent lines into the detected column grid + attach right-to-left money hints
    for (let i = headerEndIdx + 1; i < allLines.length; i++) {
      const line = allLines[i];
      const rowArr = new Array<string>(colCount).fill('');

      for (const tok of line.tokens) {
        const tokCenter = (tok.x + tok.endX) / 2;
        const isNumericToken = isStrictDecimalMoneyToken(tok.text);

        let bestCol = 0;
        if (isNumericToken) {
          let bestDist = Infinity;
          for (let c = 0; c < colCount; c++) {
            const bound = colBounds[c];
            const anchorEnd = colNumericRightEdges[c] ?? bound.headerEnd;
            const distToRight = Math.abs(tok.endX - anchorEnd);
            if (tokCenter >= bound.start && tokCenter <= bound.end && distToRight <= 40) {
              bestCol = c;
              break;
            }
            const dist = Math.min(
              distToRight,
              Math.abs(tokCenter - (bound.headerStart + bound.headerEnd) / 2),
            );
            if (dist < bestDist) {
              bestDist = dist;
              bestCol = c;
            }
          }
        } else {
          let matched = -1;
          for (let c = 0; c < colCount; c++) {
            if (tokCenter >= colBounds[c].start && tokCenter <= colBounds[c].end) {
              matched = c;
              break;
            }
          }
          if (matched === -1) {
            let minDist = Infinity;
            for (let c = 0; c < colCount; c++) {
              const d = Math.abs(tok.x - colBounds[c].headerStart);
              if (d < minDist) {
                minDist = d;
                matched = c;
              }
            }
          }
          bestCol = Math.max(0, matched);
        }

        rowArr[bestCol] = rowArr[bestCol] ? `${rowArr[bestCol]} ${tok.text}` : tok.text;
      }

      const rIdx = rows.length;
      rows.push(rowArr);
      const hint = buildPdfRowMoneyHint(line.tokens, rIdx, debitColX, creditColX);
      if (hint) pdfMoneyHints[rIdx] = hint;
    }
  }

  return {
    rows,
    preambleText: buildPreambleText(rows, Math.min(45, headerIdx > 0 ? headerIdx + 2 : 30)),
    fileName: file.name,
    fileType: 'PDF',
    fileSizeBytes: file.size,
    pdfMoneyHints,
  };
}

export async function readStatementFile(
  file: File,
  password?: string,
): Promise<ParsedWorkbookRaw> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    return readCsvFile(file);
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.ods')) {
    return readExcelFile(file, password);
  }
  if (lower.endsWith('.pdf')) {
    return readPdfFile(file, password);
  }
  throw new Error(
    `Unsupported file format for "${file.name}". Please upload a CSV, Excel (.xls/.xlsx), or PDF bank statement.`,
  );
}
