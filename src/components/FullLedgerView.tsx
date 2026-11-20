import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Code2,
  MessageSquare,
  Search,
} from 'lucide-react';
import {
  AUDIT_STATUS_CONFIG,
  type AuditStatus,
  type NormalizedTransaction,
} from '../types/statement';
import { formatINR } from '../utils/indianFormat';

interface FullLedgerViewProps {
  transactions: NormalizedTransaction[];
  onInspectTransaction: (tx: NormalizedTransaction) => void;
  onQuickStatusChange: (txId: string, status: AuditStatus) => void;
}

type TypeFilter = 'all' | 'credits' | 'debits' | 'cheques' | 'discrepancies';
type StatusFilter = 'all' | AuditStatus;

const PAGE_SIZE = 75;

export const FullLedgerView: React.FC<FullLedgerViewProps> = ({
  transactions,
  onInspectTransaction,
  onQuickStatusChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showDebugInspector, setShowDebugInspector] = useState(false);
  const [page, setPage] = useState(1);

  const discrepancyCount = useMemo(
    () => transactions.filter((t) => t.hasBalanceDiscrepancy).length,
    [transactions],
  );

  const autoCorrectedCount = useMemo(
    () => transactions.filter((t) => t.debugInfo?.autoCorrectedSwap).length,
    [transactions],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (typeFilter === 'credits' && tx.credit <= 0) return false;
      if (typeFilter === 'debits' && tx.debit <= 0) return false;
      if (typeFilter === 'cheques' && !tx.isChequeCleared) return false;
      if (typeFilter === 'discrepancies' && !tx.hasBalanceDiscrepancy) return false;

      if (statusFilter !== 'all' && tx.auditStatus !== statusFilter) return false;

      if (!q) return true;
      return (
        tx.narration.toLowerCase().includes(q) ||
        tx.counterparty.toLowerCase().includes(q) ||
        tx.refNo.toLowerCase().includes(q) ||
        tx.auditNote.toLowerCase().includes(q) ||
        tx.date.toLowerCase().includes(q) ||
        (tx.debugInfo?.rawRowText.toLowerCase().includes(q) ?? false)
      );
    });
  }, [transactions, typeFilter, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const handleFilterChange = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <section aria-label="Full Normalized Corporate Statement Ledger" className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] bg-white px-4 py-3.5 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleFilterChange(() => setSearchQuery(e.target.value))}
              placeholder="Search narration, counterparty, UTR/cheque ref, or notes..."
              aria-label="Search full statement ledger"
              className="w-full rounded-lg border border-[#E2E8F0] bg-white py-2 pr-3 pl-9 text-xs text-[#0F172A] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#F1F5F9] p-1">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'credits', label: 'Credits' },
                { id: 'debits', label: 'Debits' },
                { id: 'cheques', label: 'Cheques' },
                ...(discrepancyCount > 0
                  ? [{ id: 'discrepancies' as const, label: `Mismatch (${discrepancyCount})` }]
                  : []),
              ] as Array<{ id: TypeFilter; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleFilterChange(() => setTypeFilter(opt.id))}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  typeFilter === opt.id
                    ? 'bg-[#1D4ED8] text-white shadow-xs'
                    : 'text-[#334155] hover:bg-white hover:text-[#0F172A]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by audit status"
            value={statusFilter}
            onChange={(e) =>
              handleFilterChange(() => setStatusFilter(e.target.value as StatusFilter))
            }
            className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-medium text-[#334155] focus:border-[#3B82F6] focus:outline-none"
          >
            <option value="all">All Audit Statuses</option>
            <option value="verified">Verified</option>
            <option value="needs_clarification">Needs Clarification</option>
            <option value="capital_expense">Capital Expense</option>
            <option value="high_priority">High Priority</option>
            <option value="none">Untagged</option>
          </select>

          <button
            type="button"
            aria-pressed={showDebugInspector}
            onClick={() => setShowDebugInspector((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              showDebugInspector
                ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white shadow-xs'
                : 'border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>Raw vs. Parsed Debug Inspector</span>
          </button>
        </div>

        <div className="text-xs text-[#64748B] tabular-nums whitespace-nowrap">
          {filtered.length} of {transactions.length} transactions
        </div>
      </div>

      {/* Debug Inspector Comparison Banner */}
      {showDebugInspector && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#3B82F6]/35 bg-[#DBEAFE]/45 px-4 py-2.5 text-xs text-[#334155]">
          <div>
            <span className="font-semibold text-[#0F172A]">Raw vs. Parsed Debug Inspector Active:</span>{' '}
            Comparing source extracted strings against strict Indian decimal parsing and running-balance verification.
          </div>
          <div className="flex items-center gap-4 font-mono text-[11px] tabular-nums">
            <span className="text-[#0F172A]">Rows: {filtered.length}</span>
            <span className="font-semibold text-[#2563EB]">
              Auto-Corrected: {autoCorrectedCount}
            </span>
            <span
              className={`font-semibold ${
                discrepancyCount > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'
              }`}
            >
              Mismatches: {discrepancyCount}
            </span>
          </div>
        </div>
      )}

      {/* Ledger Table */}
      <div className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs">
        {pageRows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[#64748B]">
            No transactions match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]/80 text-[#334155]">
                  <th className="px-3.5 py-2 font-semibold whitespace-nowrap">Date</th>
                  <th className="px-3.5 py-2 font-semibold">Narration & Counterparty</th>
                  <th className="px-3.5 py-2 font-semibold whitespace-nowrap">Mode</th>
                  <th className="px-3.5 py-2 font-semibold whitespace-nowrap">Chq / Ref No</th>
                  {showDebugInspector && (
                    <>
                      <th className="border-l border-[#E2E8F0] bg-[#DBEAFE]/35 px-3.5 py-2 font-semibold whitespace-nowrap text-[#0F172A]">
                        Raw Extracted Line / Cells
                      </th>
                      <th className="bg-[#DBEAFE]/35 px-3.5 py-2 font-semibold whitespace-nowrap text-[#0F172A]">
                        Raw Dr / Cr / Bal
                      </th>
                      <th className="border-r border-[#E2E8F0] bg-[#DBEAFE]/35 px-3.5 py-2 font-semibold whitespace-nowrap text-[#0F172A]">
                        Classifier & Math Check
                      </th>
                    </>
                  )}
                  <th className="px-3.5 py-2 text-right font-semibold whitespace-nowrap">
                    Debit (₹)
                  </th>
                  <th className="px-3.5 py-2 text-right font-semibold whitespace-nowrap">
                    Credit (₹)
                  </th>
                  <th className="px-3.5 py-2 text-right font-semibold whitespace-nowrap">
                    Balance (₹)
                  </th>
                  <th className="px-3.5 py-2 font-semibold whitespace-nowrap">Audit Tag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]/70">
                {pageRows.map((tx) => {
                  const cfg = AUDIT_STATUS_CONFIG[tx.auditStatus];
                  const dbg = tx.debugInfo;
                  const rowTintClass = tx.hasBalanceDiscrepancy
                    ? 'bg-red-50/75 hover:bg-red-50'
                    : tx.auditStatus === 'verified'
                      ? 'bg-green-50/35 hover:bg-green-50/60'
                      : 'hover:bg-[#DBEAFE]/25';
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => onInspectTransaction(tx)}
                      className={`cursor-pointer transition-colors ${rowTintClass}`}
                    >
                      <td className="px-3.5 py-2 font-mono text-[#334155] whitespace-nowrap tabular-nums">
                        <div className="flex items-center gap-1.5">
                          {tx.hasBalanceDiscrepancy && (
                            <AlertTriangle
                              className="h-3.5 w-3.5 shrink-0 text-[#DC2626]"
                              aria-label="Running balance mismatch detected"
                            />
                          )}
                          <span>{tx.date}</span>
                        </div>
                      </td>
                      <td className="max-w-[340px] px-3.5 py-2">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-[#0F172A]" title={tx.counterparty}>
                            {tx.counterparty}
                          </span>
                          {tx.auditNote && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1D4ED8] shrink-0"
                              title={tx.auditNote}
                            >
                              <MessageSquare className="h-3 w-3" />
                              <span>Note</span>
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-[#64748B]" title={tx.narration}>
                          {tx.narration}
                        </div>
                      </td>
                      <td className="px-3.5 py-2 font-mono text-[11px] text-[#334155] whitespace-nowrap">
                        {tx.paymentMode}
                      </td>
                      <td
                        className="max-w-[120px] truncate px-3.5 py-2 font-mono text-[11px] text-[#64748B]"
                        title={tx.refNo}
                      >
                        {tx.refNo}
                      </td>
                      {showDebugInspector && (
                        <>
                          <td
                            className="max-w-[320px] border-l border-[#E2E8F0] bg-[#F1F5F9]/60 px-3.5 py-2 font-mono text-[11px] text-[#334155]"
                            title={dbg?.rawRowText || ''}
                          >
                            <div className="line-clamp-2 break-all">
                              {dbg?.rawRowText || '—'}
                            </div>
                          </td>
                          <td className="bg-[#F1F5F9]/60 px-3.5 py-2 font-mono text-[11px] text-[#334155] whitespace-nowrap tabular-nums">
                            <div>
                              <span className="text-[#64748B]">Dr:</span>{' '}
                              <span className="text-[#DC2626]">{dbg?.rawDebitStr || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#64748B]">Cr:</span>{' '}
                              <span className="text-[#16A34A]">{dbg?.rawCreditStr || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#64748B]">Bal:</span>{' '}
                              <span className="text-[#0F172A]">{dbg?.rawBalanceStr || '—'}</span>
                            </div>
                          </td>
                          <td className="border-r border-[#E2E8F0] bg-[#F1F5F9]/60 px-3.5 py-2 font-mono text-[11px] whitespace-nowrap">
                            <div className="text-[#0F172A]">
                              {dbg?.classificationMethod || 'Unknown'}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                              {dbg?.autoCorrectedSwap && (
                                <span className="font-semibold text-[#2563EB]">
                                  Auto-Corrected Swap
                                </span>
                              )}
                              {tx.hasBalanceDiscrepancy && (
                                <span className="font-semibold text-[#DC2626]">
                                  Balance Mismatch
                                </span>
                              )}
                              {!dbg?.autoCorrectedSwap && !tx.hasBalanceDiscrepancy && (
                                <span className="font-medium text-[#16A34A]">Math Matched</span>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                      <td className="px-3.5 py-2 text-right font-mono font-medium text-[#DC2626] whitespace-nowrap tabular-nums">
                        {tx.debit > 0 ? formatINR(tx.debit) : '—'}
                      </td>
                      <td className="px-3.5 py-2 text-right font-mono font-medium text-[#16A34A] whitespace-nowrap tabular-nums">
                        {tx.credit > 0 ? formatINR(tx.credit) : '—'}
                      </td>
                      <td className="px-3.5 py-2 text-right font-mono text-[#0F172A] whitespace-nowrap tabular-nums">
                        {tx.balance !== null ? formatINR(tx.balance) : '—'}
                      </td>
                      <td
                        className="px-3.5 py-2 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          aria-label={`Audit tag for row ${tx.rowIndex}`}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#E2E8F0] px-4 py-3 text-xs text-[#64748B]">
            <span className="tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1.5 font-medium text-[#334155] transition-colors hover:bg-[#F1F5F9] disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1.5 font-medium text-[#334155] transition-colors hover:bg-[#F1F5F9] disabled:opacity-40"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
