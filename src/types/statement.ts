export type FileFormat = 'CSV' | 'EXCEL' | 'PDF';

export type ColumnRole =
  | 'date'
  | 'valueDate'
  | 'narration'
  | 'refNo'
  | 'debit'
  | 'credit'
  | 'amount'
  | 'drcr'
  | 'balance'
  | 'ignore';

export type AuditStatus =
  | 'none'
  | 'verified'
  | 'needs_clarification'
  | 'capital_expense'
  | 'high_priority';

export type PaymentMode =
  | 'RTGS'
  | 'NEFT'
  | 'IMPS'
  | 'UPI'
  | 'CHEQUE'
  | 'CASH'
  | 'FT'
  | 'CHARGES'
  | 'OTHER';

export type ChequeCategory =
  | 'Outstation / Local Clearing'
  | 'Self / Cash Withdrawal'
  | 'Intra-Bank Transfer';

export interface ColumnMapping {
  headerRowIndex: number;
  headers: string[];
  roles: ColumnRole[];
}

export interface PdfRowMoneyHint {
  rowIndex: number; // 0-based index inside ParsedWorkbookRaw.rows
  debitStr: string;
  creditStr: string;
  balanceStr: string;
  debitVal: number;
  creditVal: number;
  pendingVal: number;
  pendingIndicator: 'DR' | 'CR' | null;
  balanceVal: number | null;
  xMatchedPolarity: 'DR' | 'CR' | null;
}

export interface ParsedWorkbookRaw {
  rows: string[][];
  preambleText: string;
  fileName: string;
  fileType: FileFormat;
  fileSizeBytes: number;
  pdfMoneyHints?: Record<number, PdfRowMoneyHint>;
}

export interface TransactionDebugInfo {
  rawRowText: string;
  rawDebitStr: string;
  rawCreditStr: string;
  rawBalanceStr: string;
  classificationMethod: string;
  autoCorrectedSwap: boolean;
}

export interface NormalizedTransaction {
  id: string;
  rowIndex: number;
  date: string;
  isoDate: string;
  valueDate: string;
  narration: string;
  refNo: string;
  debit: number;
  credit: number;
  balance: number | null;
  paymentMode: PaymentMode;
  counterparty: string;
  isChequeCleared: boolean;
  chequeNumber: string | null;
  chequePayee: string | null;
  chequeCategory: ChequeCategory | null;
  auditStatus: AuditStatus;
  auditNote: string;
  rawMergedRows: number;
  hasBalanceDiscrepancy: boolean;
  debugInfo: TransactionDebugInfo;
}

export interface StatementMetadata {
  fileName: string;
  fileType: FileFormat;
  fileSizeBytes: number;
  detectedBank: string;
  accountHolderName: string | null;
  accountNumber: string | null;
  statementPeriod: string | null;
  headerRowIndex: number;
  totalRawRows: number;
  mergedContinuationRows: number;
  sortOrder: 'ascending' | 'descending';
}

export interface IntegrityReport {
  openingBalance: number | null;
  openingBalanceSource: 'explicit' | 'derived' | 'unavailable';
  closingBalance: number | null;
  computedClosingBalance: number | null;
  totalCredits: number;
  totalDebits: number;
  creditCount: number;
  debitCount: number;
  netCashFlow: number;
  discrepancy: number | null;
  status: 'verified' | 'discrepancy' | 'unverifiable';
  discrepancyRowIds: string[];
}

export type LoanRiskClassification =
  | 'Confirmed Bank/NBFC Loan'
  | 'Suspected Private Loan (Recurring Dues)'
  | 'Associate / Enterprise Fund Rotation';

export interface InstitutionalLoanGroup {
  id: string;
  lenderName: string;
  normalizedKey: string;
  emiFrequency: number;
  averageDueAmount: number;
  totalOutflow: number;
  firstDebitDate: string;
  lastDebitDate: string;
  riskTag: LoanRiskClassification;
  matchedKeywords: string[];
  transactions: NormalizedTransaction[];
}

export interface TracedDueDebit {
  transaction: NormalizedTransaction;
  matchScore: number;
  matchReason: string;
}

export interface TracedLoanChain {
  id: string;
  lenderPartyName: string;
  normalizedEntityKey: string;
  initialCreditDate: string;
  principalReceived: number;
  creditTransactions: NormalizedTransaction[];
  subsequentDebits: TracedDueDebit[];
  totalRepaid: number;
  netOutstandingBalance: number;
  riskClassification: LoanRiskClassification;
}

export interface LoanAnalysisSummary {
  institutionalLoans: InstitutionalLoanGroup[];
  tracedLoanChains: TracedLoanChain[];
  institutionalLoanCount: number;
  institutionalEmiOutflow: number;
  tracedPrivateCount: number;
  tracedPrivatePrincipal: number;
  tracedPrivateRepaid: number;
  tracedPrivateNetOutstanding: number;
  totalDetectedLoansCount: number;
  totalDetectedDebtExposure: number;
  totalRecurringAndRepaidOutflow: number;
}

export type ReturnDirection =
  | 'Inward Return'
  | 'Outward Return'
  | 'Return Penalty Charge';

export interface DishonouredInstrument {
  id: string;
  transaction: NormalizedTransaction;
  direction: ReturnDirection;
  instrumentType: 'Cheque' | 'NACH / ECS / ACH' | 'Return Charge';
  instrumentRef: string;
  amount: number;
  reasonHint: string;
}

export interface BounceReturnSummary {
  inwardCount: number;
  outwardCount: number;
  chargeCount: number;
  totalBounceCount: number;
  totalBouncedValue: number;
  totalPenaltyCharges: number;
  bounceRatePct: number;
  instruments: DishonouredInstrument[];
}

export interface CircularPair {
  id: string;
  creditTx: NormalizedTransaction;
  debitTx: NormalizedTransaction;
  daysApart: number;
  amountMatchType: 'Exact Amount' | 'Near Amount' | 'Counterparty Match';
  counterpartySimilarity: number;
  counterpartyName: string;
  amountInvolved: number;
  flagLabel: 'Suspected Fund Rotation / Accommodation Entry';
}

export interface CircularDetectionSummary {
  pairCount: number;
  totalRotatedAmount: number;
  pairs: CircularPair[];
}

export interface MonthlyTurnoverRow {
  monthKey: string;
  monthLabel: string;
  openingBalance: number | null;
  totalCredits: number;
  businessCredits: number;
  nonBusinessCredits: number;
  totalDebits: number;
  closingBalance: number | null;
  minBalance: number | null;
  maxBalance: number | null;
  abb: number | null;
  txCount: number;
}

export interface AbbSummary {
  months: MonthlyTurnoverRow[];
  overallAbb: number | null;
  minObservedBalance: number | null;
  maxObservedBalance: number | null;
  totalBusinessCredits: number;
  totalNonBusinessCredits: number;
}

export interface CashAnalyticsSummary {
  depositCount: number;
  totalCashDeposits: number;
  depositShareOfTurnoverPct: number;
  depositShareOfCreditsPct: number;
  withdrawalCount: number;
  totalCashWithdrawals: number;
  withdrawalShareOfTurnoverPct: number;
  withdrawalShareOfDebitsPct: number;
  combinedCashTurnoverPct: number;
  totalBankingTurnover: number;
  cashDeposits: NormalizedTransaction[];
  cashWithdrawals: NormalizedTransaction[];
}

export type StatutoryCategory =
  | 'GST'
  | 'INCOME TAX'
  | 'TDS'
  | 'EPF'
  | 'ESIC'
  | 'ELECTRICITY'
  | 'RENT';

export interface StatutoryExpenseItem {
  id: string;
  category: StatutoryCategory;
  transaction: NormalizedTransaction;
  amount: number;
  date: string;
}

export interface StatutoryCategorySummary {
  category: StatutoryCategory;
  label: string;
  count: number;
  totalPaid: number;
  lastPaidDate: string | null;
}

export interface StatutoryExpenseSummary {
  totalStatutoryAndOpexPaid: number;
  totalCount: number;
  activeCategoriesCount: number;
  byCategory: StatutoryCategorySummary[];
  items: StatutoryExpenseItem[];
}

export interface ConcentrationParty {
  rank: number;
  partyName: string;
  normalizedKey: string;
  txCount: number;
  totalAmount: number;
  sharePct: number;
  latestDate: string;
  transactions: NormalizedTransaction[];
}

export interface ConcentrationSummary {
  topBuyers: ConcentrationParty[];
  topSuppliers: ConcentrationParty[];
  topBuyersConcentrationPct: number;
  topSuppliersConcentrationPct: number;
}

export type RiskRatingBand =
  | 'Strong Conduct'
  | 'Satisfactory Conduct'
  | 'Moderate Risk — Review'
  | 'High Risk — Caution';

export interface ScoreFactor {
  label: string;
  impact: number;
  status: 'positive' | 'neutral' | 'warning' | 'negative';
  detail: string;
}

export interface CreditRiskAssessment {
  score: number;
  ratingBand: RiskRatingBand;
  factors: ScoreFactor[];
  summaryNote: string;
}

export interface CreditUnderwritingReport {
  bounceReturns: BounceReturnSummary;
  circularTransactions: CircularDetectionSummary;
  abbMatrix: AbbSummary;
  cashAnalytics: CashAnalyticsSummary;
  statutoryExpenses: StatutoryExpenseSummary;
  concentration: ConcentrationSummary;
  riskAssessment: CreditRiskAssessment;
}

export type ForensicVerdict = 'original' | 'modified';

export type ForensicFieldStatus = 'verified' | 'clean' | 'warning' | 'tampered';

export interface ForensicFieldRow {
  field: string;
  rawValue: string;
  xmpValue: string | null;
  ruleChecked: string;
  status: ForensicFieldStatus;
  detail: string;
}

export interface PdfForensicsReport {
  fileName: string;
  fileSizeBytes: number;
  analyzedAtIso: string;
  verdict: ForensicVerdict;
  verdictLabel: 'Original Bank PDF' | 'Modified PDF Warning';
  reasons: string[];
  pdfVersion: string | null;
  eofMarkerCount: number;
  hasDigitalSignature: boolean;
  isEncrypted: boolean;
  producer: string | null;
  creator: string | null;
  creationDateRaw: string | null;
  creationDateFormatted: string | null;
  modDateRaw: string | null;
  modDateFormatted: string | null;
  xmpProducer: string | null;
  xmpCreatorTool: string | null;
  xmpCreateDate: string | null;
  xmpModifyDate: string | null;
  matchedBankingEngine: string | null;
  matchedEditingTools: string[];
  timestampDeltaSeconds: number | null;
  fields: ForensicFieldRow[];
}

export interface AnalyzedStatement {
  raw: ParsedWorkbookRaw;
  mapping: ColumnMapping;
  metadata: StatementMetadata;
  integrity: IntegrityReport;
  transactions: NormalizedTransaction[];
}

export const AUDIT_STATUS_CONFIG: Record<
  AuditStatus,
  { label: string; shortLabel: string; textClass: string; bgClass: string; borderClass: string }
> = {
  none: {
    label: 'Untagged',
    shortLabel: 'Untagged',
    textClass: 'text-[#64748B]',
    bgClass: 'bg-[#F1F5F9]',
    borderClass: 'border-[#E2E8F0]',
  },
  verified: {
    label: 'Verified',
    shortLabel: 'Verified',
    textClass: 'text-[#16A34A]',
    bgClass: 'bg-green-50',
    borderClass: 'border-[#16A34A]/35',
  },
  needs_clarification: {
    label: 'Needs Clarification',
    shortLabel: 'Clarify',
    textClass: 'text-[#D97706]',
    bgClass: 'bg-amber-50',
    borderClass: 'border-[#F59E0B]/45',
  },
  capital_expense: {
    label: 'Capital Expense',
    shortLabel: 'CapEx',
    textClass: 'text-[#2563EB]',
    bgClass: 'bg-[#DBEAFE]/60',
    borderClass: 'border-[#3B82F6]/45',
  },
  high_priority: {
    label: 'High Priority',
    shortLabel: 'Priority',
    textClass: 'text-[#DC2626]',
    bgClass: 'bg-red-50',
    borderClass: 'border-[#DC2626]/35',
  },
};
