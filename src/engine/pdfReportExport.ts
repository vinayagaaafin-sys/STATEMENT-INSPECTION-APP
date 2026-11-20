import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AUDIT_STATUS_CONFIG,
  type AnalyzedStatement,
  type CreditUnderwritingReport,
  type LoanAnalysisSummary,
} from '../types/statement';
import { formatRs } from '../utils/indianFormat';

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}

const SLATE_DEEP: [number, number, number] = [30, 41, 59]; // #1E293B
const SLATE_PRIMARY: [number, number, number] = [51, 65, 85]; // #334155
const COBALT_BLUE: [number, number, number] = [29, 78, 216]; // #1D4ED8
const LIGHT_SLATE_BG: [number, number, number] = [241, 245, 249]; // #F1F5F9
const LIGHT_BLUE_BG: [number, number, number] = [219, 234, 254]; // #DBEAFE
const TEXT_PRIMARY: [number, number, number] = [15, 23, 42]; // #0F172A
const TEXT_SECONDARY: [number, number, number] = [100, 116, 139]; // #64748B
const BORDER_SLATE: [number, number, number] = [226, 232, 240]; // #E2E8F0
const GREEN_MATCHED: [number, number, number] = [22, 163, 74]; // #16A34A
const RED_MISMATCH: [number, number, number] = [220, 38, 38]; // #DC2626
const AMBER_WARNING: [number, number, number] = [217, 119, 6]; // #D97706

function sanitizePdfText(input: string | null | undefined, maxLen = 140): string {
  if (!input) return '—';
  // Replace Unicode rupee symbol or non-Latin-1 glyphs so Helvetica renders cleanly
  const cleaned = String(input)
    .replace(/₹/g, 'Rs. ')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[•·]/g, '|')
    .replace(/[—–]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '-';
  if (cleaned.length > maxLen) {
    return `${cleaned.slice(0, maxLen - 3)}...`;
  }
  return cleaned;
}

function getLastTableY(doc: JsPdfWithAutoTable, fallbackY: number): number {
  const y = doc.lastAutoTable?.finalY;
  return typeof y === 'number' ? y : fallbackY;
}

function drawSectionHeading(
  doc: JsPdfWithAutoTable,
  sectionNumber: string,
  title: string,
  subtitle: string,
  startY: number,
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;
  if (y > pageHeight - 48) {
    doc.addPage();
    y = 22;
  }

  doc.setFillColor(...LIGHT_SLATE_BG);
  doc.setDrawColor(...BORDER_SLATE);
  doc.roundedRect(14, y, 182, 13, 1.5, 1.5, 'FD');

  doc.setFillColor(...COBALT_BLUE);
  doc.rect(14, y, 2.5, 13, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text(`${sectionNumber}. ${sanitizePdfText(title, 95)}`, 19.5, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text(sanitizePdfText(subtitle, 120), 19.5, y + 10.2);

  return y + 17;
}

export function buildInspectionPdfDocument(
  statement: AnalyzedStatement,
  loanSummary: LoanAnalysisSummary,
  thresholdAmount: number,
  underwriting: CreditUnderwritingReport,
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  }) as JsPdfWithAutoTable;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const { metadata, integrity, transactions } = statement;

  const generatedStamp = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // =========================================================================
  // PAGE 1: COVER HEADER & EXECUTIVE SUMMARY
  // =========================================================================
  doc.setFillColor(...SLATE_DEEP);
  doc.rect(0, 0, pageWidth, 34, 'F');

  // Cobalt accent stripe
  doc.setFillColor(...COBALT_BLUE);
  doc.rect(0, 34, pageWidth, 1.6, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('CORPORATE CURRENT ACCOUNT INSPECTION REPORT', 14, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    'Ledger Integrity Audit | High-Value Segregation | Cheque Register | Loan & Borrowing Trace',
    14,
    21,
  );
  doc.text(`Generated: ${sanitizePdfText(generatedStamp, 60)}`, 14, 27.5);

  // Account & Statement Metadata Card
  let cursorY = 42;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER_SLATE);
  doc.roundedRect(14, cursorY, 182, 34, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COBALT_BLUE);
  doc.text('ACCOUNT & STATEMENT PROFILE', 18, cursorY + 7);

  // Status badge text on right of profile box
  let statusText = 'BALANCE COLUMN ABSENT';
  let statusColor = AMBER_WARNING;
  if (integrity.status === 'verified') {
    statusText = 'INTEGRITY MATCHED';
    statusColor = GREEN_MATCHED;
  } else if (integrity.status === 'discrepancy') {
    statusText = 'INTEGRITY MISMATCH';
    statusColor = RED_MISMATCH;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...statusColor);
  doc.text(statusText, 192, cursorY + 7, { align: 'right' });

  doc.setDrawColor(...BORDER_SLATE);
  doc.line(18, cursorY + 10, 192, cursorY + 10);

  doc.setFontSize(8.5);
  const leftLabelX = 18;
  const leftValX = 52;
  const rightLabelX = 108;
  const rightValX = 140;

  // Row 1
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text('Account Holder:', leftLabelX, cursorY + 16);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text(
    sanitizePdfText(metadata.accountHolderName || 'Not Specified in Header', 42),
    leftValX,
    cursorY + 16,
  );

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text('Bank Institution:', rightLabelX, cursorY + 16);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text(sanitizePdfText(metadata.detectedBank, 36), rightValX, cursorY + 16);

  // Row 2
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text('Account Number:', leftLabelX, cursorY + 22.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text(sanitizePdfText(metadata.accountNumber || 'Masked / N/A', 38), leftValX, cursorY + 22.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text('Statement Period:', rightLabelX, cursorY + 22.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text(sanitizePdfText(metadata.statementPeriod || 'Full Uploaded Range', 36), rightValX, cursorY + 22.5);

  // Row 3
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text('Source File:', leftLabelX, cursorY + 29);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text(
    sanitizePdfText(`${metadata.fileName} (${metadata.fileType})`, 46),
    leftValX,
    cursorY + 29,
  );

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text('Normalized Rows:', rightLabelX, cursorY + 29);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text(`${transactions.length} transactions`, rightValX, cursorY + 29);

  cursorY += 40;

  // Executive KPI Summary Table
  const hvCredits = transactions.filter((t) => t.credit >= thresholdAmount);
  const hvDebits = transactions.filter((t) => t.debit >= thresholdAmount);
  const hvCombinedTotal =
    hvCredits.reduce((s, t) => s + t.credit, 0) + hvDebits.reduce((s, t) => s + t.debit, 0);
  const clearedCheques = transactions.filter((t) => t.isChequeCleared);
  const clearedChequeTotal = clearedCheques.reduce((s, t) => s + t.debit, 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text('EXECUTIVE KPI & RECONCILIATION SUMMARY', 14, cursorY);
  cursorY += 3;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: 14, right: 14 },
    theme: 'grid',
    head: [['Audit Metric', 'Amount / Figure', 'Audit Metric', 'Amount / Figure']],
    body: [
      [
        'Opening Balance',
        integrity.openingBalance !== null ? formatRs(integrity.openingBalance) : 'N/A',
        'Reported Closing Balance',
        integrity.closingBalance !== null ? formatRs(integrity.closingBalance) : 'N/A',
      ],
      [
        `Total Credits (${integrity.creditCount} txns)`,
        formatRs(integrity.totalCredits),
        `Total Debits (${integrity.debitCount} txns)`,
        formatRs(integrity.totalDebits),
      ],
      [
        'Net Cash Flow',
        `${integrity.netCashFlow >= 0 ? '+' : ''}${formatRs(integrity.netCashFlow)}`,
        'Computed Closing Balance',
        integrity.computedClosingBalance !== null
          ? formatRs(integrity.computedClosingBalance)
          : 'N/A',
      ],
      [
        `High-Value (>= ${formatRs(thresholdAmount, false)})`,
        `${formatRs(hvCombinedTotal)} (${hvCredits.length} Cr / ${hvDebits.length} Dr)`,
        `Cleared Cheques (${clearedCheques.length})`,
        formatRs(clearedChequeTotal),
      ],
      [
        'Detected Loans & Borrowings',
        `${loanSummary.totalDetectedLoansCount} facilities (${loanSummary.institutionalLoanCount} Inst. / ${loanSummary.tracedPrivateCount} Private)`,
        'Total Loan / EMI Exposure',
        formatRs(loanSummary.totalDetectedDebtExposure),
      ],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 8.2,
      cellPadding: 3,
      lineColor: BORDER_SLATE,
      lineWidth: 0.2,
      textColor: TEXT_PRIMARY,
    },
    headStyles: {
      fillColor: SLATE_DEEP,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: LIGHT_SLATE_BG, cellWidth: 44 },
      1: { cellWidth: 47 },
      2: { fontStyle: 'bold', fillColor: LIGHT_SLATE_BG, cellWidth: 44 },
      3: { cellWidth: 47 },
    },
  });

  cursorY = getLastTableY(doc, cursorY + 45) + 7;

  // Executive Credit Risk Score & Credit Officer Summary Note (Page 1)
  const { riskAssessment } = underwriting;
  let scoreColor = GREEN_MATCHED;
  if (riskAssessment.score < 50) scoreColor = RED_MISMATCH;
  else if (riskAssessment.score < 70) scoreColor = AMBER_WARNING;
  else if (riskAssessment.score < 85) scoreColor = COBALT_BLUE;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text('EXECUTIVE CREDIT RISK SCORE & CREDIT OFFICER SUMMARY NOTE', 14, cursorY);
  cursorY += 3;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: 14, right: 14, bottom: 20 },
    theme: 'grid',
    head: [
      [
        {
          content: `Account Conduct Score: ${riskAssessment.score} / 100  |  Rating: ${sanitizePdfText(riskAssessment.ratingBand, 40)}`,
          styles: { fillColor: scoreColor, textColor: [255, 255, 255], fontStyle: 'bold' },
        },
      ],
    ],
    body: [
      [sanitizePdfText(riskAssessment.summaryNote, 900)],
      [
        `Key Risk Factors: ${riskAssessment.factors
          .map((f) => `${f.label} (${f.impact === 0 ? 'Pass' : `${f.impact} pts`})`)
          .join(' | ')}`,
      ],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 7.9,
      cellPadding: 3,
      lineColor: BORDER_SLATE,
      lineWidth: 0.2,
      textColor: TEXT_PRIMARY,
    },
    alternateRowStyles: {
      fillColor: LIGHT_SLATE_BG,
    },
  });

  cursorY = getLastTableY(doc, cursorY + 35) + 7;

  // Auditor Remarks & Tagged Transactions Summary
  const taggedTxs = transactions.filter(
    (t) => t.auditStatus !== 'none' || t.auditNote.trim().length > 0,
  );

  if (cursorY > pageHeight - 40) {
    doc.addPage();
    cursorY = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text('AUDITOR REMARKS & TAGGED ENTRIES', 14, cursorY);
  cursorY += 3;

  if (taggedTxs.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      body: [
        [
          `No manual transaction flags or auditor notes recorded. Reconciliation variance: ${
            integrity.discrepancy !== null
              ? formatRs(integrity.discrepancy)
              : 'Balance column unavailable'
          }.`,
        ],
      ],
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        cellPadding: 3.5,
        fillColor: LIGHT_SLATE_BG,
        textColor: SLATE_PRIMARY,
        lineColor: BORDER_SLATE,
      },
    });
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [['Date', 'Party / Counterparty', 'Tag Status', 'Amount', 'Auditor Remark']],
      body: taggedTxs.slice(0, 40).map((tx) => {
        const amt = tx.credit > 0 ? `+${formatRs(tx.credit)}` : `-${formatRs(tx.debit)}`;
        return [
          tx.date,
          sanitizePdfText(tx.counterparty, 34),
          AUDIT_STATUS_CONFIG[tx.auditStatus].label,
          amt,
          sanitizePdfText(tx.auditNote || 'Tagged for audit review', 55),
        ];
      }),
      styles: {
        font: 'helvetica',
        fontSize: 7.8,
        cellPadding: 2.5,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
      },
      headStyles: {
        fillColor: COBALT_BLUE,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 38 },
        2: { cellWidth: 28 },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 64 },
      },
    });
  }

  // =========================================================================
  // SECTION 1: TRACED LOANS, PRIVATE BORROWINGS & DUE PAYMENT SCHEDULE
  // =========================================================================
  doc.addPage();
  cursorY = 18;
  cursorY = drawSectionHeading(
    doc,
    'SECTION 1',
    'Traced Loans, Private Borrowings & Due Payment Schedule',
    `Institutional EMIs: ${loanSummary.institutionalLoanCount} (${formatRs(loanSummary.institutionalEmiOutflow)}) | Traced Private/Associate Chains: ${loanSummary.tracedPrivateCount} (${formatRs(loanSummary.tracedPrivatePrincipal)} principal)`,
    cursorY,
  );

  // 1A. Institutional Bank / NBFC Loans
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE_DEEP);
  doc.text('1A. Institutional Bank / NBFC Loans & Recurring EMIs', 14, cursorY);
  cursorY += 2.5;

  if (loanSummary.institutionalLoans.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'grid',
      body: [['No institutional EMI, ACH/NACH loan debit, or NBFC lender pattern detected.']],
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        cellPadding: 3.5,
        fillColor: LIGHT_SLATE_BG,
        textColor: TEXT_SECONDARY,
        lineColor: BORDER_SLATE,
      },
    });
    cursorY = getLastTableY(doc, cursorY + 12) + 8;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [['Lender / NBFC Name', 'Triggers', 'Freq.', 'Avg Due', 'Total Outflow', 'Date Range']],
      body: [
        ...loanSummary.institutionalLoans.map((grp) => [
          sanitizePdfText(grp.lenderName, 40),
          sanitizePdfText(grp.matchedKeywords.join(', '), 28),
          `${grp.emiFrequency}x`,
          formatRs(grp.averageDueAmount),
          formatRs(grp.totalOutflow),
          `${grp.firstDebitDate} to ${grp.lastDebitDate}`,
        ]),
        [
          { content: 'Total Institutional EMI Outflow', colSpan: 4, styles: { fontStyle: 'bold', fillColor: LIGHT_BLUE_BG } },
          { content: formatRs(loanSummary.institutionalEmiOutflow), styles: { fontStyle: 'bold', halign: 'right', fillColor: LIGHT_BLUE_BG } },
          { content: `${loanSummary.institutionalLoanCount} facilities`, styles: { fontStyle: 'bold', fillColor: LIGHT_BLUE_BG } },
        ],
      ],
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2.6,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
      },
      headStyles: {
        fillColor: SLATE_DEEP,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 44, fontStyle: 'bold' },
        1: { cellWidth: 30 },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 36 },
      },
    });
    cursorY = getLastTableY(doc, cursorY + 25) + 9;
  }

  // 1B. Private / Associate Traced Loan Chains
  if (cursorY > pageHeight - 45) {
    doc.addPage();
    cursorY = 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE_DEEP);
  doc.text('1B. Traced Private Financier, Unsecured Borrowing & Associate Chains', 14, cursorY);
  cursorY += 2.5;

  if (loanSummary.tracedLoanChains.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'grid',
      body: [
        [
          `No large-credit inflows (>= ${formatRs(Math.max(10_000, thresholdAmount), false)}) matched subsequent recurring debit payouts to the same counterparty.`,
        ],
      ],
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        cellPadding: 3.5,
        fillColor: LIGHT_SLATE_BG,
        textColor: TEXT_SECONDARY,
        lineColor: BORDER_SLATE,
      },
    });
    cursorY = getLastTableY(doc, cursorY + 12) + 8;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [
        [
          'Lender / Counterparty',
          'Initial Credit & Principal',
          'Followed-Up Subsequent Dues / Debits',
          'Total Repaid',
          'Net Outstanding',
          'Risk Tag',
        ],
      ],
      body: [
        ...loanSummary.tracedLoanChains.map((chain) => {
          const debitsSummary = chain.subsequentDebits
            .slice(0, 6)
            .map((d) => {
              const mode = d.transaction.isChequeCleared
                ? `Chq #${d.transaction.chequeNumber || d.transaction.refNo}`
                : d.transaction.paymentMode;
              return `${d.transaction.date} (${mode}): ${formatRs(d.transaction.debit)}`;
            })
            .join('\n');
          const extraNote =
            chain.subsequentDebits.length > 6
              ? `\n+${chain.subsequentDebits.length - 6} more payouts`
              : '';

          return [
            sanitizePdfText(chain.lenderPartyName, 36),
            `${chain.initialCreditDate}\n${formatRs(chain.principalReceived)}`,
            `${debitsSummary}${extraNote}`,
            formatRs(chain.totalRepaid),
            formatRs(chain.netOutstandingBalance),
            sanitizePdfText(chain.riskClassification, 32),
          ];
        }),
        [
          {
            content: 'Private & Associate Chain Totals',
            styles: { fontStyle: 'bold', fillColor: LIGHT_BLUE_BG },
          },
          {
            content: formatRs(loanSummary.tracedPrivatePrincipal),
            styles: { fontStyle: 'bold', fillColor: LIGHT_BLUE_BG },
          },
          {
            content: `${loanSummary.tracedPrivateCount} traced counterparties`,
            styles: { fontStyle: 'bold', fillColor: LIGHT_BLUE_BG },
          },
          {
            content: formatRs(loanSummary.tracedPrivateRepaid),
            styles: { fontStyle: 'bold', halign: 'right', fillColor: LIGHT_BLUE_BG },
          },
          {
            content: formatRs(loanSummary.tracedPrivateNetOutstanding),
            styles: { fontStyle: 'bold', halign: 'right', fillColor: LIGHT_BLUE_BG },
          },
          {
            content: 'Summary',
            styles: { fontStyle: 'bold', fillColor: LIGHT_BLUE_BG },
          },
        ],
      ],
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: 2.5,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
        valign: 'top',
      },
      headStyles: {
        fillColor: COBALT_BLUE,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 30, fontStyle: 'bold' },
        1: { cellWidth: 27 },
        2: { cellWidth: 53 },
        3: { cellWidth: 23, halign: 'right' },
        4: { cellWidth: 24, halign: 'right' },
        5: { cellWidth: 25 },
      },
    });
    cursorY = getLastTableY(doc, cursorY + 30) + 10;
  }

  // =========================================================================
  // SECTION 2: HIGH-VALUE CREDITS & HIGH-VALUE DEBITS
  // =========================================================================
  if (cursorY > pageHeight - 55) {
    doc.addPage();
    cursorY = 18;
  }
  const highValueCredits = transactions
    .filter((t) => t.credit >= thresholdAmount)
    .sort((a, b) => b.credit - a.credit);
  const highValueDebits = transactions
    .filter((t) => t.debit >= thresholdAmount)
    .sort((a, b) => b.debit - a.debit);

  cursorY = drawSectionHeading(
    doc,
    'SECTION 2',
    `High-Value Credits & Debits (Threshold >= ${formatRs(thresholdAmount, false)})`,
    `${highValueCredits.length} High-Value Credits (${formatRs(hvCredits.reduce((s, t) => s + t.credit, 0))}) | ${highValueDebits.length} High-Value Debits (${formatRs(hvDebits.reduce((s, t) => s + t.debit, 0))})`,
    cursorY,
  );

  // 2A. High-Value Credits
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE_DEEP);
  doc.text('2A. High-Value Credits (Large Inflows)', 14, cursorY);
  cursorY += 2.5;

  if (highValueCredits.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'grid',
      body: [[`No credit entries >= ${formatRs(thresholdAmount, false)} found in statement.`]],
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        cellPadding: 3,
        fillColor: LIGHT_SLATE_BG,
        textColor: TEXT_SECONDARY,
      },
    });
    cursorY = getLastTableY(doc, cursorY + 12) + 8;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [['Date', 'Remitter / Source', 'Mode / Ref No', 'Narration', 'Credit Amount']],
      body: highValueCredits.map((tx) => [
        tx.date,
        sanitizePdfText(tx.counterparty, 34),
        sanitizePdfText(`${tx.paymentMode}${tx.refNo ? ' / ' + tx.refNo : ''}`, 24),
        sanitizePdfText(tx.narration, 65),
        formatRs(tx.credit),
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 7.6,
        cellPadding: 2.3,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
      },
      headStyles: {
        fillColor: SLATE_DEEP,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 36 },
        2: { cellWidth: 28 },
        3: { cellWidth: 66 },
        4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
    });
    cursorY = getLastTableY(doc, cursorY + 25) + 9;
  }

  // 2B. High-Value Debits
  if (cursorY > pageHeight - 45) {
    doc.addPage();
    cursorY = 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE_DEEP);
  doc.text('2B. High-Value Debits (Large Outflows)', 14, cursorY);
  cursorY += 2.5;

  if (highValueDebits.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'grid',
      body: [[`No debit entries >= ${formatRs(thresholdAmount, false)} found in statement.`]],
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        cellPadding: 3,
        fillColor: LIGHT_SLATE_BG,
        textColor: TEXT_SECONDARY,
      },
    });
    cursorY = getLastTableY(doc, cursorY + 12) + 8;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [['Date', 'Beneficiary / Payee', 'Mode / Ref No', 'Narration', 'Debit Amount']],
      body: highValueDebits.map((tx) => [
        tx.date,
        sanitizePdfText(tx.counterparty, 34),
        sanitizePdfText(`${tx.paymentMode}${tx.refNo ? ' / ' + tx.refNo : ''}`, 24),
        sanitizePdfText(tx.narration, 65),
        formatRs(tx.debit),
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 7.6,
        cellPadding: 2.3,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
      },
      headStyles: {
        fillColor: SLATE_DEEP,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 36 },
        2: { cellWidth: 28 },
        3: { cellWidth: 66 },
        4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
    });
    cursorY = getLastTableY(doc, cursorY + 25) + 10;
  }

  // =========================================================================
  // SECTION 3: ISSUED & CLEARED CHEQUE REGISTER
  // =========================================================================
  if (cursorY > pageHeight - 55) {
    doc.addPage();
    cursorY = 18;
  }
  cursorY = drawSectionHeading(
    doc,
    'SECTION 3',
    'Issued & Cleared Cheque Audit Register',
    `${clearedCheques.length} cleared cheques | Total Cleared Value: ${formatRs(clearedChequeTotal)}`,
    cursorY,
  );

  if (clearedCheques.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'grid',
      body: [['No cleared debit cheque instruments were detected in this statement.']],
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        cellPadding: 3.5,
        fillColor: LIGHT_SLATE_BG,
        textColor: TEXT_SECONDARY,
      },
    });
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [['Cleared Date', 'Cheque No', 'Payee / Beneficiary', 'Clearing Category', 'Cleared Amount']],
      body: [
        ...clearedCheques.map((tx) => [
          tx.date,
          sanitizePdfText(tx.chequeNumber || tx.refNo || '-', 16),
          sanitizePdfText(tx.chequePayee || tx.counterparty, 48),
          sanitizePdfText(tx.chequeCategory || 'Outstation / Local Clearing', 30),
          formatRs(tx.debit),
        ]),
        [
          {
            content: `Total Cleared Cheques (${clearedCheques.length})`,
            colSpan: 4,
            styles: { fontStyle: 'bold', fillColor: LIGHT_BLUE_BG },
          },
          {
            content: formatRs(clearedChequeTotal),
            styles: { fontStyle: 'bold', halign: 'right', fillColor: LIGHT_BLUE_BG },
          },
        ],
      ],
      styles: {
        font: 'helvetica',
        fontSize: 7.8,
        cellPadding: 2.5,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
      },
      headStyles: {
        fillColor: COBALT_BLUE,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 24 },
        2: { cellWidth: 62 },
        3: { cellWidth: 40 },
        4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
    });
    cursorY = getLastTableY(doc, cursorY + 25) + 10;
  }

  // =========================================================================
  // SECTION 4: CHEQUE BOUNCE & NACH / ECS RETURN TRACKER
  // =========================================================================
  cursorY = getLastTableY(doc, cursorY) + 10;
  if (cursorY > pageHeight - 55) {
    doc.addPage();
    cursorY = 18;
  }
  const {
    bounceReturns,
    circularTransactions,
    abbMatrix,
    cashAnalytics,
    statutoryExpenses,
    concentration,
  } = underwriting;

  cursorY = drawSectionHeading(
    doc,
    'SECTION 4',
    'Cheque Bounce & NACH / ECS Return Tracker',
    `Outward Returns: ${bounceReturns.outwardCount} | Inward Returns: ${bounceReturns.inwardCount} | Bounced Value: ${formatRs(bounceReturns.totalBouncedValue)} | Penalty Charges: ${formatRs(bounceReturns.totalPenaltyCharges)}`,
    cursorY,
  );

  if (bounceReturns.instruments.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'grid',
      body: [['Clean Conduct: Zero dishonoured cheques, NACH/ECS returns, or bounce penalty charges detected.']],
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        cellPadding: 3.5,
        fillColor: LIGHT_SLATE_BG,
        textColor: GREEN_MATCHED,
      },
    });
    cursorY = getLastTableY(doc, cursorY + 12) + 9;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [['Date', 'Direction', 'Instrument', 'Ref / Chq No', 'Reason & Narration', 'Amount']],
      body: bounceReturns.instruments.map((inst) => [
        inst.transaction.date,
        inst.direction,
        inst.instrumentType,
        sanitizePdfText(inst.instrumentRef, 18),
        sanitizePdfText(`${inst.reasonHint} - ${inst.transaction.narration}`, 60),
        formatRs(inst.amount),
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 7.6,
        cellPadding: 2.3,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
      },
      headStyles: {
        fillColor: RED_MISMATCH,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 30, fontStyle: 'bold' },
        2: { cellWidth: 28 },
        3: { cellWidth: 22 },
        4: { cellWidth: 52 },
        5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      },
    });
    cursorY = getLastTableY(doc, cursorY + 25) + 9;
  }

  // =========================================================================
  // SECTION 5: CIRCULAR / ROUND-TRIPPING TRANSACTION DETECTOR
  // =========================================================================
  if (cursorY > pageHeight - 55) {
    doc.addPage();
    cursorY = 18;
  }
  cursorY = drawSectionHeading(
    doc,
    'SECTION 5',
    'Circular / Round-Tripping Transaction Detector',
    `Flagged Pairs: ${circularTransactions.pairCount} | Total Suspected Rotated Volume: ${formatRs(circularTransactions.totalRotatedAmount)}`,
    cursorY,
  );

  if (circularTransactions.pairs.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'grid',
      body: [['No 1-to-3 day circular round-tripping or accommodation credit-debit pairs detected.']],
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        cellPadding: 3.5,
        fillColor: LIGHT_SLATE_BG,
        textColor: GREEN_MATCHED,
      },
    });
    cursorY = getLastTableY(doc, cursorY + 12) + 9;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [['Counterparty / Match', 'Credit Inflow', 'Debit Outflow', 'Gap', 'Flag']],
      body: circularTransactions.pairs.map((pair) => [
        sanitizePdfText(`${pair.counterpartyName} (${pair.amountMatchType})`, 36),
        `${pair.creditTx.date}\n+${formatRs(pair.creditTx.credit)}`,
        `${pair.debitTx.date}\n-${formatRs(pair.debitTx.debit)}`,
        pair.daysApart === 0 ? 'Same Day' : `${pair.daysApart}d`,
        'Suspected Fund Rotation / Accommodation Entry',
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: 2.3,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
      },
      headStyles: {
        fillColor: AMBER_WARNING,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: 'bold' },
        1: { cellWidth: 34 },
        2: { cellWidth: 34 },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 56 },
      },
    });
    cursorY = getLastTableY(doc, cursorY + 25) + 9;
  }

  // =========================================================================
  // SECTION 6: MONTH-WISE TURNOVER & AVERAGE BANK BALANCE (ABB) MATRIX
  // =========================================================================
  if (cursorY > pageHeight - 60) {
    doc.addPage();
    cursorY = 18;
  }
  cursorY = drawSectionHeading(
    doc,
    'SECTION 6',
    'Month-Wise Turnover & Average Bank Balance (ABB) Matrix',
    `Overall Daily ABB: ${abbMatrix.overallAbb !== null ? formatRs(abbMatrix.overallAbb) : 'N/A'} | Business Credits: ${formatRs(abbMatrix.totalBusinessCredits)} | Non-Business Credits: ${formatRs(abbMatrix.totalNonBusinessCredits)}`,
    cursorY,
  );

  autoTable(doc, {
    startY: cursorY,
    margin: { left: 14, right: 14, bottom: 20 },
    theme: 'striped',
    showHead: 'everyPage',
    head: [
      [
        'Month',
        'Opening',
        'Bus. Credits',
        'Non-Bus Cr',
        'Total Debits',
        'Closing',
        'Min Bal',
        'Max Bal',
        'Calc. ABB',
      ],
    ],
    body: abbMatrix.months.map((m) => [
      m.monthLabel,
      m.openingBalance !== null ? formatRs(m.openingBalance, false) : 'N/A',
      formatRs(m.businessCredits, false),
      formatRs(m.nonBusinessCredits, false),
      formatRs(m.totalDebits, false),
      m.closingBalance !== null ? formatRs(m.closingBalance, false) : 'N/A',
      m.minBalance !== null ? formatRs(m.minBalance, false) : 'N/A',
      m.maxBalance !== null ? formatRs(m.maxBalance, false) : 'N/A',
      m.abb !== null ? formatRs(m.abb, false) : 'N/A',
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 2,
      lineColor: BORDER_SLATE,
      lineWidth: 0.15,
      textColor: TEXT_PRIMARY,
    },
    headStyles: {
      fillColor: SLATE_DEEP,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 18, fontStyle: 'bold' },
      1: { cellWidth: 20, halign: 'right' },
      2: { cellWidth: 21, halign: 'right' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 21, halign: 'right' },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 20, halign: 'right' },
      7: { cellWidth: 20, halign: 'right' },
      8: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
    },
  });
  cursorY = getLastTableY(doc, cursorY + 25) + 9;

  // =========================================================================
  // SECTION 7: CASH DEPOSIT & WITHDRAWAL ANALYTICS
  // =========================================================================
  if (cursorY > pageHeight - 55) {
    doc.addPage();
    cursorY = 18;
  }
  cursorY = drawSectionHeading(
    doc,
    'SECTION 7',
    'Cash Deposit & Self/Cash Withdrawal Analytics',
    `Total Banking Turnover: ${formatRs(cashAnalytics.totalBankingTurnover)} | Combined Cash Intensity: ${cashAnalytics.combinedCashTurnoverPct}%`,
    cursorY,
  );

  autoTable(doc, {
    startY: cursorY,
    margin: { left: 14, right: 14, bottom: 20 },
    theme: 'grid',
    head: [['Cash Component', 'Count', 'Total Amount', '% of Banking Turnover', 'Directional Share']],
    body: [
      [
        'Cash Deposits (CDM / Branch Cash)',
        String(cashAnalytics.depositCount),
        formatRs(cashAnalytics.totalCashDeposits),
        `${cashAnalytics.depositShareOfTurnoverPct}%`,
        `${cashAnalytics.depositShareOfCreditsPct}% of total credits`,
      ],
      [
        'Cash / Self Cheque / ATM Withdrawals',
        String(cashAnalytics.withdrawalCount),
        formatRs(cashAnalytics.totalCashWithdrawals),
        `${cashAnalytics.withdrawalShareOfTurnoverPct}%`,
        `${cashAnalytics.withdrawalShareOfDebitsPct}% of total debits`,
      ],
      [
        { content: 'Combined Cash Activity', styles: { fontStyle: 'bold', fillColor: LIGHT_BLUE_BG } },
        {
          content: String(cashAnalytics.depositCount + cashAnalytics.withdrawalCount),
          styles: { fontStyle: 'bold', fillColor: LIGHT_BLUE_BG },
        },
        {
          content: formatRs(cashAnalytics.totalCashDeposits + cashAnalytics.totalCashWithdrawals),
          styles: { fontStyle: 'bold', halign: 'right', fillColor: LIGHT_BLUE_BG },
        },
        {
          content: `${cashAnalytics.combinedCashTurnoverPct}%`,
          styles: { fontStyle: 'bold', halign: 'right', fillColor: LIGHT_BLUE_BG },
        },
        {
          content: cashAnalytics.combinedCashTurnoverPct > 30 ? 'Elevated (>30%)' : 'Normal Norms',
          styles: { fontStyle: 'bold', fillColor: LIGHT_BLUE_BG },
        },
      ],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      lineColor: BORDER_SLATE,
      lineWidth: 0.15,
      textColor: TEXT_PRIMARY,
    },
    headStyles: {
      fillColor: COBALT_BLUE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 56 },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 34, halign: 'right' },
      3: { cellWidth: 34, halign: 'right' },
      4: { cellWidth: 40 },
    },
  });
  cursorY = getLastTableY(doc, cursorY + 25) + 9;

  // =========================================================================
  // SECTION 8: STATUTORY & OPERATIONAL EXPENSE VERIFICATION
  // =========================================================================
  if (cursorY > pageHeight - 55) {
    doc.addPage();
    cursorY = 18;
  }
  cursorY = drawSectionHeading(
    doc,
    'SECTION 8',
    'Statutory & Operational Expense Verification',
    `Verified Outflow: ${formatRs(statutoryExpenses.totalStatutoryAndOpexPaid)} across ${statutoryExpenses.activeCategoriesCount} active categories (${statutoryExpenses.totalCount} payments)`,
    cursorY,
  );

  autoTable(doc, {
    startY: cursorY,
    margin: { left: 14, right: 14, bottom: 20 },
    theme: 'striped',
    showHead: 'everyPage',
    head: [['Category', 'Description', 'Payments', 'Last Paid Date', 'Total Amount Paid']],
    body: [
      ...statutoryExpenses.byCategory.map((c) => [
        c.category,
        c.label,
        String(c.count),
        c.lastPaidDate || 'None Observed',
        formatRs(c.totalPaid),
      ]),
      [
        {
          content: 'Total Statutory & Operational Payments',
          colSpan: 4,
          styles: { fontStyle: 'bold', fillColor: LIGHT_BLUE_BG },
        },
        {
          content: formatRs(statutoryExpenses.totalStatutoryAndOpexPaid),
          styles: { fontStyle: 'bold', halign: 'right', fillColor: LIGHT_BLUE_BG },
        },
      ],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 7.8,
      cellPadding: 2.3,
      lineColor: BORDER_SLATE,
      lineWidth: 0.15,
      textColor: TEXT_PRIMARY,
    },
    headStyles: {
      fillColor: SLATE_DEEP,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' },
      1: { cellWidth: 64 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 32 },
      4: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
    },
  });
  cursorY = getLastTableY(doc, cursorY + 25) + 9;

  // =========================================================================
  // SECTION 9: TOP 10 BUYERS & TOP 10 SUPPLIERS CONCENTRATION
  // =========================================================================
  if (cursorY > pageHeight - 60) {
    doc.addPage();
    cursorY = 18;
  }
  cursorY = drawSectionHeading(
    doc,
    'SECTION 9',
    'Top 10 Buyers (Credit Concentration) & Top 10 Suppliers (Debit Concentration)',
    `Top 10 Buyers Share: ${concentration.topBuyersConcentrationPct}% of Credits | Top 10 Suppliers Share: ${concentration.topSuppliersConcentrationPct}% of Debits`,
    cursorY,
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE_DEEP);
  doc.text('9A. Top 10 Buyers (Inflow Concentration)', 14, cursorY);
  cursorY += 2.5;

  if (concentration.topBuyers.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'grid',
      body: [['No identifiable buyer credit counterparties found.']],
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, fillColor: LIGHT_SLATE_BG },
    });
    cursorY = getLastTableY(doc, cursorY + 12) + 8;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [['Rank', 'Buyer / Remitter Name', 'Txns', 'Latest Date', 'Total Credits', '% Share']],
      body: concentration.topBuyers.map((p) => [
        `#${p.rank}`,
        sanitizePdfText(p.partyName, 44),
        String(p.txCount),
        p.latestDate,
        formatRs(p.totalAmount),
        `${p.sharePct}%`,
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 7.6,
        cellPadding: 2.2,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
      },
      headStyles: {
        fillColor: GREEN_MATCHED,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 74, fontStyle: 'bold' },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 24 },
        4: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 20, halign: 'right' },
      },
    });
    cursorY = getLastTableY(doc, cursorY + 25) + 9;
  }

  if (cursorY > pageHeight - 50) {
    doc.addPage();
    cursorY = 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE_DEEP);
  doc.text('9B. Top 10 Suppliers (Outflow Concentration)', 14, cursorY);
  cursorY += 2.5;

  if (concentration.topSuppliers.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'grid',
      body: [['No identifiable supplier debit counterparties found.']],
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, fillColor: LIGHT_SLATE_BG },
    });
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 20 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [['Rank', 'Supplier / Payee Name', 'Txns', 'Latest Date', 'Total Debits', '% Share']],
      body: concentration.topSuppliers.map((p) => [
        `#${p.rank}`,
        sanitizePdfText(p.partyName, 44),
        String(p.txCount),
        p.latestDate,
        formatRs(p.totalAmount),
        `${p.sharePct}%`,
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 7.6,
        cellPadding: 2.2,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
      },
      headStyles: {
        fillColor: COBALT_BLUE,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 74, fontStyle: 'bold' },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 24 },
        4: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 20, halign: 'right' },
      },
    });
  }

  // =========================================================================
  // GLOBAL HEADER (Pages 2+) & FOOTER (All Pages)
  // =========================================================================
  const totalPages = doc.getNumberOfPages();
  const runningHeader = sanitizePdfText(
    `${metadata.detectedBank}${metadata.accountNumber ? ` | A/C ${metadata.accountNumber}` : ''} - Statement Inspection Report`,
    95,
  );

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    if (p > 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...TEXT_SECONDARY);
      doc.text(runningHeader, 14, 10);
      doc.setDrawColor(...BORDER_SLATE);
      doc.line(14, 12, pageWidth - 14, 12);
    }

    // Footer on every page
    doc.setDrawColor(...BORDER_SLATE);
    doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text('Generated by Corporate Statement Inspector', 14, pageHeight - 8);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }

  return doc;
}

export function exportInspectionPdfReport(
  statement: AnalyzedStatement,
  loanSummary: LoanAnalysisSummary,
  thresholdAmount: number,
  underwriting: CreditUnderwritingReport,
): void {
  const doc = buildInspectionPdfDocument(statement, loanSummary, thresholdAmount, underwriting);
  const safeBank = statement.metadata.detectedBank
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Bank';
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`Corporate_Inspection_Report_${safeBank}_${stamp}.pdf`);
}

export function buildCleanInspectionPdfDocument(
  statement: AnalyzedStatement,
  loanSummary: LoanAnalysisSummary,
  thresholdAmount: number,
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  }) as JsPdfWithAutoTable;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const { metadata, integrity, transactions } = statement;

  const generatedStamp = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Header Banner
  doc.setFillColor(...SLATE_DEEP);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(...COBALT_BLUE);
  doc.rect(0, 28, pageWidth, 1.4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(255, 255, 255);
  doc.text('STATEMENT INSPECTION & LOAN AUDIT REPORT', 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    sanitizePdfText(
      `${metadata.detectedBank}${metadata.accountHolderName ? ` | ${metadata.accountHolderName}` : ''}${metadata.accountNumber ? ` | A/C ${metadata.accountNumber}` : ''} | Generated: ${generatedStamp}`,
      125,
    ),
    14,
    20,
  );

  let cursorY = 36;

  // 1. Summary KPIs
  const hvCredits = transactions
    .filter((t) => t.credit >= thresholdAmount)
    .sort((a, b) => b.credit - a.credit);
  const hvDebits = transactions
    .filter((t) => t.debit >= thresholdAmount)
    .sort((a, b) => b.debit - a.debit);
  const clearedCheques = transactions.filter((t) => t.isChequeCleared);
  const clearedChequeTotal = clearedCheques.reduce((s, t) => s + t.debit, 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text('1. EXECUTIVE SUMMARY KPIs', 14, cursorY);
  cursorY += 3;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: 14, right: 14, bottom: 18 },
    theme: 'grid',
    head: [['Metric', 'Value', 'Metric', 'Value']],
    body: [
      [
        `Total Credits (${integrity.creditCount} txns)`,
        formatRs(integrity.totalCredits),
        `Total Debits (${integrity.debitCount} txns)`,
        formatRs(integrity.totalDebits),
      ],
      [
        'Closing Balance',
        integrity.closingBalance !== null ? formatRs(integrity.closingBalance) : 'N/A',
        `High-Value Count (>= ${formatRs(thresholdAmount, false)})`,
        `${hvCredits.length + hvDebits.length} txns (${hvCredits.length} Cr / ${hvDebits.length} Dr)`,
      ],
      [
        `Cleared Cheques Total (${clearedCheques.length})`,
        formatRs(clearedChequeTotal),
        `Traced Loans Total (${loanSummary.totalDetectedLoansCount})`,
        formatRs(loanSummary.totalDetectedDebtExposure),
      ],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 8.2,
      cellPadding: 3,
      lineColor: BORDER_SLATE,
      lineWidth: 0.2,
      textColor: TEXT_PRIMARY,
    },
    headStyles: {
      fillColor: SLATE_DEEP,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: LIGHT_SLATE_BG, cellWidth: 46 },
      1: { cellWidth: 45 },
      2: { fontStyle: 'bold', fillColor: LIGHT_SLATE_BG, cellWidth: 46 },
      3: { cellWidth: 45 },
    },
  });

  cursorY = getLastTableY(doc, cursorY + 35) + 9;

  // 2. Traced Outside Loans & Private Due Payments Table
  cursorY = drawSectionHeading(
    doc,
    '2',
    'Traced Outside Loans & Private Due-Payment Schedule',
    `Bank/NBFC Loans: ${loanSummary.institutionalLoanCount} (${formatRs(loanSummary.institutionalEmiOutflow)}) | Private/Associate Chains: ${loanSummary.tracedPrivateCount} (${formatRs(loanSummary.tracedPrivatePrincipal)})`,
    cursorY,
  );

  const combinedLoanRows: Array<Array<string>> = [];

  for (const chain of loanSummary.tracedLoanChains) {
    const duesStr = chain.subsequentDebits
      .slice(0, 5)
      .map((d) => {
        const mode = d.transaction.isChequeCleared
          ? `Chq #${d.transaction.chequeNumber || d.transaction.refNo}`
          : d.transaction.paymentMode;
        return `${d.transaction.date} (${mode}): ${formatRs(d.transaction.debit)}`;
      })
      .join('\n');
    const extra =
      chain.subsequentDebits.length > 5
        ? `\n+${chain.subsequentDebits.length - 5} more debits`
        : '';

    combinedLoanRows.push([
      sanitizePdfText(chain.lenderPartyName, 36),
      `${formatRs(chain.principalReceived)}\n(${chain.initialCreditDate})`,
      `${duesStr}${extra}`,
      formatRs(chain.totalRepaid),
      formatRs(chain.netOutstandingBalance),
      'Suspected Private / Associate Loan',
    ]);
  }

  for (const grp of loanSummary.institutionalLoans) {
    const duesStr = grp.transactions
      .slice(0, 5)
      .map((t) => `${t.date}: ${formatRs(t.debit)}`)
      .join('\n');
    const extra =
      grp.transactions.length > 5
        ? `\n+${grp.transactions.length - 5} more EMIs`
        : '';

    combinedLoanRows.push([
      sanitizePdfText(grp.lenderName, 36),
      'Mandate / Pre-Period',
      `${duesStr}${extra}`,
      formatRs(grp.totalOutflow),
      'Recurring EMI',
      'Bank/NBFC Loan',
    ]);
  }

  if (combinedLoanRows.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 18 },
      theme: 'grid',
      body: [['No Bank/NBFC loan EMIs or traced Private/Associate borrowing chains detected.']],
      styles: { font: 'helvetica', fontSize: 8.2, cellPadding: 3.5, fillColor: LIGHT_SLATE_BG },
    });
    cursorY = getLastTableY(doc, cursorY + 12) + 9;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 18 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [
        [
          'Lender / Party Name',
          'Initial Credit Received',
          'Followed-Up Subsequent Debits / Dues Paid',
          'Total Repaid',
          'Net Balance',
          'Tag',
        ],
      ],
      body: combinedLoanRows,
      styles: {
        font: 'helvetica',
        fontSize: 7.4,
        cellPadding: 2.3,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
        valign: 'top',
      },
      headStyles: {
        fillColor: COBALT_BLUE,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 30, fontStyle: 'bold' },
        1: { cellWidth: 27 },
        2: { cellWidth: 53 },
        3: { cellWidth: 23, halign: 'right' },
        4: { cellWidth: 23, halign: 'right' },
        5: { cellWidth: 26 },
      },
    });
    cursorY = getLastTableY(doc, cursorY + 25) + 9;
  }

  // 3. High-Value Credits & High-Value Debits Tables
  if (cursorY > pageHeight - 55) {
    doc.addPage();
    cursorY = 18;
  }
  cursorY = drawSectionHeading(
    doc,
    '3',
    `High-Value Credits & Debits (>= ${formatRs(thresholdAmount, false)})`,
    `${hvCredits.length} High-Value Credits | ${hvDebits.length} High-Value Debits`,
    cursorY,
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.2);
  doc.setTextColor(...SLATE_DEEP);
  doc.text('3A. High-Value Credits (Large Receipts)', 14, cursorY);
  cursorY += 2.5;

  if (hvCredits.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 18 },
      theme: 'grid',
      body: [[`No credit receipts >= ${formatRs(thresholdAmount, false)}.`]],
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, fillColor: LIGHT_SLATE_BG },
    });
    cursorY = getLastTableY(doc, cursorY + 12) + 8;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 18 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [['Date', 'Sender / Source Name', 'Ref No', 'Credit Amount']],
      body: hvCredits.map((tx) => [
        tx.date,
        sanitizePdfText(tx.counterparty, 54),
        sanitizePdfText(tx.refNo || '-', 24),
        formatRs(tx.credit),
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 7.8,
        cellPadding: 2.3,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
      },
      headStyles: {
        fillColor: SLATE_DEEP,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 90, fontStyle: 'bold' },
        2: { cellWidth: 34 },
        3: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
      },
    });
    cursorY = getLastTableY(doc, cursorY + 25) + 9;
  }

  if (cursorY > pageHeight - 50) {
    doc.addPage();
    cursorY = 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.2);
  doc.setTextColor(...SLATE_DEEP);
  doc.text('3B. High-Value Debits (Large Payments)', 14, cursorY);
  cursorY += 2.5;

  if (hvDebits.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 18 },
      theme: 'grid',
      body: [[`No debit payments >= ${formatRs(thresholdAmount, false)}.`]],
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, fillColor: LIGHT_SLATE_BG },
    });
    cursorY = getLastTableY(doc, cursorY + 12) + 8;
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 18 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [['Date', 'Beneficiary / Payee Name', 'Payment Mode', 'Ref No', 'Debit Amount']],
      body: hvDebits.map((tx) => [
        tx.date,
        sanitizePdfText(tx.counterparty, 48),
        tx.paymentMode,
        sanitizePdfText(tx.refNo || '-', 22),
        formatRs(tx.debit),
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 7.8,
        cellPadding: 2.3,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
      },
      headStyles: {
        fillColor: SLATE_DEEP,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 74, fontStyle: 'bold' },
        2: { cellWidth: 24 },
        3: { cellWidth: 28 },
        4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
    });
    cursorY = getLastTableY(doc, cursorY + 25) + 9;
  }

  // 4. Issued & Cleared Cheque Register Table
  if (cursorY > pageHeight - 55) {
    doc.addPage();
    cursorY = 18;
  }
  cursorY = drawSectionHeading(
    doc,
    '4',
    'Issued & Cleared Cheque Register',
    `${clearedCheques.length} passed cheques | Total Cleared Value: ${formatRs(clearedChequeTotal)}`,
    cursorY,
  );

  if (clearedCheques.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 18 },
      theme: 'grid',
      body: [['No cleared cheque debit entries detected in this statement.']],
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, fillColor: LIGHT_SLATE_BG },
    });
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 14, right: 14, bottom: 18 },
      theme: 'striped',
      showHead: 'everyPage',
      head: [['Cleared Date', 'Cheque Number', 'Cleaned Payee / Beneficiary Name', 'Cheque Amount']],
      body: [
        ...clearedCheques.map((tx) => [
          tx.date,
          sanitizePdfText(tx.chequeNumber || tx.refNo || '-', 18),
          sanitizePdfText(tx.chequePayee || tx.counterparty, 62),
          formatRs(tx.debit),
        ]),
        [
          {
            content: `Total Cleared Cheques (${clearedCheques.length})`,
            colSpan: 3,
            styles: { fontStyle: 'bold', fillColor: LIGHT_BLUE_BG },
          },
          {
            content: formatRs(clearedChequeTotal),
            styles: { fontStyle: 'bold', halign: 'right', fillColor: LIGHT_BLUE_BG },
          },
        ],
      ],
      styles: {
        font: 'helvetica',
        fontSize: 7.8,
        cellPadding: 2.3,
        lineColor: BORDER_SLATE,
        lineWidth: 0.15,
        textColor: TEXT_PRIMARY,
      },
      headStyles: {
        fillColor: COBALT_BLUE,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 30, fontStyle: 'bold' },
        2: { cellWidth: 92 },
        3: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
      },
    });
  }

  // Page numbers (Page X of Y) + Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...BORDER_SLATE);
    doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text('Generated by Corporate Statement Inspector', 14, pageHeight - 8);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }

  return doc;
}

export function exportCleanInspectionPdf(
  statement: AnalyzedStatement,
  loanSummary: LoanAnalysisSummary,
  thresholdAmount: number,
): void {
  const doc = buildCleanInspectionPdfDocument(statement, loanSummary, thresholdAmount);
  const safeBank = statement.metadata.detectedBank
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Bank';
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`Statement_Inspection_Loan_Audit_${safeBank}_${stamp}.pdf`);
}
