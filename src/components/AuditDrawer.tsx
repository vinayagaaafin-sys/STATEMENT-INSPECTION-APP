import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  AUDIT_STATUS_CONFIG,
  type AuditStatus,
  type NormalizedTransaction,
} from '../types/statement';
import { formatINR } from '../utils/indianFormat';

interface AuditDrawerProps {
  transaction: NormalizedTransaction | null;
  onClose: () => void;
  onSaveAudit: (txId: string, status: AuditStatus, note: string) => void;
}

const STATUS_OPTIONS: AuditStatus[] = [
  'none',
  'verified',
  'needs_clarification',
  'capital_expense',
  'high_priority',
];

export const AuditDrawer: React.FC<AuditDrawerProps> = ({
  transaction,
  onClose,
  onSaveAudit,
}) => {
  const [status, setStatus] = useState<AuditStatus>('none');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (transaction) {
      setStatus(transaction.auditStatus);
      setNote(transaction.auditNote);
    }
  }, [transaction]);

  if (!transaction) return null;

  const isCredit = transaction.credit > 0;
  const amount = isCredit ? transaction.credit : transaction.debit;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#0F172A]/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-drawer-title"
    >
      <div className="flex h-full w-full max-w-lg flex-col border-l border-[#E2E8F0] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#1E293B] px-6 py-4 text-white">
          <div>
            <h2 id="audit-drawer-title" className="font-display text-base font-semibold text-white">
              Transaction Audit & Tagging
            </h2>
            <p className="text-xs text-slate-300">
              Source Row {transaction.rowIndex} · {transaction.date}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close audit drawer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#475569] bg-[#334155] text-slate-200 transition-colors hover:bg-[#475569] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Amount & Polarity Header */}
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F1F5F9]/75 p-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-xs font-medium text-[#64748B]">
                {isCredit ? 'Credit Receipt' : 'Debit Payment'} · {transaction.paymentMode}
              </span>
              <span
                className={`font-mono text-xl font-semibold tabular-nums ${
                  isCredit ? 'text-[#16A34A]' : 'text-[#DC2626]'
                }`}
              >
                {isCredit ? '+' : '-'}
                {formatINR(amount)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#E2E8F0] pt-3 text-xs">
              <div>
                <div className="text-[#64748B]">Counterparty</div>
                <div className="mt-0.5 font-medium text-[#0F172A]">{transaction.counterparty}</div>
              </div>
              <div>
                <div className="text-[#64748B]">Ref / Instrument No</div>
                <div className="mt-0.5 font-mono text-[#0F172A]">{transaction.refNo}</div>
              </div>
              <div>
                <div className="text-[#64748B]">Value Date</div>
                <div className="mt-0.5 font-mono text-[#0F172A]">{transaction.valueDate}</div>
              </div>
              <div>
                <div className="text-[#64748B]">Running Balance</div>
                <div className="mt-0.5 font-mono text-[#0F172A] tabular-nums">
                  {transaction.balance !== null ? formatINR(transaction.balance) : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* Narration */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#334155]">Normalized Narration</span>
              {transaction.rawMergedRows > 1 && (
                <span className="text-xs text-[#64748B]">
                  Merged from {transaction.rawMergedRows} lines
                </span>
              )}
            </div>
            <div className="mt-1.5 rounded-lg border border-[#E2E8F0] bg-white p-3 font-mono text-xs leading-relaxed text-[#0F172A]">
              {transaction.narration}
            </div>
          </div>

          {/* Raw vs. Parsed Extraction Trace */}
          {transaction.debugInfo && (
            <div className="rounded-lg border border-[#3B82F6]/30 bg-[#DBEAFE]/25 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#0F172A]">
                  Raw vs. Parsed Extraction Trace
                </span>
                {transaction.debugInfo.autoCorrectedSwap && (
                  <span className="text-[11px] font-semibold text-[#2563EB]">
                    Math Auto-Corrected
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px]">
                <div className="rounded border border-[#E2E8F0] bg-white p-2">
                  <div className="text-[#64748B]">Raw Debit</div>
                  <div className="mt-0.5 truncate text-[#DC2626]" title={transaction.debugInfo.rawDebitStr}>
                    {transaction.debugInfo.rawDebitStr || '—'}
                  </div>
                </div>
                <div className="rounded border border-[#E2E8F0] bg-white p-2">
                  <div className="text-[#64748B]">Raw Credit</div>
                  <div className="mt-0.5 truncate text-[#16A34A]" title={transaction.debugInfo.rawCreditStr}>
                    {transaction.debugInfo.rawCreditStr || '—'}
                  </div>
                </div>
                <div className="rounded border border-[#E2E8F0] bg-white p-2">
                  <div className="text-[#64748B]">Raw Balance</div>
                  <div className="mt-0.5 truncate text-[#0F172A]" title={transaction.debugInfo.rawBalanceStr}>
                    {transaction.debugInfo.rawBalanceStr || '—'}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 text-[11px] text-[#334155]">
                <span className="font-medium text-[#0F172A]">Classifier:</span>{' '}
                <span className="font-mono">{transaction.debugInfo.classificationMethod}</span>
              </div>
              {transaction.debugInfo.rawRowText && (
                <div className="mt-2 rounded border border-[#E2E8F0] bg-white p-2 font-mono text-[11px] break-all text-[#334155]">
                  {transaction.debugInfo.rawRowText}
                </div>
              )}
            </div>
          )}

          {/* Cheque Detection Details */}
          {transaction.isChequeCleared && (
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F1F5F9]/75 p-4">
              <div className="text-xs font-semibold text-[#0F172A]">Cleared Cheque Extraction</div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[#64748B]">Cheque Number</span>
                  <div className="mt-0.5 font-mono font-medium text-[#1D4ED8]">
                    {transaction.chequeNumber}
                  </div>
                </div>
                <div>
                  <span className="text-[#64748B]">Category</span>
                  <div className="mt-0.5 font-medium text-[#0F172A]">
                    {transaction.chequeCategory}
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-[#64748B]">Cleaned Payee Name</span>
                  <div className="mt-0.5 font-medium text-[#0F172A]">
                    {transaction.chequePayee}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Audit Status Selection */}
          <div>
            <div className="text-xs font-semibold text-[#334155]">Auditor Classification</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const cfg = AUDIT_STATUS_CONFIG[opt];
                const active = status === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setStatus(opt)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                      active
                        ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white shadow-xs'
                        : 'border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Auditor Notes */}
          <div>
            <label htmlFor="audit-note-input" className="block text-xs font-semibold text-[#334155]">
              Auditor Remarks & Voucher Reference
            </label>
            <textarea
              id="audit-note-input"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Enter invoice #, GST/TDS observation, approval reference, or query for finance team..."
              className="mt-1.5 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#E2E8F0] bg-[#F1F5F9]/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#334155] transition-colors hover:bg-[#F1F5F9]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSaveAudit(transaction.id, status, note.trim());
              onClose();
            }}
            className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1E40AF]"
          >
            Save Audit Tag
          </button>
        </div>
      </div>
    </div>
  );
};
