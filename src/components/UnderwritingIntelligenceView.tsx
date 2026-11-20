import React, { useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Building2,
  ReceiptText,
  RefreshCw,
  Users,
} from 'lucide-react';
import type {
  CreditUnderwritingReport,
  NormalizedTransaction,
  ReturnDirection,
} from '../types/statement';
import { formatCompactINR, formatINR } from '../utils/indianFormat';

interface UnderwritingIntelligenceViewProps {
  report: CreditUnderwritingReport;
  onInspectTransaction: (tx: NormalizedTransaction) => void;
}

type ModuleTab =
  | 'all'
  | 'bounces'
  | 'circular'
  | 'abb'
  | 'cash'
  | 'statutory'
  | 'concentration';

function getReturnBadgeClass(direction: ReturnDirection): string {
  switch (direction) {
    case 'Outward Return':
      return 'border-[#DC2626]/35 bg-red-50 text-[#DC2626]';
    case 'Inward Return':
      return 'border-[#F59E0B]/45 bg-amber-50 text-[#D97706]';
    case 'Return Penalty Charge':
      return 'border-[#E2E8F0] bg-[#F1F5F9] text-[#334155]';
  }
}

export const UnderwritingIntelligenceView: React.FC<UnderwritingIntelligenceViewProps> = ({
  report,
  onInspectTransaction,
}) => {
  const [activeTab, setActiveTab] = useState<ModuleTab>('all');
  const [cashView, setCashView] = useState<'deposits' | 'withdrawals'>('deposits');
  const [statutoryFilter, setStatutoryFilter] = useState<string>('ALL');

  const {
    bounceReturns,
    circularTransactions,
    abbMatrix,
    cashAnalytics,
    statutoryExpenses,
    concentration,
  } = report;

  const tabs: Array<{ id: ModuleTab; label: string; badge?: string }> = [
    { id: 'all', label: 'All Underwriting Modules' },
    {
      id: 'bounces',
      label: 'Bounce & Returns',
      badge: String(bounceReturns.totalBounceCount),
    },
    {
      id: 'circular',
      label: 'Circular / Rotation',
      badge: String(circularTransactions.pairCount),
    },
    {
      id: 'abb',
      label: 'Turnover & ABB Matrix',
      badge: `${abbMatrix.months.length}M`,
    },
    {
      id: 'cash',
      label: 'Cash Analytics',
      badge: `${cashAnalytics.combinedCashTurnoverPct}%`,
    },
    {
      id: 'statutory',
      label: 'Statutory & OpEx',
      badge: String(statutoryExpenses.totalCount),
    },
    {
      id: 'concentration',
      label: 'Top 10 Buyers & Suppliers',
    },
  ];

  const show = (id: ModuleTab) => activeTab === 'all' || activeTab === id;

  const filteredStatutoryItems =
    statutoryFilter === 'ALL'
      ? statutoryExpenses.items
      : statutoryExpenses.items.filter((i) => i.category === statutoryFilter);

  return (
    <div className="space-y-6">
      {/* Module Switcher Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[#1D4ED8] text-white shadow-xs'
                    : 'bg-[#F1F5F9]/75 text-[#334155] hover:bg-[#DBEAFE]/50 hover:text-[#1D4ED8]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`font-mono text-[11px] ${
                      isActive ? 'text-blue-100' : 'text-[#64748B]'
                    }`}
                  >
                    ({tab.badge})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* MODULE 1: CHEQUE BOUNCE & NACH / ECS RETURN TRACKER */}
      {show('bounces') && (
        <section
          aria-label="Cheque Bounce and NACH Return Tracker"
          className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-[#DC2626]">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold text-[#0F172A]">
                  1. Cheque Bounce & NACH / ECS Return Tracker
                </h3>
                <p className="text-xs text-[#64748B]">
                  Scans narrations for CHQ RET, RETURN, BOUNCE, INSUFFICIENT FUNDS, ECS/NACH/ACH RTN, and return penalty charges.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
              <div>
                <span className="text-[#64748B]">Outward Returns: </span>
                <strong className="font-mono text-[#DC2626]">
                  {bounceReturns.outwardCount}
                </strong>
              </div>
              <div>
                <span className="text-[#64748B]">Inward Returns: </span>
                <strong className="font-mono text-[#D97706]">
                  {bounceReturns.inwardCount}
                </strong>
              </div>
              <div>
                <span className="text-[#64748B]">Total Bounced Value: </span>
                <strong className="font-mono text-[#0F172A]">
                  {formatINR(bounceReturns.totalBouncedValue)}
                </strong>
              </div>
              <div>
                <span className="text-[#64748B]">Return Charges: </span>
                <strong className="font-mono text-[#334155]">
                  {formatINR(bounceReturns.totalPenaltyCharges)}
                </strong>
              </div>
            </div>
          </div>

          {bounceReturns.instruments.length === 0 ? (
            <div className="px-6 py-8 text-center text-xs text-[#16A34A] font-medium">
              Clean instrument conduct: Zero dishonoured cheques, NACH/ECS returns, or bounce penalty charges detected.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]/80 text-[#334155]">
                    <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Date</th>
                    <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Direction</th>
                    <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Instrument</th>
                    <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Ref / Chq No</th>
                    <th className="px-4 py-2.5 font-semibold">Reason & Narration</th>
                    <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {bounceReturns.instruments.map((inst) => (
                    <tr
                      key={inst.id}
                      onClick={() => onInspectTransaction(inst.transaction)}
                      className="cursor-pointer hover:bg-[#DBEAFE]/30"
                    >
                      <td className="px-4 py-2.5 font-mono text-[#334155] whitespace-nowrap">
                        {inst.transaction.date}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-[11px] font-semibold ${getReturnBadgeClass(
                            inst.direction,
                          )}`}
                        >
                          {inst.direction}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[#0F172A] whitespace-nowrap">
                        {inst.instrumentType}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[#334155] whitespace-nowrap">
                        {inst.instrumentRef}
                      </td>
                      <td className="max-w-md px-4 py-2.5">
                        <div className="font-medium text-[#0F172A]">{inst.reasonHint}</div>
                        <div className="truncate text-[11px] text-[#64748B]">
                          {inst.transaction.narration}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#DC2626] tabular-nums whitespace-nowrap">
                        {formatINR(inst.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* MODULE 2: CIRCULAR / ROUND-TRIPPING TRANSACTION DETECTOR */}
      {show('circular') && (
        <section
          aria-label="Circular and Round-Tripping Transaction Detector"
          className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-[#D97706]">
                <RefreshCw className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold text-[#0F172A]">
                  2. Circular / Round-Tripping Transaction Detector
                </h3>
                <p className="text-xs text-[#64748B]">
                  Flags Credit & Debit pairs with matching counterparties or identical amounts occurring within 1–3 days as Suspected Fund Rotation / Accommodation Entry.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs tabular-nums">
              <div>
                <span className="text-[#64748B]">Flagged Pairs: </span>
                <strong className="font-mono text-[#D97706]">
                  {circularTransactions.pairCount}
                </strong>
              </div>
              <div>
                <span className="text-[#64748B]">Rotated Volume: </span>
                <strong className="font-mono text-[#0F172A]">
                  {formatINR(circularTransactions.totalRotatedAmount)}
                </strong>
              </div>
            </div>
          </div>

          {circularTransactions.pairs.length === 0 ? (
            <div className="px-6 py-8 text-center text-xs text-[#16A34A] font-medium">
              No 1–3 day circular round-tripping or accommodation credit-debit pairs detected.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]/80 text-[#334155]">
                    <th className="px-4 py-2.5 font-semibold">Counterparty / Pattern</th>
                    <th className="px-4 py-2.5 font-semibold">Credit Entry (In)</th>
                    <th className="px-4 py-2.5 font-semibold">Debit Entry (Out)</th>
                    <th className="px-4 py-2.5 font-semibold text-center whitespace-nowrap">
                      Gap
                    </th>
                    <th className="px-4 py-2.5 font-semibold whitespace-nowrap">
                      Underwriting Flag
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {circularTransactions.pairs.map((pair) => (
                    <tr key={pair.id} className="align-top hover:bg-[#F1F5F9]/40">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#0F172A]">
                          {pair.counterpartyName}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#64748B]">
                          {pair.amountMatchType}
                          {pair.counterpartySimilarity > 0
                            ? ` · ${Math.round(pair.counterpartySimilarity * 100)}% name match`
                            : ''}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onInspectTransaction(pair.creditTx)}
                          className="text-left hover:text-[#1D4ED8]"
                        >
                          <div className="font-mono font-semibold text-[#16A34A] tabular-nums">
                            +{formatINR(pair.creditTx.credit)}
                          </div>
                          <div className="font-mono text-[11px] text-[#64748B]">
                            {pair.creditTx.date} · {pair.creditTx.paymentMode}
                          </div>
                          <div className="max-w-[240px] truncate text-[11px] text-[#334155]">
                            {pair.creditTx.narration}
                          </div>
                        </button>
                      </td>

                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onInspectTransaction(pair.debitTx)}
                          className="text-left hover:text-[#1D4ED8]"
                        >
                          <div className="font-mono font-semibold text-[#DC2626] tabular-nums">
                            -{formatINR(pair.debitTx.debit)}
                          </div>
                          <div className="font-mono text-[11px] text-[#64748B]">
                            {pair.debitTx.date} · {pair.debitTx.paymentMode}
                          </div>
                          <div className="max-w-[240px] truncate text-[11px] text-[#334155]">
                            {pair.debitTx.narration}
                          </div>
                        </button>
                      </td>

                      <td className="px-4 py-3 text-center font-mono font-semibold text-[#0F172A] whitespace-nowrap">
                        {pair.daysApart === 0 ? 'Same Day' : `${pair.daysApart}d`}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-block rounded border border-[#F59E0B]/45 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-[#D97706]">
                          {pair.flagLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* MODULE 3: MONTH-WISE TURNOVER & AVERAGE BANK BALANCE (ABB) MATRIX */}
      {show('abb') && (
        <section
          aria-label="Month-Wise Turnover and Average Bank Balance Matrix"
          className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DBEAFE] text-[#1D4ED8]">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold text-[#0F172A]">
                  3. Month-Wise Turnover & Average Bank Balance (ABB) Matrix
                </h3>
                <p className="text-xs text-[#64748B]">
                  Separates Business Credits vs Non-Business Credits (Loan disbursals/Reversals/Sweeps) and computes daily calendar ABB.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
              <div>
                <span className="text-[#64748B]">Overall Daily ABB: </span>
                <strong className="font-mono text-[#1D4ED8]">
                  {abbMatrix.overallAbb !== null ? formatINR(abbMatrix.overallAbb) : 'N/A'}
                </strong>
              </div>
              <div>
                <span className="text-[#64748B]">Business Credits: </span>
                <strong className="font-mono text-[#16A34A]">
                  {formatINR(abbMatrix.totalBusinessCredits)}
                </strong>
              </div>
              <div>
                <span className="text-[#64748B]">Min / Max Bal: </span>
                <strong className="font-mono text-[#0F172A]">
                  {abbMatrix.minObservedBalance !== null
                    ? formatCompactINR(abbMatrix.minObservedBalance)
                    : 'N/A'}{' '}
                  /{' '}
                  {abbMatrix.maxObservedBalance !== null
                    ? formatCompactINR(abbMatrix.maxObservedBalance)
                    : 'N/A'}
                </strong>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]/80 text-[#334155]">
                  <th className="px-3.5 py-2.5 font-semibold whitespace-nowrap">Month</th>
                  <th className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">
                    Opening Bal
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">
                    Business Cr
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">
                    Non-Bus. Cr
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">
                    Total Credits
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">
                    Total Debits
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">
                    Closing Bal
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">
                    Min Bal
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">
                    Max Bal
                  </th>
                  <th className="px-3.5 py-2.5 font-semibold text-right whitespace-nowrap">
                    Calc. ABB
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {abbMatrix.months.map((m) => (
                  <tr key={m.monthKey} className="hover:bg-[#F1F5F9]/50">
                    <td className="px-3.5 py-2.5 font-semibold text-[#0F172A] whitespace-nowrap">
                      {m.monthLabel}{' '}
                      <span className="font-mono text-[11px] font-normal text-[#64748B]">
                        ({m.txCount})
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-[#334155] tabular-nums whitespace-nowrap">
                      {m.openingBalance !== null ? formatINR(m.openingBalance) : 'N/A'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-[#16A34A] tabular-nums whitespace-nowrap">
                      {formatINR(m.businessCredits)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-[#64748B] tabular-nums whitespace-nowrap">
                      {formatINR(m.nonBusinessCredits)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-[#16A34A] tabular-nums whitespace-nowrap">
                      {formatINR(m.totalCredits)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-[#DC2626] tabular-nums whitespace-nowrap">
                      {formatINR(m.totalDebits)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-[#0F172A] tabular-nums whitespace-nowrap">
                      {m.closingBalance !== null ? formatINR(m.closingBalance) : 'N/A'}
                    </td>
                    <td
                      className={`px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap ${
                        m.minBalance !== null && m.minBalance < 0
                          ? 'font-semibold text-[#DC2626]'
                          : 'text-[#334155]'
                      }`}
                    >
                      {m.minBalance !== null ? formatINR(m.minBalance) : 'N/A'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-[#334155] tabular-nums whitespace-nowrap">
                      {m.maxBalance !== null ? formatINR(m.maxBalance) : 'N/A'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-[#1D4ED8] tabular-nums whitespace-nowrap">
                      {m.abb !== null ? formatINR(m.abb) : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODULE 4: CASH DEPOSIT & WITHDRAWAL ANALYTICS */}
      {show('cash') && (
        <section
          aria-label="Cash Deposit and Withdrawal Analytics"
          className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#334155]">
                <Banknote className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold text-[#0F172A]">
                  4. Cash Deposit & Self/Cash Withdrawal Analytics
                </h3>
                <p className="text-xs text-[#64748B]">
                  Measures cash intensity as a % share of total banking turnover ({formatINR(cashAnalytics.totalBankingTurnover)}).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] p-1">
              <button
                type="button"
                onClick={() => setCashView('deposits')}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  cashView === 'deposits'
                    ? 'bg-[#1D4ED8] text-white'
                    : 'text-[#334155] hover:bg-white'
                }`}
              >
                Cash Deposits ({cashAnalytics.depositCount})
              </button>
              <button
                type="button"
                onClick={() => setCashView('withdrawals')}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  cashView === 'withdrawals'
                    ? 'bg-[#1D4ED8] text-white'
                    : 'text-[#334155] hover:bg-white'
                }`}
              >
                Cash / Self Withdrawals ({cashAnalytics.withdrawalCount})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 divide-y divide-[#E2E8F0] border-b border-[#E2E8F0] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-5 py-3.5">
              <div className="text-xs font-medium text-[#64748B]">Total Cash Deposits</div>
              <div className="mt-1 font-mono text-sm font-semibold text-[#16A34A] tabular-nums">
                {formatINR(cashAnalytics.totalCashDeposits)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#64748B] tabular-nums">
                {cashAnalytics.depositShareOfTurnoverPct}% of turnover ·{' '}
                {cashAnalytics.depositShareOfCreditsPct}% of credits
              </div>
            </div>

            <div className="px-5 py-3.5">
              <div className="text-xs font-medium text-[#64748B]">
                Total Cash / Self Withdrawals
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-[#DC2626] tabular-nums">
                {formatINR(cashAnalytics.totalCashWithdrawals)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#64748B] tabular-nums">
                {cashAnalytics.withdrawalShareOfTurnoverPct}% of turnover ·{' '}
                {cashAnalytics.withdrawalShareOfDebitsPct}% of debits
              </div>
            </div>

            <div className="px-5 py-3.5">
              <div className="text-xs font-medium text-[#64748B]">
                Combined Cash Share vs. Turnover
              </div>
              <div
                className={`mt-1 font-mono text-sm font-semibold tabular-nums ${
                  cashAnalytics.combinedCashTurnoverPct > 30
                    ? 'text-[#D97706]'
                    : 'text-[#0F172A]'
                }`}
              >
                {cashAnalytics.combinedCashTurnoverPct}%
              </div>
              <div className="mt-0.5 text-[11px] text-[#64748B]">
                {cashAnalytics.combinedCashTurnoverPct > 30
                  ? 'Elevated cash handling (>30%)'
                  : 'Within normal banking norms'}
              </div>
            </div>
          </div>

          {(() => {
            const list =
              cashView === 'deposits'
                ? cashAnalytics.cashDeposits
                : cashAnalytics.cashWithdrawals;
            if (list.length === 0) {
              return (
                <div className="px-6 py-8 text-center text-xs text-[#64748B]">
                  No {cashView === 'deposits' ? 'cash deposit' : 'cash / self withdrawal'} transactions detected.
                </div>
              );
            }
            return (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-[#F1F5F9]">
                    <tr className="border-b border-[#E2E8F0] text-[#334155]">
                      <th className="px-4 py-2 font-semibold">Date</th>
                      <th className="px-4 py-2 font-semibold">Mode / Ref</th>
                      <th className="px-4 py-2 font-semibold">Narration</th>
                      <th className="px-4 py-2 font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {list.map((tx) => (
                      <tr
                        key={tx.id}
                        onClick={() => onInspectTransaction(tx)}
                        className="cursor-pointer hover:bg-[#DBEAFE]/30"
                      >
                        <td className="px-4 py-2 font-mono text-[#334155] whitespace-nowrap">
                          {tx.date}
                        </td>
                        <td className="px-4 py-2 font-mono text-[#64748B] whitespace-nowrap">
                          {tx.paymentMode}
                          {tx.chequeNumber ? ` #${tx.chequeNumber}` : ''}
                        </td>
                        <td className="max-w-lg truncate px-4 py-2 text-[#0F172A]">
                          {tx.narration}
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                            cashView === 'deposits' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                          }`}
                        >
                          {formatINR(cashView === 'deposits' ? tx.credit : tx.debit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </section>
      )}

      {/* MODULE 5: STATUTORY & OPERATIONAL EXPENSE VERIFICATION */}
      {show('statutory') && (
        <section
          aria-label="Statutory and Operational Expense Verification"
          className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-[#16A34A]">
                <ReceiptText className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold text-[#0F172A]">
                  5. Statutory & Operational Expense Verification
                </h3>
                <p className="text-xs text-[#64748B]">
                  Tracks tax & compliance regularity across GST, Income Tax, TDS, EPF, ESIC, Electricity (TNEB/DISCOM), and Rent.
                </p>
              </div>
            </div>

            <div className="text-right tabular-nums">
              <div className="text-[11px] font-medium text-[#64748B]">
                Total Verified Statutory & OpEx Outflow
              </div>
              <div className="font-mono text-sm font-bold text-[#0F172A]">
                {formatINR(statutoryExpenses.totalStatutoryAndOpexPaid)} ({statutoryExpenses.totalCount} txns)
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-b border-[#E2E8F0] bg-[#F1F5F9]/40 p-4 sm:grid-cols-4 lg:grid-cols-7">
            {statutoryExpenses.byCategory.map((cat) => {
              const isSelected = statutoryFilter === cat.category;
              return (
                <button
                  key={cat.category}
                  type="button"
                  onClick={() =>
                    setStatutoryFilter(isSelected ? 'ALL' : cat.category)
                  }
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    isSelected
                      ? 'border-[#1D4ED8] bg-[#DBEAFE]/50'
                      : 'border-[#E2E8F0] bg-white hover:border-[#3B82F6]/50'
                  }`}
                >
                  <div className="text-[11px] font-semibold text-[#334155]">
                    {cat.category}
                  </div>
                  <div className="mt-1 font-mono text-xs font-bold text-[#0F172A] tabular-nums">
                    {formatCompactINR(cat.totalPaid)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#64748B]">
                    {cat.count > 0 ? `${cat.count} paid · ${cat.lastPaidDate}` : 'None observed'}
                  </div>
                </button>
              );
            })}
          </div>

          {filteredStatutoryItems.length === 0 ? (
            <div className="px-6 py-8 text-center text-xs text-[#64748B]">
              No statutory or operational utility/rent payments matched{' '}
              {statutoryFilter === 'ALL' ? 'any category' : statutoryFilter}.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-[#F1F5F9]">
                  <tr className="border-b border-[#E2E8F0] text-[#334155]">
                    <th className="px-4 py-2 font-semibold">Category</th>
                    <th className="px-4 py-2 font-semibold">Date</th>
                    <th className="px-4 py-2 font-semibold">Mode / Ref</th>
                    <th className="px-4 py-2 font-semibold">Narration</th>
                    <th className="px-4 py-2 font-semibold text-right">Amount Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredStatutoryItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => onInspectTransaction(item.transaction)}
                      className="cursor-pointer hover:bg-[#DBEAFE]/30"
                    >
                      <td className="px-4 py-2 font-semibold text-[#1D4ED8] whitespace-nowrap">
                        {item.category}
                      </td>
                      <td className="px-4 py-2 font-mono text-[#334155] whitespace-nowrap">
                        {item.date}
                      </td>
                      <td className="px-4 py-2 font-mono text-[#64748B] whitespace-nowrap">
                        {item.transaction.paymentMode}
                        {item.transaction.refNo ? ` · ${item.transaction.refNo}` : ''}
                      </td>
                      <td className="max-w-md truncate px-4 py-2 text-[#0F172A]">
                        {item.transaction.narration}
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-[#0F172A] tabular-nums whitespace-nowrap">
                        {formatINR(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* MODULE 6: TOP 10 BUYERS (CREDIT CONCENTRATION) & TOP 10 SUPPLIERS (DEBIT CONCENTRATION) */}
      {show('concentration') && (
        <section
          aria-label="Top 10 Buyers and Top 10 Suppliers Concentration"
          className="grid grid-cols-1 gap-5 lg:grid-cols-2"
        >
          {/* Top 10 Buyers (Credit Concentration) */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs">
            <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#16A34A]" />
                <div>
                  <h3 className="font-display text-sm font-semibold text-[#0F172A]">
                    6A. Top 10 Buyers (Credit Concentration)
                  </h3>
                  <p className="text-[11px] text-[#64748B]">
                    Top 10 share: {concentration.topBuyersConcentrationPct}% of total credits
                  </p>
                </div>
              </div>
            </div>

            {concentration.topBuyers.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-[#64748B]">
                No identifiable buyer inflows detected.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]/80 text-[#334155]">
                      <th className="px-3.5 py-2 font-semibold w-10">#</th>
                      <th className="px-3.5 py-2 font-semibold">Buyer / Remitter</th>
                      <th className="px-3.5 py-2 font-semibold text-center">Txns</th>
                      <th className="px-3.5 py-2 font-semibold text-right">Total Credit</th>
                      <th className="px-3.5 py-2 font-semibold text-right w-28">% Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {concentration.topBuyers.map((p) => (
                      <tr
                        key={p.normalizedKey}
                        onClick={() =>
                          p.transactions[0] && onInspectTransaction(p.transactions[0])
                        }
                        className="cursor-pointer hover:bg-[#DBEAFE]/30"
                      >
                        <td className="px-3.5 py-2 font-mono text-[#64748B]">{p.rank}</td>
                        <td className="px-3.5 py-2 font-medium text-[#0F172A]">
                          <div className="truncate max-w-[200px]" title={p.partyName}>
                            {p.partyName}
                          </div>
                        </td>
                        <td className="px-3.5 py-2 text-center font-mono text-[#64748B]">
                          {p.txCount}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono font-semibold text-[#16A34A] tabular-nums whitespace-nowrap">
                          {formatINR(p.totalAmount)}
                        </td>
                        <td className="px-3.5 py-2 text-right">
                          <div className="font-mono font-semibold text-[#0F172A] tabular-nums">
                            {p.sharePct}%
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                            <div
                              className="h-full rounded-full bg-[#16A34A]"
                              style={{ width: `${Math.min(100, p.sharePct)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top 10 Suppliers (Debit Concentration) */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs">
            <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#1D4ED8]" />
                <div>
                  <h3 className="font-display text-sm font-semibold text-[#0F172A]">
                    6B. Top 10 Suppliers (Debit Concentration)
                  </h3>
                  <p className="text-[11px] text-[#64748B]">
                    Top 10 share: {concentration.topSuppliersConcentrationPct}% of total debits
                  </p>
                </div>
              </div>
            </div>

            {concentration.topSuppliers.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-[#64748B]">
                No identifiable supplier outflows detected.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]/80 text-[#334155]">
                      <th className="px-3.5 py-2 font-semibold w-10">#</th>
                      <th className="px-3.5 py-2 font-semibold">Supplier / Payee</th>
                      <th className="px-3.5 py-2 font-semibold text-center">Txns</th>
                      <th className="px-3.5 py-2 font-semibold text-right">Total Debit</th>
                      <th className="px-3.5 py-2 font-semibold text-right w-28">% Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {concentration.topSuppliers.map((p) => (
                      <tr
                        key={p.normalizedKey}
                        onClick={() =>
                          p.transactions[0] && onInspectTransaction(p.transactions[0])
                        }
                        className="cursor-pointer hover:bg-[#DBEAFE]/30"
                      >
                        <td className="px-3.5 py-2 font-mono text-[#64748B]">{p.rank}</td>
                        <td className="px-3.5 py-2 font-medium text-[#0F172A]">
                          <div className="truncate max-w-[200px]" title={p.partyName}>
                            {p.partyName}
                          </div>
                        </td>
                        <td className="px-3.5 py-2 text-center font-mono text-[#64748B]">
                          {p.txCount}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono font-semibold text-[#DC2626] tabular-nums whitespace-nowrap">
                          {formatINR(p.totalAmount)}
                        </td>
                        <td className="px-3.5 py-2 text-right">
                          <div className="font-mono font-semibold text-[#0F172A] tabular-nums">
                            {p.sharePct}%
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                            <div
                              className="h-full rounded-full bg-[#1D4ED8]"
                              style={{ width: `${Math.min(100, p.sharePct)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
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
