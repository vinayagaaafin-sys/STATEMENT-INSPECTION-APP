import React, { useMemo, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { detectHeaderAndMapping } from '../engine/bankIntelligence';
import type { ColumnMapping, ColumnRole, ParsedWorkbookRaw } from '../types/statement';

interface ColumnMapperModalProps {
  isOpen: boolean;
  raw: ParsedWorkbookRaw;
  currentMapping: ColumnMapping;
  isFallbackRescue?: boolean;
  onClose: () => void;
  onApplyMapping: (newMapping: ColumnMapping) => void;
}

const ROLE_OPTIONS: Array<{ value: ColumnRole; label: string }> = [
  { value: 'date', label: 'Date' },
  { value: 'valueDate', label: 'Value Date' },
  { value: 'narration', label: 'Narration' },
  { value: 'refNo', label: 'Cheque/Ref' },
  { value: 'debit', label: 'Debit' },
  { value: 'credit', label: 'Credit' },
  { value: 'amount', label: 'Single Amount' },
  { value: 'drcr', label: 'Dr / Cr Flag' },
  { value: 'balance', label: 'Balance' },
  { value: 'ignore', label: 'Ignore' },
];

export const ColumnMapperModal: React.FC<ColumnMapperModalProps> = ({
  isOpen,
  raw,
  currentMapping,
  isFallbackRescue = false,
  onClose,
  onApplyMapping,
}) => {
  const initialHeaderIdx = currentMapping.headerRowIndex >= 0 ? currentMapping.headerRowIndex : 0;
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(initialHeaderIdx);
  const [roles, setRoles] = useState<ColumnRole[]>(() => {
    if (currentMapping.roles.length > 0) return currentMapping.roles;
    const rowCols = raw.rows[initialHeaderIdx] || raw.rows[0] || [];
    return rowCols.map(() => 'ignore' as ColumnRole);
  });

  const maxColCount = useMemo(() => {
    const sample = raw.rows.slice(0, 30);
    return sample.reduce((max, r) => Math.max(max, r.length), 1);
  }, [raw.rows]);

  if (!isOpen) return null;

  const candidateRows = raw.rows.slice(0, Math.min(raw.rows.length, 40));
  const selectedHeaderRow =
    headerRowIndex >= 0
      ? raw.rows[headerRowIndex] || []
      : Array.from({ length: maxColCount }, (_, i) => `Column ${i + 1}`);

  // Show the first 10 raw extracted rows below header (or from row 0 if headerless)
  const previewStart = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  const previewRows = raw.rows.slice(previewStart, previewStart + 10);

  const handleHeaderRowChange = (newIdx: number) => {
    setHeaderRowIndex(newIdx);
    if (newIdx >= 0) {
      const auto = detectHeaderAndMapping(raw.rows, newIdx);
      setRoles(auto.roles);
    } else {
      setRoles(Array.from({ length: maxColCount }, () => 'ignore' as ColumnRole));
    }
  };

  const handleRoleChange = (colIdx: number, role: ColumnRole) => {
    setRoles((prev) => {
      const next = Array.from({ length: maxColCount }, (_, i) => prev[i] || 'ignore');
      if (role !== 'ignore') {
        for (let i = 0; i < next.length; i++) {
          if (i !== colIdx && next[i] === role) {
            next[i] = 'ignore';
          }
        }
      }
      next[colIdx] = role;
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="column-mapper-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#334155] bg-[#1E293B] px-6 py-4 text-white">
          <div>
            <h2 id="column-mapper-title" className="font-display text-base font-semibold text-white">
              Manual Column Mapper & Raw Document Preview
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Inspect the first 10 raw extracted rows below and assign column dropdowns (Date,
              Narration, Cheque/Ref, Debit, Credit, Balance) to normalize this file.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close column mapper"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#475569] bg-[#334155] text-slate-200 transition-colors hover:bg-[#475569] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {isFallbackRescue && (
            <div className="flex items-start gap-2.5 rounded-lg border border-[#F59E0B]/45 bg-amber-50 px-4 py-3 text-xs text-[#D97706]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#D97706]" />
              <div>
                <span className="font-semibold">Non-standard layout detected:</span> Auto-detection
                could not identify date/amount columns automatically. Select the columns below and
                click <span className="font-semibold">Apply & Inspect</span>.
              </div>
            </div>
          )}

          {/* Header Row Selector */}
          <div>
            <label
              htmlFor="header-row-select"
              className="block text-xs font-semibold text-[#334155]"
            >
              Table Header Row (rows above this are treated as preamble)
            </label>
            <select
              id="header-row-select"
              value={headerRowIndex}
              onChange={(e) => handleHeaderRowChange(Number.parseInt(e.target.value, 10))}
              className="mt-1.5 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 font-mono text-xs text-[#0F172A] focus:border-[#3B82F6] focus:outline-none"
            >
              <option value={-1}>No Header Row (Parse all rows starting from Row 1)</option>
              {candidateRows.map((row, idx) => (
                <option key={idx} value={idx}>
                  Row {idx + 1}: {row.filter(Boolean).slice(0, 8).join(' | ') || '(Empty row)'}
                </option>
              ))}
            </select>
          </div>

          {/* 10-Row Interactive Preview Table with Column Dropdowns */}
          <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] shadow-xs">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]">
                  <th className="px-3 py-2.5 font-mono text-[11px] font-semibold text-[#64748B] whitespace-nowrap">
                    Row
                  </th>
                  {Array.from({ length: maxColCount }, (_, colIdx) => (
                    <th key={colIdx} className="min-w-[140px] px-2.5 py-2.5 align-top">
                      <div className="mb-1.5 truncate text-[11px] font-semibold text-[#334155]">
                        {selectedHeaderRow[colIdx] || `Column ${colIdx + 1}`}
                      </div>
                      <select
                        aria-label={`Map column ${colIdx + 1}`}
                        value={roles[colIdx] || 'ignore'}
                        onChange={(e) => handleRoleChange(colIdx, e.target.value as ColumnRole)}
                        className={`w-full rounded border px-2 py-1 text-xs font-medium focus:border-[#3B82F6] focus:outline-none ${
                          roles[colIdx] && roles[colIdx] !== 'ignore'
                            ? 'border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]'
                            : 'border-[#E2E8F0] bg-white text-[#64748B]'
                        }`}
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]/70">
                {previewRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={maxColCount + 1}
                      className="px-4 py-8 text-center text-xs text-[#64748B]"
                    >
                      No data rows below the selected header row.
                    </td>
                  </tr>
                ) : (
                  previewRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-[#DBEAFE]/20">
                      <td className="px-3 py-2 font-mono text-[11px] text-[#64748B] tabular-nums whitespace-nowrap">
                        {previewStart + rIdx + 1}
                      </td>
                      {Array.from({ length: maxColCount }, (_, colIdx) => (
                        <td
                          key={colIdx}
                          className="max-w-[200px] truncate px-2.5 py-2 font-mono text-[11px] text-[#0F172A]"
                          title={row[colIdx] || ''}
                        >
                          {row[colIdx] || <span className="text-[#64748B]/50">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
              onApplyMapping({
                headerRowIndex,
                headers: selectedHeaderRow,
                roles: Array.from({ length: maxColCount }, (_, idx) => roles[idx] || 'ignore'),
              });
              onClose();
            }}
            className="rounded-lg bg-[#1D4ED8] px-5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1E40AF]"
          >
            Apply & Inspect
          </button>
        </div>
      </div>
    </div>
  );
};
