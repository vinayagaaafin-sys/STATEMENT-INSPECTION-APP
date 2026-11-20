import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Cpu,
  FileSearch,
  FileText,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type { ForensicFieldStatus, PdfForensicsReport } from '../types/statement';
import { formatFileSize } from '../utils/indianFormat';

interface PdfForensicsViewProps {
  report: PdfForensicsReport | null;
  isAnalyzing: boolean;
  errorMessage: string | null;
  onFileSelected: (file: File) => void;
  onClearReport?: () => void;
}

const STATUS_BADGE: Record<
  ForensicFieldStatus,
  { label: string; badgeClass: string }
> = {
  verified: {
    label: 'Verified Bank Engine',
    badgeClass: 'border-[#16A34A]/35 bg-green-50 text-[#16A34A]',
  },
  clean: {
    label: 'Clean',
    badgeClass: 'border-[#E2E8F0] bg-[#F1F5F9] text-[#334155]',
  },
  warning: {
    label: 'Warning',
    badgeClass: 'border-[#F59E0B]/45 bg-amber-50 text-[#D97706]',
  },
  tampered: {
    label: 'Tamper Signal',
    badgeClass: 'border-[#DC2626]/35 bg-red-50 text-[#DC2626]',
  },
};

function formatDeltaSummary(seconds: number | null): string {
  if (seconds === null) return 'Not computable (single or missing date)';
  const abs = Math.abs(seconds);
  if (abs <= 120) return `${abs}s delta (within normal generation window)`;
  const mins = Math.floor(abs / 60);
  if (mins < 60) {
    return `${mins} min${mins > 1 ? 's' : ''} ${seconds >= 0 ? 'after' : 'before'} creation`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs} hr${hrs > 1 ? 's' : ''} ${mins % 60}m ${seconds >= 0 ? 'after' : 'before'} creation`;
  }
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ${hrs % 24}h ${seconds >= 0 ? 'after' : 'before'} creation`;
}

export const PdfForensicsView: React.FC<PdfForensicsViewProps> = ({
  report,
  isAnalyzing,
  errorMessage,
  onFileSelected,
  onClearReport,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0 || isAnalyzing) return;
    onFileSelected(files[0]);
  };

  const isOriginal = report?.verdict === 'original';

  return (
    <div className="space-y-6">
      {/* Dedicated Drag-and-Drop PDF Upload Zone */}
      <section
        aria-label="PDF Authenticity and Metadata Forensics Upload"
        className="rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-xs"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2E8F0] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-[#1D4ED8]" />
              <h2 className="font-display text-base font-bold text-[#0F172A]">
                PDF Authenticity &amp; Metadata Forensics Check
              </h2>
            </div>
            <p className="text-xs text-[#64748B]">
              Inspects internal Document Info dictionaries, XMP packets, generator signatures,
              creation/modification timestamp deltas, and incremental %%EOF revisions locally in
              browser memory.
            </p>
          </div>

          {report && onClearReport && (
            <button
              type="button"
              onClick={onClearReport}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Clear Forensics Report</span>
            </button>
          )}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors sm:flex-row sm:justify-between sm:text-left ${
            isDragging
              ? 'border-[#1D4ED8] bg-[#DBEAFE]/45'
              : 'border-[#E2E8F0] bg-[#F1F5F9]/45 hover:border-[#3B82F6]/60'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#3B82F6]/25 bg-[#DBEAFE]/60 text-[#1D4ED8]">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">
                {isAnalyzing
                  ? 'Inspecting PDF Metadata & Binary Structure...'
                  : 'Drop any Bank Statement PDF Here to Verify Authenticity'}
              </p>
              <p className="mt-0.5 text-xs text-[#64748B]">
                Supports standard and password-protected PDFs · 100% client-side inspection (no
                server upload)
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() => inputRef.current?.click()}
            className="mt-4 inline-flex min-h-[38px] shrink-0 items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1E40AF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6] disabled:cursor-not-allowed disabled:opacity-60 sm:mt-0 whitespace-nowrap"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>{isAnalyzing ? 'Analyzing PDF...' : 'Select PDF File'}</span>
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-[#DC2626]/35 bg-red-50 px-4 py-3 text-xs font-medium text-[#DC2626]"
          >
            {errorMessage}
          </div>
        )}
      </section>

      {/* Empty State — Zero Pre-Loaded Data */}
      {!report && !isAnalyzing && (
        <section className="rounded-lg border border-[#E2E8F0] bg-white p-8 text-center shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] text-[#334155]">
            <ShieldCheck className="h-6 w-6 text-[#1D4ED8]" />
          </div>
          <h3 className="mt-3 font-display text-sm font-semibold text-[#0F172A]">
            No PDF Metadata Inspected Yet
          </h3>
          <p className="mx-auto mt-1.5 max-w-xl text-xs leading-relaxed text-[#64748B]">
            Upload a bank statement PDF above (or upload a PDF in the main Statement Upload
            workspace) to automatically run tampering detection across Producer/Creator software,
            XMP timestamps, stripped headers, and incremental %%EOF saves.
          </p>
          <div className="mx-auto mt-6 grid max-w-3xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
            <div className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9]/60 p-3">
              <div className="text-xs font-semibold text-[#0F172A]">1. Software Fingerprinting</div>
              <p className="mt-1 text-[11px] text-[#64748B]">
                Flags iLovePDF, SmallPDF, Sejda, Acrobat Pro, Foxit, Canva, Word, and Quartz
                re-exports vs. core banking engines.
              </p>
            </div>
            <div className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9]/60 p-3">
              <div className="text-xs font-semibold text-[#0F172A]">2. Timestamp Delta Audit</div>
              <p className="mt-1 text-[11px] text-[#64748B]">
                Cross-checks CreationDate against ModDate in both Info dictionary and XMP packet
                for post-export modifications.
              </p>
            </div>
            <div className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9]/60 p-3">
              <div className="text-xs font-semibold text-[#0F172A]">3. Structural Integrity</div>
              <p className="mt-1 text-[11px] text-[#64748B]">
                Detects stripped metadata, missing CreationDate, and unsigned multi-%%EOF
                incremental edits.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Forensic Verdict & Detailed Breakdown */}
      {report && (
        <>
          {/* Verdict Classification Banner */}
          <section
            aria-label="PDF Authenticity Verdict"
            className={`rounded-lg border p-5 shadow-xs ${
              isOriginal
                ? 'border-[#16A34A]/40 bg-green-50/80'
                : 'border-[#DC2626]/40 bg-red-50/85'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                    isOriginal
                      ? 'border-[#16A34A]/30 bg-white text-[#16A34A]'
                      : 'border-[#DC2626]/30 bg-white text-[#DC2626]'
                  }`}
                >
                  {isOriginal ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <ShieldAlert className="h-5 w-5" />
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${
                        isOriginal
                          ? 'border-[#16A34A]/40 bg-[#16A34A] text-white'
                          : 'border-[#DC2626]/40 bg-[#DC2626] text-white'
                      }`}
                    >
                      {isOriginal ? 'Original Bank PDF ✅' : 'Modified PDF Warning ⚠️'}
                    </span>
                    <span className="font-mono text-xs font-semibold text-[#0F172A]">
                      {report.fileName}
                    </span>
                    <span className="text-xs text-[#64748B]">
                      ({formatFileSize(report.fileSizeBytes)})
                    </span>
                  </div>

                  {isOriginal ? (
                    <p className="mt-2 text-xs font-medium text-[#16A34A]">
                      No known PDF editing software, timestamp discrepancies, stripped generator
                      signatures, or unsigned incremental saves were detected in this PDF.
                    </p>
                  ) : (
                    <div className="mt-2.5 space-y-1.5">
                      <p className="text-xs font-semibold text-[#DC2626]">
                        {report.reasons.length} tampering / modification indicator
                        {report.reasons.length > 1 ? 's' : ''} detected:
                      </p>
                      <ul className="space-y-1">
                        {report.reasons.map((reason, idx) => (
                          <li
                            key={`${idx}-${reason}`}
                            className="flex items-start gap-2 text-xs text-[#0F172A]"
                          >
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D97706]" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-[#E2E8F0] bg-white px-3.5 py-2 text-right">
                <div className="text-[11px] font-medium text-[#64748B]">Forensic Status</div>
                <div
                  className={`mt-0.5 text-xs font-bold ${
                    isOriginal ? 'text-[#16A34A]' : 'text-[#DC2626]'
                  }`}
                >
                  {isOriginal ? 'AUTHENTICITY VERIFIED' : 'MANUAL AUDIT REQUIRED'}
                </div>
              </div>
            </div>
          </section>

          {/* 4-Card Metadata Summary Strip */}
          <section
            aria-label="PDF Metadata Summary"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-medium text-[#64748B]">
                <span>PDF Specification</span>
                <FileText className="h-4 w-4 text-[#1D4ED8]" />
              </div>
              <div className="mt-1.5 font-mono text-base font-bold text-[#0F172A]">
                {report.pdfVersion ? `PDF v${report.pdfVersion}` : 'Header Missing'}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#64748B]">
                <Lock className="h-3 w-3" />
                <span>
                  {report.isEncrypted ? 'Password / Encryption Dictionary Present' : 'Unencrypted Container'}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-medium text-[#64748B]">
                <span>Generator / Editor</span>
                <Cpu className="h-4 w-4 text-[#1D4ED8]" />
              </div>
              <div
                className={`mt-1.5 truncate text-sm font-bold ${
                  report.matchedEditingTools.length > 0
                    ? 'text-[#DC2626]'
                    : report.matchedBankingEngine
                      ? 'text-[#16A34A]'
                      : 'text-[#0F172A]'
                }`}
                title={report.producer || report.creator || 'Missing / Stripped'}
              >
                {report.matchedEditingTools.length > 0
                  ? report.matchedEditingTools.join(', ')
                  : report.matchedBankingEngine
                    ? report.matchedBankingEngine
                    : report.producer || report.creator || 'Missing / Stripped'}
              </div>
              <div className="mt-1 truncate text-[11px] text-[#64748B]" title={report.producer || ''}>
                Producer: {report.producer || 'Absent'}
              </div>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-medium text-[#64748B]">
                <span>Timestamp Consistency</span>
                <CalendarClock className="h-4 w-4 text-[#1D4ED8]" />
              </div>
              <div
                className={`mt-1.5 text-sm font-bold ${
                  report.timestampDeltaSeconds !== null &&
                  Math.abs(report.timestampDeltaSeconds) > 120
                    ? 'text-[#DC2626]'
                    : !report.creationDateRaw && !report.xmpCreateDate
                      ? 'text-[#D97706]'
                      : 'text-[#0F172A]'
                }`}
              >
                {report.creationDateFormatted || report.xmpCreateDate || 'CreationDate Missing'}
              </div>
              <div className="mt-1 text-[11px] text-[#64748B]">
                {formatDeltaSummary(report.timestampDeltaSeconds)}
              </div>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs font-medium text-[#64748B]">
                <span>EOF Trailers &amp; Signature</span>
                <ShieldCheck className="h-4 w-4 text-[#1D4ED8]" />
              </div>
              <div
                className={`mt-1.5 font-mono text-base font-bold ${
                  report.eofMarkerCount > 1 &&
                  !(report.hasDigitalSignature && report.eofMarkerCount === 2)
                    ? 'text-[#DC2626]'
                    : 'text-[#0F172A]'
                }`}
              >
                {report.eofMarkerCount} %%EOF Marker{report.eofMarkerCount === 1 ? '' : 's'}
              </div>
              <div className="mt-1 text-[11px] text-[#64748B]">
                {report.hasDigitalSignature
                  ? 'Digital Signature (/ByteRange) Present'
                  : 'No Embedded Digital Signature'}
              </div>
            </div>
          </section>

          {/* Forensic Breakdown Table: Raw Metadata vs. Risk Status */}
          <section
            aria-label="Forensic Breakdown Table"
            className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] px-5 py-3.5">
              <div>
                <h3 className="font-display text-sm font-semibold text-[#0F172A]">
                  Forensic Breakdown: Raw Metadata vs. Risk Status
                </h3>
                <p className="text-xs text-[#64748B]">
                  Side-by-side audit of Document Info Dictionary, XMP Packet fields, and binary
                  structural signals
                </p>
              </div>
              <span className="font-mono text-[11px] text-[#64748B]">
                {report.fields.length} forensic checks executed
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9]/80 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                    <th className="px-4 py-2.5">Metadata Field</th>
                    <th className="px-4 py-2.5">Raw Metadata (Info / XMP)</th>
                    <th className="px-4 py-2.5">Detection Rule Checked</th>
                    <th className="px-4 py-2.5">Risk Status</th>
                    <th className="px-4 py-2.5">Forensic Finding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {report.fields.map((row) => {
                    const badge = STATUS_BADGE[row.status];
                    return (
                      <tr
                        key={row.field}
                        className={
                          row.status === 'tampered'
                            ? 'bg-red-50/40'
                            : row.status === 'warning'
                              ? 'bg-amber-50/35'
                              : 'hover:bg-[#F1F5F9]/50'
                        }
                      >
                        <td className="px-4 py-3 font-semibold text-[#0F172A] whitespace-nowrap">
                          {row.field}
                        </td>
                        <td className="max-w-xs px-4 py-3 font-mono text-[11px] text-[#334155] break-words">
                          <div>{row.rawValue}</div>
                          {row.xmpValue && (
                            <div className="mt-1 text-[10px] text-[#64748B]">
                              XMP: {row.xmpValue}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#334155]">{row.ruleChecked}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${badge.badgeClass}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#0F172A]">{row.detail}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Raw Dictionary & XMP Packet Snapshot */}
          <section
            aria-label="Raw Document Info and XMP Packet Values"
            className="grid grid-cols-1 gap-4 lg:grid-cols-2"
          >
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                Document Info Dictionary (Raw)
              </h4>
              <dl className="mt-3 divide-y divide-[#E2E8F0] text-xs">
                <div className="flex justify-between gap-4 py-2">
                  <dt className="font-medium text-[#64748B]">Producer</dt>
                  <dd className="text-right font-mono text-[#0F172A] break-all">
                    {report.producer || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <dt className="font-medium text-[#64748B]">Creator</dt>
                  <dd className="text-right font-mono text-[#0F172A] break-all">
                    {report.creator || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <dt className="font-medium text-[#64748B]">CreationDate</dt>
                  <dd className="text-right font-mono text-[#0F172A] break-all">
                    {report.creationDateRaw || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <dt className="font-medium text-[#64748B]">ModDate</dt>
                  <dd className="text-right font-mono text-[#0F172A] break-all">
                    {report.modDateRaw || '—'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                Embedded XMP Packet Metadata
              </h4>
              <dl className="mt-3 divide-y divide-[#E2E8F0] text-xs">
                <div className="flex justify-between gap-4 py-2">
                  <dt className="font-medium text-[#64748B]">pdf:Producer</dt>
                  <dd className="text-right font-mono text-[#0F172A] break-all">
                    {report.xmpProducer || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <dt className="font-medium text-[#64748B]">xmp:CreatorTool</dt>
                  <dd className="text-right font-mono text-[#0F172A] break-all">
                    {report.xmpCreatorTool || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <dt className="font-medium text-[#64748B]">xmp:CreateDate</dt>
                  <dd className="text-right font-mono text-[#0F172A] break-all">
                    {report.xmpCreateDate || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <dt className="font-medium text-[#64748B]">xmp:ModifyDate</dt>
                  <dd className="text-right font-mono text-[#0F172A] break-all">
                    {report.xmpModifyDate || '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
