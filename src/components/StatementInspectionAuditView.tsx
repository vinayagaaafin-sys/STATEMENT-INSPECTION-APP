import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Landmark,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { traceCounterpartyActivity } from '../engine/loanTrackerEngine';
import { exportCleanInspectionPdf } from '../engine/pdfReportExport';
import type {
  AnalyzedStatement,
  AuditStatus,
  LoanAnalysisSummary,
  NormalizedTransaction,
} from '../types/statement';
import { formatCompactINR, formatINR } from '../utils/indianFormat';
import { ChequeRegisterView } from './ChequeRegisterView';
import { HighValueSegregation } from './HighValueSegregation';

interface StatementInspectionAuditViewProps {
  statement: AnalyzedStatement;
  loanSummary: LoanAnalysisSummary;
  thresholdAmount: number;
  onThresholdChange: (val: number) => void;
  onInspectTransaction: (tx: NormalizedTransaction) => void;
  onQuickStatusChange: (txId: string, status: AuditStatus) => void;
}

type AuditSectionFilter = 'all' | 'high-value' | 'cheques' | 'loans';

export const StatementInspectionAuditView: React.FC<
  StatementInspectionAuditViewProps
> = ({
  statement,
  loanSummary,
  thresholdAmount,
  onThresholdChange,
  onInspectTransaction,
  onQuickStatusChange,
}) => {
  const [sectionFilter, setSectionFilter] = useState<AuditSectionFilter>('all');
  const [expandedScheduleIds, setExpandedScheduleIds] = useState<
    Record<string, boolean>
  >({});
  const [tracerQuery, setTracerQuery] = useState('');

  const { transactions, integrity } = statement;

  const highValueCount = useMemo(
    () =>
      transactions.filter(
        (t) => t.credit >= thresholdAmount || t.debit >= thresholdAmount,
      ).length,
    [transactions, thresholdAmount],
  );

  const clearedCheques = useMemo(
    () => transactions.filter((t) => t.isChequeCleared),
    [transactions],
  );

  const clearedChequesTotal = useMemo(
    () => clearedCheques.reduce((s, t) => s + t.debit, 0),
    [clearedCheques],
  );

  const manualTrace = useMemo(
    () => traceCounterpartyActivity(transactions, tracerQuery),
    [transactions, tracerQuery],
  );

  // Unified rows for "Traced Loans & Private Due-Payment Schedule"
  const scheduleRows = useMemo(() => {
    type UnifiedScheduleRow = {
      id: string;
      lenderName: string;
      initialCreditText: string;
      initialCreditSubtext: string;
      initialCreditTx?: NormalizedTransaction;
      dueDebits: NormalizedTransaction[];
      totalRepaid: number;
      netBalance: number | null;
      tag: 'Bank/NBFC Loan' | 'Suspected Private / Associate Loan';
      subMeta: string;
    };

    const rows: UnifiedScheduleRow[] = [];

    for (const chain of loanSummary.tracedLoanChains) {
      rows.push({
        id: chain.id,
        lenderName: chain.lenderPartyName,
        initialCreditText: formatINR(chain.principalReceived),
        initialCreditSubtext: `First In: ${chain.initialCreditDate}`,
        initialCreditTx: chain.creditTransactions[0],
        dueDebits: chain.subsequentDebits.map((d) => d.transaction),
        totalRepaid: chain.totalRepaid,
        netBalance: chain.netOutstandingBalance,
        tag: 'Suspected Private / Associate Loan',
        subMeta: `${chain.creditTransactions.length} credit(s) · ${chain.subsequentDebits.length} subsequent payout(s)`,
      });
    }

    for (const grp of loanSummary.institutionalLoans) {
      rows.push({
        id: grp.id,
        lenderName: grp.lenderName,
        initialCreditText: '— (Mandate)',
        initialCreditSubtext: `Avg EMI: ${formatINR(grp.averageDueAmount)}`,
        dueDebits: grp.transactions,
        totalRepaid: grp.totalOutflow,
        netBalance: null,
        tag: 'Bank/NBFC Loan',
        subMeta: `${grp.emiFrequency}x recurring · ${grp.matchedKeywords.join(', ')}`,
      });
    }

    return rows;
  }, [loanSummary]);

  const toggleExpand = (id: string) => {
    setExpandedScheduleIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const showSection = (id: AuditSectionFilter) =>
    sectionFilter === 'all' || sectionFilter === id;

  return (
    <div className="space-y-6">
      {/* Isolated Header & Management PDF Export Bar */}
      <section
        aria-label="Statement Inspection and Loan Audit Header"
        className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#DBEAFE] text-[#1D4ED8]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-[#0F172A]">
                Statement Inspection & Loan Audit
              </h2>
              <p className="text-xs text-[#64748B]">
                Isolated high-value segregation, cleared cheque pass tracker, outside loan/private due-payment follower, and clean management PDF export.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              exportCleanInspectionPdf(statement, loanSummary, thresholdAmount)
            }
            className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1E40AF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6] whitespace-nowrap shrink-0"
          >
            <FileText className="h-4 w-4" />
            <span>Download Inspection PDF</span>
          </button>
        </div>

        {/* Summary KPIs Strip */}
        <div className="grid grid-cols-1 gap-px bg-[#E2E8F0] sm:grid-cols-2 lg:grid-cols-5">
          <div className="bg-white px-4 py-3.5">
            <div className="text-[11px] font-medium text-[#64748B]">
              Total Credits / Debits
            </div>
            <div className="mt-1 font-mono text-xs font-semibold text-[#16A34A] tabular-nums">
              +{formatINR(integrity.totalCredits)}
            </div>
            <div className="font-mono text-xs font-semibold text-[#DC2626] tabular-nums">
              -{formatINR(integrity.totalDebits)}
            </div>
          </div>

          <div className="bg-white px-4 py-3.5">
            <div className="text-[11px] font-medium text-[#64748B]">
              Closing Balance
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-[#0F172A] tabular-nums">
              {integrity.closingBalance !== null
                ? formatINR(integrity.closingBalance)
                : 'N/A'}
            </div>
            <div className="mt-0.5 text-[11px] text-[#64748B]">
              {transactions.length} normalized rows
            </div>
          </div>

          <div className="bg-white px-4 py-3.5">
            <div className="text-[11px] font-medium text-[#64748B]">
              High-Value ({`\u2265 ${formatCompactINR(thresholdAmount)}`})
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-[#1D4ED8] tabular-nums">
              {highValueCount} entries
            </div>
            <div className="mt-0.5 text-[11px] text-[#64748B]">
              Real-time threshold filter
            </div>
          </div>

          <div className="bg-white px-4 py-3.5">
            <div className="text-[11px] font-medium text-[#64748B]">
              Cleared Cheques Total
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-[#0F172A] tabular-nums">
              {formatINR(clearedChequesTotal)}
            </div>
            <div className="mt-0.5 text-[11px] text-[#64748B] tabular-nums">
              {clearedCheques.length} passed cheques
            </div>
          </div>

          <div className="bg-white px-4 py-3.5">
            <div className="text-[11px] font-medium text-[#64748B]">
              Traced Loans Total
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-[#D97706] tabular-nums">
              {formatINR(loanSummary.totalDetectedDebtExposure)}
            </div>
            <div className="mt-0.5 text-[11px] text-[#64748B] tabular-nums">
              {loanSummary.institutionalLoanCount} Bank/NBFC ·{' '}
              {loanSummary.tracedPrivateCount} Private
            </div>
          </div>
        </div>

        {/* Sub-module filter */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[#E2E8F0] bg-[#F1F5F9]/60 px-4 py-2.5">
          {(
            [
              { id: 'all', label: 'All 3 Audit Modules' },
              { id: 'high-value', label: '1. High-Value Segregation' },
              { id: 'cheques', label: '2. Cleared Cheque Register' },
              {
                id: 'loans',
                label: '3. Traced Loans & Due-Payment Schedule',
              },
            ] as Array<{ id: AuditSectionFilter; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSectionFilter(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                sectionFilter === tab.id
                  ? 'bg-[#1D4ED8] text-white shadow-xs'
                  : 'bg-white text-[#334155] border border-[#E2E8F0] hover:text-[#1D4ED8]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* MODULE 1: HIGH-VALUE TRANSACTION SEGREGATION */}
      {showSection('high-value') && (
        <HighValueSegregation
          transactions={transactions}
          thresholdAmount={thresholdAmount}
          onThresholdChange={onThresholdChange}
          onInspectTransaction={onInspectTransaction}
          onQuickStatusChange={onQuickStatusChange}
        />
      )}

      {/* MODULE 2: ISSUED & CLEARED CHEQUE REGISTER */}
      {showSection('cheques') && (
        <ChequeRegisterView
          transactions={transactions}
          onInspectTransaction={onInspectTransaction}
          onQuickStatusChange={onQuickStatusChange}
        />
      )}

      {/* MODULE 3: OUTSIDE LOAN, ENTERPRISE & ASSOCIATE DUE-PAYMENT FOLLOWER */}
      {showSection('loans') && (
        <section
          aria-label="Traced Loans and Private Due-Payment Schedule"
          className="space-y-4"
        >
          <div className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DBEAFE] text-[#1D4ED8]">
                  <Landmark className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-[#0F172A]">
                    Traced Loans & Private Due-Payment Schedule
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Groups recurring Bank/NBFC EMIs (`EMI`, `LOAN`, `ACH`, `NACH`, `ECS`, `BAJAJ`, `CHOLA`, `SHRIRAM`, `TATA CAP`, `HDB`, `MUTHOOT`) and matches Large Credit inflows against subsequent Debit repayments or cleared cheques to the same counterparty.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative min-w-[230px]">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
                  <input
                    type="text"
                    value={tracerQuery}
                    onChange={(e) => setTracerQuery(e.target.value)}
                    placeholder="Trace counterparty name..."
                    aria-label="Trace counterparty in loan schedule"
                    className="w-full rounded-md border border-[#E2E8F0] bg-white py-1.5 pr-7 pl-8 text-xs text-[#0F172A] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none"
                  />
                  {tracerQuery && (
                    <button
                      type="button"
                      onClick={() => setTracerQuery('')}
                      aria-label="Clear tracer search"
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Optional quick inline trace results */}
            {tracerQuery.trim() && (
              <div className="border-b border-[#E2E8F0] bg-[#F1F5F9]/60 px-5 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-[#0F172A]">
                    Counterparty Trace: &ldquo;{manualTrace.query}&rdquo;
                  </span>
                  <div className="flex flex-wrap items-center gap-4 tabular-nums">
                    <span>
                      Credits ({manualTrace.matchingCredits.length}):{' '}
                      <strong className="font-mono text-[#16A34A]">
                        {formatINR(manualTrace.totalCreditsIn)}
                      </strong>
                    </span>
                    <span>
                      Subsequent Debits ({manualTrace.matchingDebits.length}):{' '}
                      <strong className="font-mono text-[#DC2626]">
                        {formatINR(manualTrace.totalDebitsOut)}
                      </strong>
                    </span>
                    <span>
                      Net Balance:{' '}
                      <strong className="font-mono text-[#0F172A]">
                        {formatINR(manualTrace.netBalance)}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {scheduleRows.length === 0 ? (
              <div className="px-6 py-10 text-center text-xs text-[#64748B]">
                No Bank/NBFC loan EMIs or Private/Enterprise/Associate repayment chains detected at the current threshold ({formatINR(Math.max(10_000, thresholdAmount), false)}).
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]/80 text-[#334155]">
                      <th className="px-4 py-2.5 font-semibold">
                        Lender / Party Name
                      </th>
                      <th className="px-4 py-2.5 font-semibold whitespace-nowrap">
                        Initial Credit Received (₹)
                      </th>
                      <th className="px-4 py-2.5 font-semibold">
                        Followed-Up Subsequent Debits / Dues Paid (Dates & Amounts)
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                        Total Repaid (₹)
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                        Net Balance (₹)
                      </th>
                      <th className="px-4 py-2.5 font-semibold whitespace-nowrap">
                        Tag
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {scheduleRows.map((row) => {
                      const isExpanded = Boolean(expandedScheduleIds[row.id]);
                      const visibleDebits = isExpanded
                        ? row.dueDebits
                        : row.dueDebits.slice(0, 3);
                      const hiddenCount = row.dueDebits.length - 3;

                      return (
                        <tr
                          key={row.id}
                          className="align-top hover:bg-[#F1F5F9]/40"
                        >
                          <td className="px-4 py-3">
                            <div className="font-semibold text-[#0F172A]">
                              {row.lenderName}
                            </div>
                            <div className="mt-0.5 text-[11px] text-[#64748B]">
                              {row.subMeta}
                            </div>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.initialCreditTx ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onInspectTransaction(row.initialCreditTx!)
                                }
                                className="text-left hover:underline"
                              >
                                <div className="font-mono text-sm font-semibold text-[#16A34A] tabular-nums">
                                  {row.initialCreditText}
                                </div>
                                <div className="mt-0.5 font-mono text-[11px] text-[#64748B]">
                                  {row.initialCreditSubtext}
                                </div>
                              </button>
                            ) : (
                              <div>
                                <div className="font-mono text-xs font-medium text-[#64748B]">
                                  {row.initialCreditText}
                                </div>
                                <div className="mt-0.5 font-mono text-[11px] text-[#64748B]">
                                  {row.initialCreditSubtext}
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="min-w-[270px] px-4 py-3">
                            <div className="space-y-1.5">
                              {visibleDebits.map((dTx) => {
                                const modeLabel = dTx.isChequeCleared
                                  ? `Chq #${dTx.chequeNumber || dTx.refNo}`
                                  : dTx.paymentMode;
                                return (
                                  <button
                                    key={dTx.id}
                                    type="button"
                                    onClick={() => onInspectTransaction(dTx)}
                                    className="flex w-full items-center justify-between gap-3 rounded-md border border-[#E2E8F0] bg-[#F1F5F9]/45 px-2.5 py-1.5 text-left transition-colors hover:border-[#3B82F6]/50 hover:bg-[#DBEAFE]/30"
                                  >
                                    <div className="min-w-0">
                                      <div className="font-mono text-[11px] font-medium text-[#0F172A]">
                                        {dTx.date} · {modeLabel}
                                      </div>
                                      <div className="truncate text-[11px] text-[#64748B]">
                                        {dTx.narration}
                                      </div>
                                    </div>
                                    <span className="font-mono text-xs font-semibold text-[#DC2626] whitespace-nowrap tabular-nums">
                                      {formatINR(dTx.debit)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {hiddenCount > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(row.id)}
                                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#1D4ED8] hover:underline"
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                    <span>Show fewer</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronRight className="h-3.5 w-3.5" />
                                    <span>View {hiddenCount} more dues</span>
                                  </>
                                )}
                              </button>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right font-mono font-semibold text-[#0F172A] whitespace-nowrap tabular-nums">
                            {formatINR(row.totalRepaid)}
                          </td>

                          <td
                            className={`px-4 py-3 text-right font-mono font-bold whitespace-nowrap tabular-nums ${
                              row.netBalance !== null && row.netBalance > 0
                                ? 'text-[#DC2626]'
                                : 'text-[#334155]'
                            }`}
                          >
                            {row.netBalance !== null
                              ? formatINR(row.netBalance)
                              : 'Recurring EMI'}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-block rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                                row.tag === 'Bank/NBFC Loan'
                                  ? 'border-[#3B82F6]/40 bg-[#DBEAFE]/60 text-[#1D4ED8]'
                                  : 'border-[#DC2626]/35 bg-red-50 text-[#DC2626]'
                              }`}
                            >
                              {row.tag}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
