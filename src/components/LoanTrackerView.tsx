import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Landmark,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import {
  normalizeEntityTokens,
  traceCounterpartyActivity,
} from '../engine/loanTrackerEngine';
import {
  AUDIT_STATUS_CONFIG,
  type AuditStatus,
  type LoanAnalysisSummary,
  type LoanRiskClassification,
  type NormalizedTransaction,
} from '../types/statement';
import { formatCompactINR, formatINR } from '../utils/indianFormat';

interface LoanTrackerViewProps {
  transactions: NormalizedTransaction[];
  loanSummary: LoanAnalysisSummary;
  thresholdAmount: number;
  onInspectTransaction: (tx: NormalizedTransaction) => void;
  onQuickStatusChange: (txId: string, status: AuditStatus) => void;
}

function getRiskStyle(risk: LoanRiskClassification): string {
  switch (risk) {
    case 'Confirmed Bank/NBFC Loan':
      return 'border-[#3B82F6]/40 bg-[#DBEAFE]/60 text-[#1D4ED8]';
    case 'Suspected Private Loan (Recurring Dues)':
      return 'border-[#DC2626]/35 bg-red-50 text-[#DC2626]';
    case 'Associate / Enterprise Fund Rotation':
      return 'border-[#F59E0B]/45 bg-amber-50 text-[#D97706]';
  }
}

export const LoanTrackerView: React.FC<LoanTrackerViewProps> = ({
  transactions,
  loanSummary,
  thresholdAmount,
  onInspectTransaction,
  onQuickStatusChange,
}) => {
  const [partyQuery, setPartyQuery] = useState('');
  const [expandedInstIds, setExpandedInstIds] = useState<Record<string, boolean>>({});
  const [expandedChainIds, setExpandedChainIds] = useState<Record<string, boolean>>({});

  const effectiveCreditThreshold = Math.max(10_000, thresholdAmount);

  // Extract unique Large Credit sender names for one-click Manual Party Tracer buttons
  const quickCreditSenders = useMemo(() => {
    const map = new Map<string, { label: string; totalIn: number; count: number }>();
    for (const tx of transactions) {
      if (tx.credit < effectiveCreditThreshold) continue;
      const cpTokens = normalizeEntityTokens(tx.counterparty || '');
      const tokens =
        cpTokens.length > 0
          ? cpTokens.slice(0, 4)
          : normalizeEntityTokens(tx.narration).slice(0, 4);
      if (tokens.length === 0) continue;
      const key = tokens.join(' ');
      const label = key
        .toLowerCase()
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      const existing = map.get(key);
      if (existing) {
        existing.totalIn += tx.credit;
        existing.count += 1;
      } else {
        map.set(key, { label, totalIn: tx.credit, count: 1 });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.totalIn - a.totalIn)
      .slice(0, 10);
  }, [transactions, effectiveCreditThreshold]);

  const manualTrace = useMemo(
    () => traceCounterpartyActivity(transactions, partyQuery),
    [transactions, partyQuery],
  );

  const toggleInst = (id: string) => {
    setExpandedInstIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleChain = (id: string) => {
    setExpandedChainIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <section aria-label="Loan and Private Borrowing Tracker" className="space-y-5">
      {/* Section Header & Borrowing Exposure Summary */}
      <div className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DBEAFE] text-[#1D4ED8]">
              <Landmark className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-sm font-semibold text-[#0F172A]">
                Undisclosed Loan, NBFC EMI & Private Borrowing Tracker
              </h2>
              <p className="text-xs text-[#64748B]">
                Detects institutional ACH/NACH/NBFC EMIs and traces Large Credits ({`\u2265 ${formatCompactINR(effectiveCreditThreshold)}`}) to subsequent due repayments.
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[11px] font-medium text-[#64748B]">
              Total Detected Borrowing & EMI Exposure
            </div>
            <div className="font-mono text-base font-bold text-[#0F172A] tabular-nums">
              {formatINR(loanSummary.totalDetectedDebtExposure)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-[#E2E8F0] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          <div className="px-5 py-3.5">
            <div className="text-xs font-medium text-[#64748B]">Institutional Bank / NBFC EMIs</div>
            <div className="mt-1 font-mono text-sm font-semibold text-[#1D4ED8] tabular-nums">
              {formatINR(loanSummary.institutionalEmiOutflow)}
            </div>
            <div className="mt-0.5 text-[11px] text-[#64748B] tabular-nums">
              {loanSummary.institutionalLoanCount} detected lenders
            </div>
          </div>

          <div className="px-5 py-3.5">
            <div className="text-xs font-medium text-[#64748B]">Traced Private / Associate Principal</div>
            <div className="mt-1 font-mono text-sm font-semibold text-[#0F172A] tabular-nums">
              {formatINR(loanSummary.tracedPrivatePrincipal)}
            </div>
            <div className="mt-0.5 text-[11px] text-[#64748B] tabular-nums">
              {loanSummary.tracedPrivateCount} traced counterparties
            </div>
          </div>

          <div className="px-5 py-3.5">
            <div className="text-xs font-medium text-[#64748B]">Followed-Up Dues / Repaid</div>
            <div className="mt-1 font-mono text-sm font-semibold text-[#16A34A] tabular-nums">
              {formatINR(loanSummary.tracedPrivateRepaid)}
            </div>
            <div className="mt-0.5 text-[11px] text-[#64748B]">
              Matched subsequent NEFT / RTGS / Cheques
            </div>
          </div>

          <div className="px-5 py-3.5">
            <div className="text-xs font-medium text-[#64748B]">Net Traced Unpaid Balance</div>
            <div
              className={`mt-1 font-mono text-sm font-semibold tabular-nums ${
                loanSummary.tracedPrivateNetOutstanding > 0 ? 'text-[#DC2626]' : 'text-[#0F172A]'
              }`}
            >
              {formatINR(loanSummary.tracedPrivateNetOutstanding)}
            </div>
            <div className="mt-0.5 text-[11px] text-[#64748B]">
              Principal received minus traced payouts
            </div>
          </div>
        </div>
      </div>

      {/* Manual Party Tracer */}
      <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-[#0F172A]">
              Manual Party & Financier Tracer
            </h3>
            <p className="text-xs text-[#64748B]">
              Select any Large Credit sender or enter a counterparty name to trace every matching Credit inflow and Debit payout.
            </p>
          </div>
          {partyQuery && (
            <button
              type="button"
              onClick={() => setPartyQuery('')}
              className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2.5 py-1 text-xs font-medium text-[#334155] hover:bg-[#E2E8F0]"
            >
              <X className="h-3.5 w-3.5" />
              <span>Clear Tracer</span>
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1 max-w-lg">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={partyQuery}
              onChange={(e) => setPartyQuery(e.target.value)}
              placeholder="Type counterparty, financier, enterprise, or NBFC name..."
              aria-label="Manual party tracer search"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white py-2 pr-3 pl-9 text-xs text-[#0F172A] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none"
            />
          </div>
        </div>

        {quickCreditSenders.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-medium text-[#64748B]">
              Large Credit Senders:
            </span>
            {quickCreditSenders.map((sender) => {
              const isSelected =
                partyQuery.trim().toUpperCase() === sender.label.toUpperCase();
              return (
                <button
                  key={sender.label}
                  type="button"
                  onClick={() =>
                    setPartyQuery(isSelected ? '' : sender.label)
                  }
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white'
                      : 'border-[#E2E8F0] bg-[#F1F5F9]/70 text-[#334155] hover:border-[#3B82F6]/50 hover:bg-[#DBEAFE]/40 hover:text-[#1D4ED8]'
                  }`}
                >
                  {sender.label}{' '}
                  <span className="font-mono opacity-80">
                    ({formatCompactINR(sender.totalIn)})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {partyQuery.trim() && (
          <div className="mt-4 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9]/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                <UserCheck className="h-4 w-4 text-[#1D4ED8]" />
                <span>Trace Results for &ldquo;{manualTrace.query}&rdquo;</span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
                <span>
                  Credits In ({manualTrace.matchingCredits.length}):{' '}
                  <strong className="font-mono text-[#16A34A]">
                    {formatINR(manualTrace.totalCreditsIn)}
                  </strong>
                </span>
                <span>
                  Debits Paid ({manualTrace.matchingDebits.length}):{' '}
                  <strong className="font-mono text-[#DC2626]">
                    {formatINR(manualTrace.totalDebitsOut)}
                  </strong>
                </span>
                <span>
                  Net Position:{' '}
                  <strong className="font-mono text-[#0F172A]">
                    {formatINR(manualTrace.netBalance)}
                  </strong>
                </span>
              </div>
            </div>

            {manualTrace.matchingCredits.length === 0 &&
            manualTrace.matchingDebits.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#64748B]">
                No credits or debits matched &ldquo;{manualTrace.query}&rdquo;. Try a shorter root name (e.g. first 1-2 distinctive words).
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Matching Credits */}
                <div className="rounded-md border border-[#E2E8F0] bg-white">
                  <div className="border-b border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#16A34A]">
                    Matching Credits In ({manualTrace.matchingCredits.length})
                  </div>
                  {manualTrace.matchingCredits.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-[#64748B]">No credit entries matched.</div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto divide-y divide-[#E2E8F0]">
                      {manualTrace.matchingCredits.map((tx) => (
                        <button
                          key={tx.id}
                          type="button"
                          onClick={() => onInspectTransaction(tx)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-[#DBEAFE]/30"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] text-[#64748B]">
                              {tx.date} · {tx.paymentMode}
                            </div>
                            <div className="truncate font-medium text-[#0F172A]">
                              {tx.counterparty}
                            </div>
                            <div className="truncate text-[11px] text-[#64748B]">
                              {tx.narration}
                            </div>
                          </div>
                          <span className="font-mono font-semibold text-[#16A34A] whitespace-nowrap tabular-nums">
                            +{formatINR(tx.credit)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Matching Debits */}
                <div className="rounded-md border border-[#E2E8F0] bg-white">
                  <div className="border-b border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#DC2626]">
                    Matching Debits / Repayments Out ({manualTrace.matchingDebits.length})
                  </div>
                  {manualTrace.matchingDebits.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-[#64748B]">No debit entries matched.</div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto divide-y divide-[#E2E8F0]">
                      {manualTrace.matchingDebits.map((tx) => (
                        <button
                          key={tx.id}
                          type="button"
                          onClick={() => onInspectTransaction(tx)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-[#DBEAFE]/30"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] text-[#64748B]">
                              {tx.date} ·{' '}
                              {tx.isChequeCleared
                                ? `Cleared Cheque #${tx.chequeNumber || tx.refNo}`
                                : tx.paymentMode}
                            </div>
                            <div className="truncate font-medium text-[#0F172A]">
                              {tx.chequePayee || tx.counterparty}
                            </div>
                            <div className="truncate text-[11px] text-[#64748B]">
                              {tx.narration}
                            </div>
                          </div>
                          <span className="font-mono font-semibold text-[#DC2626] whitespace-nowrap tabular-nums">
                            -{formatINR(tx.debit)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Traced Private Financier, Unsecured Borrowing & Associate Chains */}
      <div className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-3.5">
          <div>
            <h3 className="font-display text-sm font-semibold text-[#0F172A]">
              Traced Private Loans, Financiers & Enterprise Fund Chains
            </h3>
            <p className="mt-0.5 text-xs text-[#64748B]">
              Links Large Credits ({`\u2265 ${formatCompactINR(effectiveCreditThreshold)}`}) to subsequent recurring NEFT/RTGS payouts & cleared cheques to the same counterparty.
            </p>
          </div>
          <span className="font-mono text-xs font-medium text-[#334155] tabular-nums">
            {loanSummary.tracedLoanChains.length} traced chains
          </span>
        </div>

        {loanSummary.tracedLoanChains.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-[#64748B]">
            No Large Credit inflows matched subsequent debit repayments to the same counterparty at the current threshold ({formatINR(effectiveCreditThreshold, false)}). Use the Manual Party Tracer above to inspect any specific name.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]/80 text-[#334155]">
                  <th className="px-4 py-2.5 font-semibold">Lender / Party Name</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">
                    Initial Credit & Principal
                  </th>
                  <th className="px-4 py-2.5 font-semibold">
                    Followed-Up Subsequent Debits / Dues Paid
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">
                    Repaid & Net Outstanding
                  </th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">
                    Risk Classification
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {loanSummary.tracedLoanChains.map((chain) => {
                  const isExpanded = Boolean(expandedChainIds[chain.id]);
                  const visibleDebits = isExpanded
                    ? chain.subsequentDebits
                    : chain.subsequentDebits.slice(0, 3);
                  const hiddenCount = chain.subsequentDebits.length - 3;

                  return (
                    <tr key={chain.id} className="align-top hover:bg-[#F1F5F9]/40">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#0F172A]">
                          {chain.lenderPartyName}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#64748B]">
                          {chain.creditTransactions.length} credit inflow
                          {chain.creditTransactions.length > 1 ? 's' : ''} ·{' '}
                          {chain.subsequentDebits.length} subsequent payout
                          {chain.subsequentDebits.length > 1 ? 's' : ''}
                        </div>
                        <button
                          type="button"
                          onClick={() => setPartyQuery(chain.lenderPartyName)}
                          className="mt-1.5 text-[11px] font-medium text-[#1D4ED8] hover:underline"
                        >
                          Open in Manual Tracer
                        </button>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono text-sm font-semibold text-[#16A34A] tabular-nums">
                          {formatINR(chain.principalReceived)}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-[#64748B]">
                          First In: {chain.initialCreditDate}
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {chain.creditTransactions.slice(0, 2).map((cTx) => (
                            <button
                              key={cTx.id}
                              type="button"
                              onClick={() => onInspectTransaction(cTx)}
                              className="block font-mono text-[11px] text-[#334155] hover:text-[#1D4ED8] hover:underline"
                            >
                              {cTx.date} · {cTx.paymentMode} ({formatINR(cTx.credit)})
                            </button>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3 min-w-[280px]">
                        <div className="space-y-1.5">
                          {visibleDebits.map((item) => {
                            const dTx = item.transaction;
                            const modeText = dTx.isChequeCleared
                              ? `Cleared Cheque #${dTx.chequeNumber || dTx.refNo}`
                              : `${dTx.paymentMode}${dTx.refNo ? ` · ${dTx.refNo}` : ''}`;
                            return (
                              <button
                                key={dTx.id}
                                type="button"
                                onClick={() => onInspectTransaction(dTx)}
                                className="flex w-full items-center justify-between gap-3 rounded-md border border-[#E2E8F0] bg-[#F1F5F9]/45 px-2.5 py-1.5 text-left transition-colors hover:border-[#3B82F6]/50 hover:bg-[#DBEAFE]/30"
                              >
                                <div className="min-w-0">
                                  <div className="font-mono text-[11px] font-medium text-[#0F172A]">
                                    {dTx.date} · {modeText}
                                  </div>
                                  <div className="truncate text-[11px] text-[#64748B]">
                                    {dTx.narration}
                                  </div>
                                </div>
                                <span className="font-mono text-xs font-semibold text-[#DC2626] whitespace-nowrap tabular-nums">
                                  -{formatINR(dTx.debit)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleChain(chain.id)}
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#1D4ED8] hover:underline"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronDown className="h-3.5 w-3.5" />
                                <span>Show fewer payouts</span>
                              </>
                            ) : (
                              <>
                                <ChevronRight className="h-3.5 w-3.5" />
                                <span>View {hiddenCount} more payouts</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        <div className="text-[11px] text-[#64748B]">Total Repaid</div>
                        <div className="font-mono text-xs font-semibold text-[#16A34A]">
                          {formatINR(chain.totalRepaid)}
                        </div>
                        <div className="mt-1.5 text-[11px] text-[#64748B]">Net Balance</div>
                        <div
                          className={`font-mono text-sm font-bold ${
                            chain.netOutstandingBalance > 0
                              ? 'text-[#DC2626]'
                              : 'text-[#0F172A]'
                          }`}
                        >
                          {formatINR(chain.netOutstandingBalance)}
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold ${getRiskStyle(
                            chain.riskClassification,
                          )}`}
                        >
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>{chain.riskClassification}</span>
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

      {/* Institutional Bank / NBFC Loans & Recurring EMIs */}
      <div className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-3.5">
          <div>
            <h3 className="font-display text-sm font-semibold text-[#0F172A]">
              Institutional Bank / NBFC Loans & Recurring EMIs
            </h3>
            <p className="mt-0.5 text-xs text-[#64748B]">
              Auto-grouped debit mandates matching EMI, LOAN, ACH, NACH, ECS, Bajaj Finserv, Tata Capital, Chola, Shriram, HDB, Muthoot, Lendingkart, and OD Interest.
            </p>
          </div>
          <span className="font-mono text-xs font-medium text-[#334155] tabular-nums">
            {loanSummary.institutionalLoans.length} institutional lenders
          </span>
        </div>

        {loanSummary.institutionalLoans.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-[#64748B]">
            No institutional EMI, ACH/NACH loan debit, or NBFC lender pattern detected in this statement.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]/80 text-[#334155]">
                  <th className="px-4 py-2.5 font-semibold">Lender / NBFC Name</th>
                  <th className="px-4 py-2.5 font-semibold">Matched Signals</th>
                  <th className="px-4 py-2.5 font-semibold text-center whitespace-nowrap">
                    EMI Freq.
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">
                    Avg. Due Amount
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">
                    Total Outflow
                  </th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Date Window</th>
                  <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">
                    Schedule
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {loanSummary.institutionalLoans.map((group) => {
                  const isExpanded = Boolean(expandedInstIds[group.id]);
                  return (
                    <React.Fragment key={group.id}>
                      <tr className="hover:bg-[#F1F5F9]/50">
                        <td className="px-4 py-3 font-semibold text-[#0F172A]">
                          <div>{group.lenderName}</div>
                          <div className="mt-0.5 text-[11px] font-normal text-[#1D4ED8]">
                            {group.riskTag}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[#334155]">
                          {group.matchedKeywords.join(', ')}
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-semibold text-[#0F172A] tabular-nums">
                          {group.emiFrequency}x
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[#334155] tabular-nums whitespace-nowrap">
                          {formatINR(group.averageDueAmount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-[#DC2626] tabular-nums whitespace-nowrap">
                          {formatINR(group.totalOutflow)}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[#64748B] whitespace-nowrap">
                          {group.firstDebitDate} → {group.lastDebitDate}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleInst(group.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#334155] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronDown className="h-3.5 w-3.5" />
                                <span>Hide ({group.transactions.length})</span>
                              </>
                            ) : (
                              <>
                                <ChevronRight className="h-3.5 w-3.5" />
                                <span>View ({group.transactions.length})</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="bg-[#F1F5F9]/60 px-6 py-3">
                            <div className="overflow-x-auto rounded-md border border-[#E2E8F0] bg-white">
                              <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                  <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9] text-[11px] text-[#334155]">
                                    <th className="px-3 py-1.5 font-semibold">Date</th>
                                    <th className="px-3 py-1.5 font-semibold">Mode / Ref</th>
                                    <th className="px-3 py-1.5 font-semibold">Narration</th>
                                    <th className="px-3 py-1.5 font-semibold text-right">
                                      EMI Debit
                                    </th>
                                    <th className="px-3 py-1.5 font-semibold">Audit Tag</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E2E8F0]">
                                  {group.transactions.map((tx) => (
                                    <tr
                                      key={tx.id}
                                      onClick={() => onInspectTransaction(tx)}
                                      className="cursor-pointer hover:bg-[#DBEAFE]/30"
                                    >
                                      <td className="px-3 py-2 font-mono text-[11px] text-[#334155] whitespace-nowrap">
                                        {tx.date}
                                      </td>
                                      <td className="px-3 py-2 font-mono text-[11px] text-[#64748B] whitespace-nowrap">
                                        {tx.paymentMode}
                                        {tx.refNo ? ` · ${tx.refNo}` : ''}
                                      </td>
                                      <td className="max-w-md truncate px-3 py-2 text-[#0F172A]">
                                        {tx.narration}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono font-semibold text-[#DC2626] tabular-nums whitespace-nowrap">
                                        {formatINR(tx.debit)}
                                      </td>
                                      <td
                                        className="px-3 py-2"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <select
                                          aria-label={`Audit status for ${tx.narration}`}
                                          value={tx.auditStatus}
                                          onChange={(e) =>
                                            onQuickStatusChange(
                                              tx.id,
                                              e.target.value as AuditStatus,
                                            )
                                          }
                                          className={`rounded border px-2 py-0.5 text-[11px] font-medium focus:outline-none ${AUDIT_STATUS_CONFIG[tx.auditStatus].bgClass} ${AUDIT_STATUS_CONFIG[tx.auditStatus].textClass} ${AUDIT_STATUS_CONFIG[tx.auditStatus].borderClass}`}
                                        >
                                          {Object.entries(AUDIT_STATUS_CONFIG).map(
                                            ([val, cfg]) => (
                                              <option key={val} value={val}>
                                                {cfg.label}
                                              </option>
                                            ),
                                          )}
                                        </select>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
