import React, { useMemo, useState } from 'react';
import { FileCheck2, Search } from 'lucide-react';
import {
  AUDIT_STATUS_CONFIG,
  type AuditStatus,
  type ChequeCategory,
  type NormalizedTransaction,
} from '../types/statement';
import { formatINR } from '../utils/indianFormat';

interface ChequeRegisterViewProps {
  transactions: NormalizedTransaction[];
  onInspectTransaction: (tx: NormalizedTransaction) => void;
  onQuickStatusChange: (txId: string, status: AuditStatus) => void;
}

type CategoryFilter = 'all' | ChequeCategory;

export const ChequeRegisterView: React.FC<ChequeRegisterViewProps> = ({
  transactions,
  onInspectTransaction,
  onQuickStatusChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const allCheques = useMemo(
    () => transactions.filter((t) => t.isChequeCleared),
    [transactions],
  );

  const filteredCheques = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allCheques.filter((tx) => {
      if (categoryFilter !== 'all' && tx.chequeCategory !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      const payee = (tx.chequePayee || '').toLowerCase();
      const chqNo = (tx.chequeNumber || '').toLowerCase();
      const narr = tx.narration.toLowerCase();
      return payee.includes(q) || chqNo.includes(q) || narr.includes(q);
    });
  }, [allCheques, categoryFilter, searchQuery]);

  const totalClearedValue = useMemo(
    () => allCheques.reduce((sum, tx) => sum + tx.debit, 0),
    [allCheques],
  );

  const filteredTotalValue = useMemo(
    () => filteredCheques.reduce((sum, tx) => sum + tx.debit, 0),
    [filteredCheques],
  );

  // Top Payees by Cheque Value aggregation
  const topPayees = useMemo(() => {
    const map = new Map<string, { payee: string; count: number; total: number }>();
    for (const tx of allCheques) {
      const key = (tx.chequePayee || 'Clearing Beneficiary').trim();
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.total += tx.debit;
      } else {
        map.set(key, { payee: key, count: 1, total: tx.debit });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [allCheques]);

  const categories: Array<{ id: CategoryFilter; label: string }> = [
    { id: 'all', label: `All Cheques (${allCheques.length})` },
    {
      id: 'Outstation / Local Clearing',
      label: 'Outstation / Local Clearing',
    },
    {
      id: 'Self / Cash Withdrawal',
      label: 'Self / Cash',
    },
    {
      id: 'Intra-Bank Transfer',
      label: 'Intra-Bank Transfer',
    },
  ];

  return (
    <section aria-label="Issued and Cleared Cheque Audit Register" className="space-y-5">
      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#E2E8F0] bg-white px-4 py-3.5 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Payee Name or Cheque Number..."
              aria-label="Search cleared cheques by payee name or cheque number"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white py-2 pr-3 pl-9 text-xs text-[#0F172A] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#F1F5F9] p-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  categoryFilter === cat.id
                    ? 'bg-[#1D4ED8] text-white shadow-xs'
                    : 'text-[#334155] hover:bg-white hover:text-[#0F172A]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-[#64748B] tabular-nums">
          Showing <span className="font-semibold text-[#0F172A]">{filteredCheques.length}</span>{' '}
          cheques · Total:{' '}
          <span className="font-mono font-semibold text-[#0F172A]">
            {formatINR(filteredTotalValue)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Main Cheque Register Table */}
        <div className="xl:col-span-8 rounded-lg border border-[#E2E8F0] bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-[#1D4ED8]" />
              <h3 className="font-display text-sm font-semibold text-[#0F172A]">
                Issued & Cleared Cheque Register
              </h3>
            </div>
            <span className="text-xs text-[#64748B]">
              CTS / Inward Clearing & Intra-Bank Instruments
            </span>
          </div>

          {filteredCheques.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[#64748B]">
              {allCheques.length === 0
                ? 'No cleared cheque debit entries were detected in this statement.'
                : 'No cleared cheques match your current search or category filter.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]/80 text-[#334155]">
                    <th className="px-3.5 py-2 font-semibold whitespace-nowrap">Cleared Date</th>
                    <th className="px-3.5 py-2 font-semibold whitespace-nowrap">Cheque No</th>
                    <th className="px-3.5 py-2 font-semibold">Payee / Beneficiary</th>
                    <th className="px-3.5 py-2 font-semibold whitespace-nowrap">
                      Clearing Category
                    </th>
                    <th className="px-3.5 py-2 text-right font-semibold whitespace-nowrap">
                      Amount (₹)
                    </th>
                    <th className="px-3.5 py-2 font-semibold whitespace-nowrap">Audit Tag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]/70">
                  {filteredCheques.map((tx) => {
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
                        <td className="px-3.5 py-2 font-mono font-semibold text-[#1D4ED8] whitespace-nowrap">
                          {tx.chequeNumber}
                        </td>
                        <td className="max-w-[240px] px-3.5 py-2">
                          <div
                            className="truncate font-medium text-[#0F172A]"
                            title={tx.chequePayee || tx.counterparty}
                          >
                            {tx.chequePayee || tx.counterparty}
                          </div>
                          <div className="truncate text-[11px] text-[#64748B]" title={tx.narration}>
                            {tx.narration}
                          </div>
                        </td>
                        <td className="px-3.5 py-2 text-[#334155] whitespace-nowrap">
                          {tx.chequeCategory}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono font-semibold text-[#0F172A] whitespace-nowrap tabular-nums">
                          {formatINR(tx.debit)}
                        </td>
                        <td
                          className="px-3.5 py-2 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            aria-label={`Audit status for cheque ${tx.chequeNumber}`}
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

        {/* Top Payees by Cheque Value Summary */}
        <div className="xl:col-span-4 rounded-lg border border-[#E2E8F0] bg-white shadow-xs">
          <div className="border-b border-[#E2E8F0] px-4 py-3">
            <h3 className="font-display text-sm font-semibold text-[#0F172A]">
              Top Payees by Cheque Value
            </h3>
            <p className="mt-0.5 text-xs text-[#64748B]">
              Aggregated outflow concentration across {allCheques.length} cleared instruments
            </p>
          </div>

          {topPayees.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-[#64748B]">
              No payee concentration data available.
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0]/70">
              {topPayees.map((item, idx) => {
                const share =
                  totalClearedValue > 0 ? ((item.total / totalClearedValue) * 100).toFixed(1) : '0.0';
                return (
                  <div
                    key={item.payee}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-[#DBEAFE]/20"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-[#64748B] tabular-nums">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        <button
                          type="button"
                          onClick={() => setSearchQuery(item.payee)}
                          className="truncate text-left text-xs font-semibold text-[#0F172A] hover:text-[#1D4ED8] hover:underline"
                          title={`Filter register by ${item.payee}`}
                        >
                          {item.payee}
                        </button>
                      </div>
                      <div className="mt-1 flex items-center gap-2 pl-6 text-[11px] text-[#64748B] tabular-nums">
                        <span>
                          {item.count} {item.count === 1 ? 'cheque' : 'cheques'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{share}% of cheque outflow</span>
                      </div>
                    </div>
                    <div className="font-mono text-xs font-semibold text-[#0F172A] whitespace-nowrap tabular-nums">
                      {formatINR(item.total)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
