import React from 'react';
import type {
  IntegrityReport,
  LoanAnalysisSummary,
  NormalizedTransaction,
} from '../types/statement';
import { formatCompactINR, formatINR } from '../utils/indianFormat';

interface KpiSummaryStripProps {
  integrity: IntegrityReport;
  transactions: NormalizedTransaction[];
  thresholdAmount: number;
  loanSummary: LoanAnalysisSummary;
}

export const KpiSummaryStrip: React.FC<KpiSummaryStripProps> = ({
  integrity,
  transactions,
  thresholdAmount,
  loanSummary,
}) => {
  const highValueTxs = transactions.filter(
    (t) => t.credit >= thresholdAmount || t.debit >= thresholdAmount,
  );
  const hvCredits = highValueTxs.filter((t) => t.credit >= thresholdAmount);
  const hvDebits = highValueTxs.filter((t) => t.debit >= thresholdAmount);
  const hvCombinedVal =
    hvCredits.reduce((s, t) => s + t.credit, 0) + hvDebits.reduce((s, t) => s + t.debit, 0);

  const clearedCheques = transactions.filter((t) => t.isChequeCleared);
  const clearedChequeTotal = clearedCheques.reduce((s, t) => s + t.debit, 0);

  return (
    <section
      aria-label="Executive Audit Summary"
      className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-xs"
    >
      <div className="grid grid-cols-1 gap-px bg-[#E2E8F0] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* 1. Total Credits */}
        <div className="bg-white p-4 sm:p-5">
          <div className="text-xs font-medium text-[#64748B]">Total Credits (Inflow)</div>
          <div className="mt-1.5 font-mono text-lg font-semibold text-[#16A34A] tabular-nums">
            {formatINR(integrity.totalCredits)}
          </div>
          <div className="mt-1.5 text-xs text-[#64748B] tabular-nums">
            {integrity.creditCount} credit transactions
          </div>
        </div>

        {/* 2. Total Debits */}
        <div className="bg-white p-4 sm:p-5">
          <div className="text-xs font-medium text-[#64748B]">Total Debits (Outflow)</div>
          <div className="mt-1.5 font-mono text-lg font-semibold text-[#DC2626] tabular-nums">
            {formatINR(integrity.totalDebits)}
          </div>
          <div className="mt-1.5 text-xs text-[#64748B] tabular-nums">
            {integrity.debitCount} debit transactions
          </div>
        </div>

        {/* 3. Net Cash Flow & Closing Balance */}
        <div className="bg-white p-4 sm:p-5">
          <div className="text-xs font-medium text-[#64748B]">Net Cash Flow & Closing</div>
          <div
            className={`mt-1.5 font-mono text-lg font-semibold tabular-nums ${
              integrity.netCashFlow >= 0 ? 'text-[#0F172A]' : 'text-[#DC2626]'
            }`}
          >
            {integrity.netCashFlow >= 0 ? '+' : ''}
            {formatINR(integrity.netCashFlow)}
          </div>
          <div className="mt-1.5 text-xs text-[#64748B] tabular-nums">
            Closing:{' '}
            <span className="font-mono font-medium text-[#334155]">
              {integrity.closingBalance !== null ? formatINR(integrity.closingBalance) : 'N/A'}
            </span>
          </div>
        </div>

        {/* 4. High-Value Transactions */}
        <div className="bg-white p-4 sm:p-5">
          <div className="text-xs font-medium text-[#64748B]">
            High-Value ({`\u2265 ${formatCompactINR(thresholdAmount)}`})
          </div>
          <div className="mt-1.5 font-mono text-lg font-semibold text-[#1D4ED8] tabular-nums">
            {formatINR(hvCombinedVal)}
          </div>
          <div className="mt-1.5 text-xs text-[#64748B] tabular-nums">
            {hvCredits.length} Cr · {hvDebits.length} Dr ({highValueTxs.length} total)
          </div>
        </div>

        {/* 5. Cleared Cheques Issued */}
        <div className="bg-white p-4 sm:p-5">
          <div className="text-xs font-medium text-[#64748B]">Cleared Cheques Issued</div>
          <div className="mt-1.5 font-mono text-lg font-semibold text-[#0F172A] tabular-nums">
            {formatINR(clearedChequeTotal)}
          </div>
          <div className="mt-1.5 text-xs text-[#64748B] tabular-nums">
            {clearedCheques.length} passed cheques
          </div>
        </div>

        {/* 6. Detected Loans & Private Borrowings */}
        <div className="bg-white p-4 sm:p-5">
          <div className="text-xs font-medium text-[#64748B]">
            Detected Loans & Borrowings
          </div>
          <div className="mt-1.5 font-mono text-lg font-semibold text-[#D97706] tabular-nums">
            {formatINR(loanSummary.totalDetectedDebtExposure)}
          </div>
          <div className="mt-1.5 text-xs text-[#64748B] tabular-nums">
            {loanSummary.institutionalLoanCount} Inst · {loanSummary.tracedPrivateCount} Private
            {loanSummary.totalRecurringAndRepaidOutflow > 0
              ? ` (${formatCompactINR(loanSummary.totalRecurringAndRepaidOutflow)} paid)`
              : ''}
          </div>
        </div>
      </div>
    </section>
  );
};
