import * as XLSX from 'xlsx';
import {
  AUDIT_STATUS_CONFIG,
  type AnalyzedStatement,
  type NormalizedTransaction,
} from '../types/statement';
import { formatINR } from '../utils/indianFormat';

function autoFitColumns(rows: unknown[][]): XLSX.ColInfo[] {
  const maxWidths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, idx) => {
      const len = cell === null || cell === undefined ? 0 : String(cell).length;
      maxWidths[idx] = Math.min(Math.max(maxWidths[idx] || 10, len + 3), 58);
    });
  }
  return maxWidths.map((wch) => ({ wch }));
}

function makeSheet(aoa: unknown[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = autoFitColumns(aoa);
  return ws;
}

export function exportCorporateAuditPack(
  statement: AnalyzedStatement,
  thresholdAmount: number,
): void {
  const { metadata, integrity, transactions } = statement;

  const highValueCredits = transactions.filter((t) => t.credit >= thresholdAmount);
  const highValueDebits = transactions.filter((t) => t.debit >= thresholdAmount);
  const clearedCheques = transactions.filter((t) => t.isChequeCleared);

  const hvCreditTotal = highValueCredits.reduce((s, t) => s + t.credit, 0);
  const hvDebitTotal = highValueDebits.reduce((s, t) => s + t.debit, 0);
  const chequeTotal = clearedCheques.reduce((s, t) => s + t.debit, 0);

  const countByAuditStatus = (status: NormalizedTransaction['auditStatus']) =>
    transactions.filter((t) => t.auditStatus === status).length;

  // Sheet 1: Executive Summary & Integrity Check
  const summaryRows: unknown[][] = [
    ['LEDGER VAULT — CORPORATE CURRENT ACCOUNT AUDIT PACK'],
    ['Generated Locally (100% Client-Side)', new Date().toLocaleString('en-IN')],
    [],
    ['STATEMENT PROFILE', 'VALUE'],
    ['Detected Bank', metadata.detectedBank],
    ['Account Number', metadata.accountNumber || 'Not Detected in Header'],
    ['Source File', `${metadata.fileName} (${metadata.fileType})`],
    ['Statement Period', metadata.statementPeriod || 'N/A'],
    ['Total Normalized Transactions', transactions.length],
    ['Merged Multi-Line Continuation Rows', metadata.mergedContinuationRows],
    [],
    ['FINANCIAL INTEGRITY RECONCILIATION', 'AMOUNT / STATUS'],
    [
      `Opening Balance (${integrity.openingBalanceSource === 'explicit' ? 'Statement Explicit' : integrity.openingBalanceSource === 'derived' ? 'Derived from Row 1' : 'Unavailable'})`,
      integrity.openingBalance !== null ? formatINR(integrity.openingBalance) : 'N/A',
    ],
    [`Total Credits (${integrity.creditCount} Txns)`, formatINR(integrity.totalCredits)],
    [`Total Debits (${integrity.debitCount} Txns)`, formatINR(integrity.totalDebits)],
    ['Net Cash Flow', formatINR(integrity.netCashFlow)],
    [
      'Expected Closing Balance (Open + Cr - Dr)',
      integrity.computedClosingBalance !== null ? formatINR(integrity.computedClosingBalance) : 'N/A',
    ],
    [
      'Reported Closing Balance',
      integrity.closingBalance !== null ? formatINR(integrity.closingBalance) : 'N/A',
    ],
    [
      'Reconciliation Variance',
      integrity.discrepancy !== null ? formatINR(integrity.discrepancy) : 'N/A',
    ],
    [
      'Integrity Audit Result',
      integrity.status === 'verified'
        ? 'VERIFIED (Opening + Credits - Debits = Closing)'
        : integrity.status === 'discrepancy'
          ? `DISCREPANCY DETECTED (${integrity.discrepancyRowIds.length} row breaks)`
          : 'UNVERIFIABLE (Missing Opening/Closing Balance Columns)',
    ],
    [],
    ['AUDIT SEGREGATION SUMMARY', 'COUNT', 'TOTAL VALUE (INR)'],
    [
      `High-Value Credits (>= ${formatINR(thresholdAmount, false)})`,
      highValueCredits.length,
      formatINR(hvCreditTotal),
    ],
    [
      `High-Value Debits (>= ${formatINR(thresholdAmount, false)})`,
      highValueDebits.length,
      formatINR(hvDebitTotal),
    ],
    ['Issued & Cleared Cheques', clearedCheques.length, formatINR(chequeTotal)],
    [],
    ['AUDITOR REVIEW TAGS', 'TRANSACTION COUNT'],
    ['Verified', countByAuditStatus('verified')],
    ['Needs Clarification', countByAuditStatus('needs_clarification')],
    ['Capital Expense', countByAuditStatus('capital_expense')],
    ['High Priority', countByAuditStatus('high_priority')],
    ['Untagged', countByAuditStatus('none')],
  ];

  // Sheet 2: High-Value Credits
  const hvCreditRows: unknown[][] = [
    [
      'Date',
      'Remitter / Source',
      'Payment Mode',
      'Ref / Instrument No',
      'Credit Amount (INR)',
      'Audit Status',
      'Auditor Notes',
      'Full Narration',
    ],
    ...highValueCredits.map((t) => [
      t.date,
      t.counterparty,
      t.paymentMode,
      t.refNo,
      t.credit,
      AUDIT_STATUS_CONFIG[t.auditStatus].label,
      t.auditNote,
      t.narration,
    ]),
  ];

  // Sheet 3: High-Value Debits
  const hvDebitRows: unknown[][] = [
    [
      'Date',
      'Beneficiary / Payee',
      'Payment Mode',
      'Ref / Instrument No',
      'Debit Amount (INR)',
      'Audit Status',
      'Auditor Notes',
      'Full Narration',
    ],
    ...highValueDebits.map((t) => [
      t.date,
      t.counterparty,
      t.paymentMode,
      t.refNo,
      t.debit,
      AUDIT_STATUS_CONFIG[t.auditStatus].label,
      t.auditNote,
      t.narration,
    ]),
  ];

  // Sheet 4: Issued & Cleared Cheque Register
  const chequeRows: unknown[][] = [
    [
      'Cleared Date',
      'Cheque Number',
      'Payee / Beneficiary Name',
      'Clearing Category',
      'Cheque Amount (INR)',
      'Audit Status',
      'Auditor Notes',
      'Full Narration',
    ],
    ...clearedCheques.map((t) => [
      t.date,
      t.chequeNumber || t.refNo,
      t.chequePayee || t.counterparty,
      t.chequeCategory || 'Outstation / Local Clearing',
      t.debit,
      AUDIT_STATUS_CONFIG[t.auditStatus].label,
      t.auditNote,
      t.narration,
    ]),
  ];

  // Sheet 5: Full Normalized Statement
  const fullRows: unknown[][] = [
    [
      'Source Row',
      'Date',
      'Value Date',
      'Mode',
      'Counterparty',
      'Cheque / Ref No',
      'Debit (INR)',
      'Credit (INR)',
      'Balance (INR)',
      'Balance Integrity',
      'Audit Status',
      'Auditor Notes',
      'Normalized Narration',
    ],
    ...transactions.map((t) => [
      t.rowIndex,
      t.date,
      t.valueDate,
      t.paymentMode,
      t.counterparty,
      t.refNo,
      t.debit || 0,
      t.credit || 0,
      t.balance !== null ? t.balance : '',
      t.hasBalanceDiscrepancy ? 'Row Break' : 'OK',
      AUDIT_STATUS_CONFIG[t.auditStatus].label,
      t.auditNote,
      t.narration,
    ]),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, makeSheet(summaryRows), 'Executive Summary');
  XLSX.utils.book_append_sheet(wb, makeSheet(hvCreditRows), 'High-Value Credits');
  XLSX.utils.book_append_sheet(wb, makeSheet(hvDebitRows), 'High-Value Debits');
  XLSX.utils.book_append_sheet(wb, makeSheet(chequeRows), 'Cleared Cheque Register');
  XLSX.utils.book_append_sheet(wb, makeSheet(fullRows), 'Full Normalized Ledger');

  const safeBaseName = metadata.fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `Audit_Pack_${safeBaseName}.xlsx`);
}
