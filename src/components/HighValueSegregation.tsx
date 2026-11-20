import React, { useMemo, useState } from 'react';
import { Columns2, LayoutList, SlidersHorizontal } from 'lucide-react';
import {
  AUDIT_STATUS_CONFIG,
  type AuditStatus,
  type NormalizedTransaction,
} from '../types/statement';
import { formatINR } from '../utils/indianFormat';

interface HighValueSegregationProps {
  transactions: NormalizedTransaction[];
  thresholdAmount: number;
  onThresholdChange: (val: number) => void;
  onInspectTransaction: (tx: NormalizedTransaction) => void;
  onQuickStatusChange: (txId: string, status: AuditStatus) => void;
}

const PRESET_THRESHOLDS = [
  { label: '₹50K', value: 50_000 },
  { label: '₹1L', value: 100_000 },
  { label: '₹5L', value: 500_000 },
  { label: '₹10L', value: 1_000_000 },
  { label: '₹25L', value: 2_500_000 },
];

export const HighValueSegregation: React.FC<HighValueSegregationProps> = ({
  transactions,
  thresholdAmount,
  onThresholdChange,
  onInspectTransaction,
  onQuickStatusChange,
}) => {
  const [layoutMode, setLayoutMode] = useState<'split' | 'tabs'>('split');
  const [activeTab, setActiveTab] = useState<'credits' | 'debits'>('debits');
  const [customInput, setCustomInput] = useState<string>(String(thresholdAmount));

  const highValueCredits = useMemo(
    () =>
      transactions
        .filter((t) => t.credit >= thresholdAmount)
        .sort((a, b) => b.credit - a.credit),
    [transactions, thresholdAmount],
  );

  const highValueDebits = useMemo(
    () =>
      transactions
        .filter((t) => t.debit >= thresholdAmount)
        .sort((a, b) => b.debit - a.debit),
    [transactions, thresholdAmount],
  );

  const hvCreditTotal = useMemo(
    () => highValueCredits.reduce((s, t) => s + t.credit, 0),
    [highValueCredits],
  );
  const hvDebitTotal = useMemo(
    () => highValueDebits.reduce((s, t) => s + t.debit, 0),
    [highValueDebits],
  );

  const handlePresetClick = (val: number) => {
    onThresholdChange(val);
    setCustomInput(String(val));
  };

  const handleCustomChange = (raw: string) => {
    setCustomInput(raw);
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onThresholdChange(parsed);
    } else if (cleaned === '') {
      onThresholdChange(0);
    }
  };

  const renderTable = (rows: NormalizedTransaction[], kind: 'credit' | 'debit') => {
    const isCredit = kind === 'credit';
    const total = isCredit ? hvCreditTotal : hvDebitTotal;

    return (
      <div className="flex flex-col rounded-lg border border-[#E2E8F0] bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-4 py-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-[#0F172A]">
              {isCredit ? 'High-Value Credits (Large Receipts)' : 'High-Value Debits (Large Payments)'}
            </h3>
            <p className="mt-0.5 text-xs text-[#64748B] tabular-nums">
              {rows.length} transactions · Total:{' '}
              <span
                className={`font-mono font-semibold ${
                  isCredit ? 'text-[#16A34A]' : 'text-[#DC2626]'
                }`}
              >
                {formatINR(total)}
              </span>
            </p>
          </div>
          <span className="text-xs font-medium text-[#64748B]">
            {isCredit ? 'Remitter / Source' : 'Beneficiary / Mode'}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[#64748B]">
            No {isCredit ? 'credit receipts' : 'debit payments'} meet or exceed{' '}
            <span className="font-mono font-medium text-[#0F172A]">
              {formatINR(thresholdAmount, false)}
            </span>
            . Lower the threshold filter to inspect smaller entries.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]/80 text-[#334155]">
                  <th className="px-3.5 py-2 font-semibold whitespace-nowrap">Date</th>
                  <th className="px-3.5 py-2 font-semibold">
                    {isCredit ? 'Remitter / Source' : 'Beneficiary / Payee'}
                  </th>
                  <th className="px-3.5 py-2 font-semibold whitespace-nowrap">Mode</th>
                  <th className="px-3.5 py-2 font-semibold whitespace-nowrap">Ref No</th>
                  <th className="px-3.5 py-2 text-right font-semibold whitespace-nowrap">
                    {isCredit ? 'Credit (₹)' : 'Debit (₹)'}
                  </th>
                  <th className="px-3.5 py-2 font-semibold whitespace-nowrap">Audit Tag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]/70">
                {rows.map((tx) => {
                  const cfg = AUDIT_STATUS_CONFIG[tx.auditStatus];
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => onInspectTransaction(tx)}
                      className={`cursor-pointer transition-colors ${
                        tx.hasBalanceDiscrepancy
                          ? 'bg-red-50/75 hover:bg-red-50'
                          : 'hover:bg-[#DBEAFE]/25'
                      }`}
                    >
                      <td className="px-3.5 py-2 font-mono text-[#334155] whitespace-nowrap tabular-nums">
                        {tx.date}
                      </td>
                      <td className="max-w-[230px] px-3.5 py-2">
                        <div className="truncate font-medium text-[#0F172A]" title={tx.counterparty}>
                          {tx.counterparty}
                        </div>
                        <div className="truncate text-[11px] text-[#64748B]" title={tx.narration}>
                          {tx.narration}
                        </div>
                      </td>
                      <td className="px-3.5 py-2 font-mono text-[11px] font-medium text-[#334155] whitespace-nowrap">
                        {tx.paymentMode}
                      </td>
                      <td
                        className="max-w-[110px] truncate px-3.5 py-2 font-mono text-[11px] text-[#64748B]"
                        title={tx.refNo}
                      >
                        {tx.refNo}
                      </td>
                      <td
                        className={`px-3.5 py-2 text-right font-mono font-semibold whitespace-nowrap tabular-nums ${
                          isCredit ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }`}
                      >
                        {formatINR(isCredit ? tx.credit : tx.debit)}
                      </td>
                      <td
                        className="px-3.5 py-2 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          aria-label={`Audit status for transaction ${tx.rowIndex}`}
                          value={tx.auditStatus}
                          onChange={(e) =>
                            onQuickStatusChange(tx.id, e.target.value as AuditStatus)
                          }
                          className={`rounded border px-2 py-1 text-[11px] font-medium focus:border-[#3B82F6] focus:outline-none ${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass}`}
                        >
                          <option value="none">Untagged</option>
                          <option value="verified">Verified</option>
                          <option value="needs_clarification">Clarify</option>
                          <option value="capital_expense">CapEx</option>
                          <option value="high_priority">Priority</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <section aria-label="High-Value Transaction Segregation Engine" className="space-y-4">
      {/* Threshold Filter Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#E2E8F0] bg-white px-4 py-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
            <SlidersHorizontal className="h-4 w-4 text-[#1D4ED8]" />
            <span>Threshold Amount Filter</span>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#F1F5F9] p-1">
            {PRESET_THRESHOLDS.map((preset) => {
              const active = thresholdAmount === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handlePresetClick(preset.value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#1D4ED8] text-white shadow-xs'
                      : 'text-[#334155] hover:bg-white hover:text-[#0F172A]'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-[#64748B]">Custom ₹</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label="Custom high-value threshold amount in INR"
              value={customInput}
              onChange={(e) => handleCustomChange(e.target.value)}
              className="w-32 rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1.5 font-mono text-xs text-[#0F172A] tabular-nums focus:border-[#3B82F6] focus:outline-none"
            />
          </div>
        </div>

        {/* Layout Mode Switcher */}
        <div className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] p-1">
          <button
            type="button"
            onClick={() => setLayoutMode('split')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              layoutMode === 'split'
                ? 'bg-[#1D4ED8] text-white shadow-xs'
                : 'text-[#334155] hover:bg-white hover:text-[#0F172A]'
            }`}
          >
            <Columns2 className="h-3.5 w-3.5" />
            <span>Split View</span>
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('tabs')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              layoutMode === 'tabs'
                ? 'bg-[#1D4ED8] text-white shadow-xs'
                : 'text-[#334155] hover:bg-white hover:text-[#0F172A]'
            }`}
          >
            <LayoutList className="h-3.5 w-3.5" />
            <span>Tabbed View</span>
          </button>
        </div>
      </div>

      {layoutMode === 'split' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {renderTable(highValueCredits, 'credit')}
          {renderTable(highValueDebits, 'debit')}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('debits')}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'debits'
                  ? 'bg-[#1D4ED8] text-white shadow-xs'
                  : 'border border-[#E2E8F0] bg-white text-[#334155] hover:text-[#0F172A]'
              }`}
            >
              High-Value Debits ({highValueDebits.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('credits')}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'credits'
                  ? 'bg-[#1D4ED8] text-white shadow-xs'
                  : 'border border-[#E2E8F0] bg-white text-[#334155] hover:text-[#0F172A]'
              }`}
            >
              High-Value Credits ({highValueCredits.length})
            </button>
          </div>

          {activeTab === 'credits'
            ? renderTable(highValueCredits, 'credit')
            : renderTable(highValueDebits, 'debit')}
        </div>
      )}
    </section>
  );
};
