import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSearch,
  FileText,
  FileUp,
  Info,
  Landmark,
  LayoutDashboard,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Table2,
  UploadCloud,
} from 'lucide-react';
import { AuditDrawer } from './components/AuditDrawer';
import { ChequeRegisterView } from './components/ChequeRegisterView';
import { ColumnMapperModal } from './components/ColumnMapperModal';
import { CreditRiskBanner } from './components/CreditRiskBanner';
import { FullLedgerView } from './components/FullLedgerView';
import { HighValueSegregation } from './components/HighValueSegregation';
import { KpiSummaryStrip } from './components/KpiSummaryStrip';
import { LoanTrackerView } from './components/LoanTrackerView';
import { PasswordPromptModal } from './components/PasswordPromptModal';
import { PdfForensicsView } from './components/PdfForensicsView';
import { StatementDropzone } from './components/StatementDropzone';
import { StatementInspectionAuditView } from './components/StatementInspectionAuditView';
import { UnderwritingIntelligenceView } from './components/UnderwritingIntelligenceView';
import { exportCorporateAuditPack } from './engine/auditExport';
import { detectHeaderAndMapping } from './engine/bankIntelligence';
import { analyzeCreditUnderwriting } from './engine/creditUnderwritingEngine';
import {
  IncorrectPasswordError,
  PasswordRequiredError,
  readStatementFile,
} from './engine/fileReaders';
import { analyzeLoansAndBorrowings } from './engine/loanTrackerEngine';
import { analyzePdfForensics } from './engine/pdfForensicsReader';
import { exportInspectionPdfReport } from './engine/pdfReportExport';
import { normalizeStatement } from './engine/statementNormalizer';
import type {
  AnalyzedStatement,
  AuditStatus,
  ColumnMapping,
  NormalizedTransaction,
  ParsedWorkbookRaw,
  PdfForensicsReport,
} from './types/statement';
import { formatFileSize, formatINR } from './utils/indianFormat';

type WorkspaceView =
  | 'overview'
  | 'inspection-audit'
  | 'underwriting'
  | 'high-value'
  | 'loans'
  | 'cheques'
  | 'ledger'
  | 'pdf-forensics';

export default function App() {
  const [statement, setStatement] = useState<AnalyzedStatement | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<WorkspaceView>('overview');
  const [thresholdAmount, setThresholdAmount] = useState<number>(100_000);
  const [inspectedTxId, setInspectedTxId] = useState<string | null>(null);
  const [isMapperOpen, setIsMapperOpen] = useState(false);
  const [pendingFallbackRaw, setPendingFallbackRaw] = useState<{
    raw: ParsedWorkbookRaw;
    mapping: ColumnMapping;
  } | null>(null);

  // Encrypted document unlock state (password itself is NEVER stored in App state)
  const [pendingLockedFile, setPendingLockedFile] = useState<File | null>(null);
  const [lockedFileOrigin, setLockedFileOrigin] = useState<'statement' | 'forensics'>('statement');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockAttempts, setUnlockAttempts] = useState(0);

  // PDF Authenticity & Metadata Forensics state (empty until a PDF is uploaded)
  const [pdfForensicsReport, setPdfForensicsReport] = useState<PdfForensicsReport | null>(null);
  const [isAnalyzingForensics, setIsAnalyzingForensics] = useState(false);
  const [forensicsError, setForensicsError] = useState<string | null>(null);

  const fileReplaceInputRef = useRef<HTMLInputElement | null>(null);

  const processStatementFile = async (file: File, password?: string) => {
    const isPdf =
      file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    const raw = await readStatementFile(file, password);
    if (raw.rows.length < 1) {
      throw new Error(
        'No tabular transaction rows could be extracted from this file. Verify the statement is not an image-only scanned PDF or empty sheet.',
      );
    }
    const mapping = detectHeaderAndMapping(raw.rows);
    const analyzed = normalizeStatement(raw, mapping);
    if (analyzed.transactions.length === 0) {
      // Layer 4 Safety Net: Open interactive 10-row Manual Column Mapper instead of failing
      setPendingFallbackRaw({ raw, mapping });
      if (isPdf) {
        try {
          const forensics = await analyzePdfForensics(file, password);
          setPdfForensicsReport(forensics);
          setForensicsError(null);
        } catch {
          // Non-fatal for statement mapping fallback
        }
      } else {
        setPdfForensicsReport(null);
        setForensicsError(null);
      }
      return;
    }
    setPendingFallbackRaw(null);
    setStatement(analyzed);
    setActiveView('overview');
    setInspectedTxId(null);

    if (isPdf) {
      try {
        const forensics = await analyzePdfForensics(file, password);
        setPdfForensicsReport(forensics);
        setForensicsError(null);
      } catch {
        setPdfForensicsReport(null);
      }
    } else {
      setPdfForensicsReport(null);
      setForensicsError(null);
    }
  };

  const handleFileSelected = async (file: File) => {
    setIsParsing(true);
    setParseError(null);
    setUnlockError(null);
    setUnlockAttempts(0);
    try {
      await processStatementFile(file);
      setPendingLockedFile(null);
    } catch (err) {
      if (err instanceof PasswordRequiredError) {
        setLockedFileOrigin('statement');
        setPendingLockedFile(file);
        setUnlockError(null);
        setUnlockAttempts(0);
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to parse bank statement. Ensure the file is an unencrypted CSV, Excel, or text-based PDF.';
        setParseError(msg);
      }
    } finally {
      setIsParsing(false);
    }
  };

  const handleForensicsFileSelected = async (file: File, password?: string) => {
    setIsAnalyzingForensics(true);
    setForensicsError(null);
    try {
      const report = await analyzePdfForensics(file, password);
      setPdfForensicsReport(report);
      setPendingLockedFile(null);
    } catch (err) {
      if (err instanceof PasswordRequiredError) {
        setLockedFileOrigin('forensics');
        setPendingLockedFile(file);
        setUnlockError(null);
        setUnlockAttempts(0);
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to inspect PDF metadata. Ensure the file is a valid PDF document.';
        setForensicsError(msg);
      }
    } finally {
      setIsAnalyzingForensics(false);
    }
  };

  const handleUnlockSubmit = async (password: string) => {
    if (!pendingLockedFile) return;
    const lockedFile = pendingLockedFile;
    const origin = lockedFileOrigin;
    setIsUnlocking(true);
    setUnlockError(null);
    try {
      if (origin === 'forensics') {
        setIsAnalyzingForensics(true);
        const report = await analyzePdfForensics(lockedFile, password);
        setPdfForensicsReport(report);
        setForensicsError(null);
      } else {
        setIsParsing(true);
        await processStatementFile(lockedFile, password);
      }
      // Immediately close modal and clear file reference; password is never stored
      setPendingLockedFile(null);
      setUnlockError(null);
      setUnlockAttempts(0);
    } catch (err) {
      if (err instanceof IncorrectPasswordError || err instanceof PasswordRequiredError) {
        setUnlockError('Incorrect password. Please try again.');
        setUnlockAttempts((c) => c + 1);
      } else {
        // Non-password parse error after decryption: close modal and surface error clearly
        setPendingLockedFile(null);
        const msg =
          err instanceof Error
            ? err.message
            : origin === 'forensics'
              ? 'Failed to inspect decrypted PDF metadata.'
              : 'Failed to parse decrypted bank statement.';
        if (origin === 'forensics') {
          setForensicsError(msg);
        } else {
          setParseError(msg);
        }
      }
    } finally {
      setIsUnlocking(false);
      setIsParsing(false);
      setIsAnalyzingForensics(false);
    }
  };

  const handleApplyMapping = (newMapping: ColumnMapping) => {
    const sourceRaw = pendingFallbackRaw ? pendingFallbackRaw.raw : statement?.raw;
    if (!sourceRaw) return;
    const reAnalyzed = normalizeStatement(sourceRaw, newMapping, true);
    if (reAnalyzed.transactions.length === 0) {
      setParseError(
        'Selected column mapping yielded 0 valid transactions. Ensure at least Date and Debit/Credit/Amount columns are mapped.',
      );
      return;
    }
    setParseError(null);
    setPendingFallbackRaw(null);
    setStatement(reAnalyzed);
    setActiveView('overview');
  };

  const handleQuickStatusChange = (txId: string, status: AuditStatus) => {
    setStatement((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        transactions: prev.transactions.map((t) =>
          t.id === txId ? { ...t, auditStatus: status } : t,
        ),
      };
    });
  };

  const handleSaveAudit = (txId: string, status: AuditStatus, note: string) => {
    setStatement((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        transactions: prev.transactions.map((t) =>
          t.id === txId ? { ...t, auditStatus: status, auditNote: note } : t,
        ),
      };
    });
  };

  const handleResetWorkspace = () => {
    setStatement(null);
    setParseError(null);
    setInspectedTxId(null);
    setPdfForensicsReport(null);
    setForensicsError(null);
    setActiveView('overview');
  };

  const inspectedTransaction: NormalizedTransaction | null =
    statement && inspectedTxId
      ? statement.transactions.find((t) => t.id === inspectedTxId) || null
      : null;

  const loanSummary = useMemo(
    () =>
      statement
        ? analyzeLoansAndBorrowings(statement.transactions, thresholdAmount)
        : null,
    [statement, thresholdAmount],
  );

  const underwritingReport = useMemo(
    () =>
      statement && loanSummary
        ? analyzeCreditUnderwriting(statement, loanSummary)
        : null,
    [statement, loanSummary],
  );

  const navItems: Array<{
    id: WorkspaceView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'inspection-audit', label: 'Statement Inspection & Loan Audit', icon: FileText },
    { id: 'underwriting', label: 'Credit Risk & ABB', icon: ShieldAlert },
    { id: 'high-value', label: 'High-Value Audit', icon: ArrowUpDown },
    { id: 'loans', label: 'Loans & Borrowings', icon: Landmark },
    { id: 'cheques', label: 'Cheque Register', icon: FileCheck2 },
    { id: 'ledger', label: 'Full Ledger', icon: Table2 },
    { id: 'pdf-forensics', label: 'PDF Forensics Check', icon: FileSearch },
  ];

  const activeNavLabel =
    activeView === 'pdf-forensics'
      ? 'PDF Forensics Check'
      : statement
        ? navItems.find((i) => i.id === activeView)?.label || 'Overview'
        : 'Statement Ingestion';

  return (
    <div className="flex min-h-screen bg-[#F1F5F9] text-[#0F172A]">
      {/* Hidden input for replacing statement from toolbar */}
      <input
        ref={fileReplaceInputRef}
        type="file"
        accept=".csv,.xls,.xlsx,.pdf,.txt"
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            handleFileSelected(files[0]);
          }
          e.target.value = '';
        }}
      />

      {/* Desktop Slate Grey Sidebar Navigation (#1E293B / #334155) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[#334155] bg-[#1E293B] text-white lg:flex">
        <div className="flex h-14 items-center border-b border-[#334155] px-5">
          <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            LedgerVault
          </span>
        </div>

        <nav aria-label="Primary audit workspace navigation" className="flex-1 space-y-1 px-3 py-4">
          {!statement && (
            <button
              type="button"
              onClick={() => setActiveView('overview')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors whitespace-nowrap ${
                activeView !== 'pdf-forensics'
                  ? 'bg-[#1D4ED8] text-white shadow-xs'
                  : 'text-slate-300 hover:bg-[#334155] hover:text-white'
              }`}
            >
              <UploadCloud className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Statement Upload</span>
            </button>
          )}

          {navItems.map((item) => {
            const Icon = item.icon;
            const isAvailable = Boolean(statement) || item.id === 'pdf-forensics';
            const isActive = isAvailable && activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!isAvailable}
                onClick={() => isAvailable && setActiveView(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#1D4ED8] font-semibold text-white shadow-xs'
                    : isAvailable
                      ? 'text-slate-300 hover:bg-[#334155] hover:text-white'
                      : 'cursor-not-allowed text-slate-500 opacity-60'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {statement ? (
          <div className="border-t border-[#334155] p-4 space-y-3">
            <div>
              <div className="text-[11px] font-medium text-slate-400">Active Statement</div>
              <div className="mt-0.5 truncate text-xs font-semibold text-white" title={statement.metadata.detectedBank}>
                {statement.metadata.detectedBank}
              </div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-slate-300" title={statement.metadata.fileName}>
                {statement.metadata.fileName}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fileReplaceInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#475569] bg-[#334155] px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[#475569] whitespace-nowrap"
              >
                <FileUp className="h-3 w-3" />
                <span>Replace</span>
              </button>
              <button
                type="button"
                onClick={handleResetWorkspace}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#475569] bg-transparent px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-[#334155] hover:text-white whitespace-nowrap"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Clear</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-[#334155] p-4 text-[11px] leading-relaxed text-slate-400">
            Client-side financial audit console. Upload a statement file to unlock ledger views.
          </div>
        )}
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile & Tablet Slate Grey Top Bar (<lg) */}
        <header className="sticky top-0 z-30 border-b border-[#334155] bg-[#1E293B] text-white lg:hidden">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0">
              LedgerVault
            </span>

            <div className="flex items-center gap-2 shrink-0">
              {statement && loanSummary && underwritingReport ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      exportInspectionPdfReport(
                        statement,
                        loanSummary,
                        thresholdAmount,
                        underwritingReport,
                      )
                    }
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1E40AF] whitespace-nowrap shrink-0"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Inspection PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportCorporateAuditPack(statement, thresholdAmount)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#475569] bg-[#334155] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#475569] whitespace-nowrap shrink-0"
                    title="Export 5-Sheet Audit Pack (.xlsx)"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>.xlsx</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={isParsing}
                  onClick={() => fileReplaceInputRef.current?.click()}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <FileUp className="h-3.5 w-3.5" />
                  <span>Upload Statement</span>
                </button>
              )}
            </div>
          </div>

          {statement ? (
            <nav
              aria-label="Mobile workspace navigation"
              className="flex gap-1.5 overflow-x-auto border-t border-[#334155] bg-[#334155] px-4 py-2"
            >
              {navItems.map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-[#1D4ED8] text-white'
                        : 'text-slate-200 hover:bg-[#1E293B] hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          ) : (
            <nav
              aria-label="Mobile ingestion navigation"
              className="flex gap-1.5 overflow-x-auto border-t border-[#334155] bg-[#334155] px-4 py-2"
            >
              <button
                type="button"
                onClick={() => setActiveView('overview')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeView !== 'pdf-forensics'
                    ? 'bg-[#1D4ED8] text-white'
                    : 'text-slate-200 hover:bg-[#1E293B] hover:text-white'
                }`}
              >
                Statement Upload
              </button>
              <button
                type="button"
                onClick={() => setActiveView('pdf-forensics')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeView === 'pdf-forensics'
                    ? 'bg-[#1D4ED8] text-white'
                    : 'text-slate-200 hover:bg-[#1E293B] hover:text-white'
                }`}
              >
                PDF Forensics Check
              </button>
            </nav>
          )}
        </header>

        {/* Desktop Top Bar (lg+) — Breadcrumb + Primary Cobalt Blue Action */}
        <header className="sticky top-0 z-30 hidden h-14 items-center justify-between gap-8 border-b border-[#E2E8F0] bg-white px-6 lg:flex">
          <div className="flex items-center gap-2 text-xs text-[#64748B] whitespace-nowrap">
            <span className="font-medium text-[#334155]">LedgerVault</span>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-[#0F172A]">{activeNavLabel}</span>
            {statement?.metadata.accountNumber && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[#334155]">
                  A/C {statement.metadata.accountNumber}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {statement && loanSummary && underwritingReport ? (
              <>
                <button
                  type="button"
                  onClick={() => exportCorporateAuditPack(statement, thresholdAmount)}
                  className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-semibold text-[#334155] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5 text-[#334155]" />
                  <span>Export Audit Pack (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportInspectionPdfReport(
                      statement,
                      loanSummary,
                      thresholdAmount,
                      underwritingReport,
                    )
                  }
                  className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1E40AF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6] whitespace-nowrap shrink-0"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Download Inspection PDF</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isParsing}
                onClick={() => fileReplaceInputRef.current?.click()}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1E40AF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6] disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <FileUp className="h-3.5 w-3.5" />
                <span>Upload Statement</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6">
          {!statement && activeView === 'pdf-forensics' ? (
            <PdfForensicsView
              report={pdfForensicsReport}
              isAnalyzing={isAnalyzingForensics}
              errorMessage={forensicsError}
              onFileSelected={(file) => handleForensicsFileSelected(file)}
              onClearReport={() => {
                setPdfForensicsReport(null);
                setForensicsError(null);
              }}
            />
          ) : !statement ? (
            <StatementDropzone
              onFileSelected={handleFileSelected}
              isParsing={isParsing}
              errorMessage={parseError}
            />
          ) : (
            <div className="space-y-6">
              {/* Workspace Context & Integrity Verification Card */}
              <section
                aria-label="Statement Metadata and Integrity Status"
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#E2E8F0] bg-white px-5 py-4 shadow-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0F172A]">
                    <span>{statement.metadata.detectedBank}</span>
                    {statement.metadata.accountHolderName && (
                      <>
                        <span aria-hidden="true" className="text-[#E2E8F0]">
                          ·
                        </span>
                        <span className="text-xs font-semibold text-[#1D4ED8]">
                          {statement.metadata.accountHolderName}
                        </span>
                      </>
                    )}
                    {statement.metadata.accountNumber && (
                      <>
                        <span aria-hidden="true" className="text-[#E2E8F0]">
                          ·
                        </span>
                        <span className="font-mono text-xs text-[#334155]">
                          A/C {statement.metadata.accountNumber}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                    <span>{statement.metadata.fileName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{statement.metadata.fileType}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatFileSize(statement.metadata.fileSizeBytes)}</span>
                    {statement.metadata.statementPeriod && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[#334155]">
                          {statement.metadata.statementPeriod}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {statement.transactions.length} normalized txns
                      {statement.metadata.mergedContinuationRows > 0
                        ? ` (${statement.metadata.mergedContinuationRows} wrapped lines merged)`
                        : ''}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Integrity Verification Status */}
                  {statement.integrity.status === 'verified' && (
                    <div className="inline-flex items-center gap-2 rounded-lg border border-[#16A34A]/35 bg-green-50 px-3 py-1.5 text-xs font-semibold text-[#16A34A]">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>Statement Integrity Matched</span>
                    </div>
                  )}
                  {statement.integrity.status === 'discrepancy' && (
                    <div className="inline-flex items-center gap-2 rounded-lg border border-[#DC2626]/35 bg-red-50 px-3 py-1.5 text-xs font-semibold text-[#DC2626]">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>
                        Integrity Mismatch (
                        {statement.integrity.discrepancyRowIds.length > 0
                          ? `${statement.integrity.discrepancyRowIds.length} row breaks`
                          : formatINR(statement.integrity.discrepancy || 0)}
                        )
                      </span>
                    </div>
                  )}
                  {statement.integrity.status === 'unverifiable' && (
                    <div className="inline-flex items-center gap-2 rounded-lg border border-[#F59E0B]/40 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-[#D97706]">
                      <Info className="h-4 w-4 shrink-0" />
                      <span>Balance Column Absent — Totals Computed</span>
                    </div>
                  )}

                  {pdfForensicsReport && (
                    <button
                      type="button"
                      onClick={() => setActiveView('pdf-forensics')}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        pdfForensicsReport.verdict === 'original'
                          ? 'border-[#16A34A]/35 bg-green-50 text-[#16A34A] hover:bg-green-100/70'
                          : 'border-[#DC2626]/35 bg-red-50 text-[#DC2626] hover:bg-red-100/70'
                      }`}
                    >
                      <FileSearch className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {pdfForensicsReport.verdict === 'original'
                          ? 'Original Bank PDF ✅'
                          : 'Modified PDF Warning ⚠️'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsMapperOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] whitespace-nowrap shrink-0"
                  >
                    <Sliders className="h-3.5 w-3.5 text-[#1D4ED8]" />
                    <span>Column Mapper</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileReplaceInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] whitespace-nowrap shrink-0"
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    <span>Replace File</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetWorkspace}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Clear</span>
                  </button>
                </div>
              </section>

              {parseError && (
                <div
                  role="alert"
                  className="rounded-lg border border-[#DC2626]/35 bg-red-50 px-4 py-3 text-xs font-medium text-[#DC2626]"
                >
                  {parseError}
                </div>
              )}

              {/* Executive Audit KPI Strip */}
              {loanSummary && (
                <KpiSummaryStrip
                  integrity={statement.integrity}
                  transactions={statement.transactions}
                  thresholdAmount={thresholdAmount}
                  loanSummary={loanSummary}
                />
              )}

              {/* Executive Credit Risk Score & Automated Credit Officer Summary Note */}
              {underwritingReport && (activeView === 'overview' || activeView === 'underwriting') && (
                <CreditRiskBanner
                  assessment={underwritingReport.riskAssessment}
                  onOpenUnderwritingSuite={
                    activeView === 'overview'
                      ? () => setActiveView('underwriting')
                      : undefined
                  }
                />
              )}

              {/* View Routing */}
              {activeView === 'overview' && (
                <div className="space-y-6">
                  {/* Statement Comparison & Mathematical Integrity Audit Card */}
                  <section
                    aria-label="Opening to Closing Balance Reconciliation"
                    className="rounded-lg border border-[#E2E8F0] bg-white px-5 py-4 shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
                      <div className="flex items-center gap-2.5">
                        <h2 className="font-display text-sm font-semibold text-[#0F172A]">
                          Statement Comparison & Integrity Audit (Opening + Credits - Debits = Closing)
                        </h2>
                      </div>
                      <span className="text-xs text-[#64748B]">
                        Order:{' '}
                        {statement.metadata.sortOrder === 'descending'
                          ? 'Reverse-chronological source normalized chronologically'
                          : 'Chronological source'}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="rounded-md bg-[#F1F5F9]/70 px-3.5 py-2.5">
                        <div className="text-xs font-medium text-[#64748B]">Opening Balance</div>
                        <div className="mt-1 font-mono text-sm font-semibold text-[#0F172A] tabular-nums">
                          {statement.integrity.openingBalance !== null
                            ? formatINR(statement.integrity.openingBalance)
                            : 'Unavailable'}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#64748B]">
                          {statement.integrity.openingBalanceSource === 'explicit'
                            ? 'Explicit in statement'
                            : statement.integrity.openingBalanceSource === 'derived'
                              ? 'Derived from first entry'
                              : 'No balance column'}
                        </div>
                      </div>
                      <div className="rounded-md bg-[#F1F5F9]/70 px-3.5 py-2.5">
                        <div className="text-xs font-medium text-[#64748B]">+ Total Credits</div>
                        <div className="mt-1 font-mono text-sm font-semibold text-[#16A34A] tabular-nums">
                          {formatINR(statement.integrity.totalCredits)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#64748B] tabular-nums">
                          {statement.integrity.creditCount} credit entries
                        </div>
                      </div>
                      <div className="rounded-md bg-[#F1F5F9]/70 px-3.5 py-2.5">
                        <div className="text-xs font-medium text-[#64748B]">- Total Debits</div>
                        <div className="mt-1 font-mono text-sm font-semibold text-[#DC2626] tabular-nums">
                          {formatINR(statement.integrity.totalDebits)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#64748B] tabular-nums">
                          {statement.integrity.debitCount} debit entries
                        </div>
                      </div>
                      <div className="rounded-md border border-[#3B82F6]/30 bg-[#DBEAFE]/35 px-3.5 py-2.5">
                        <div className="text-xs font-medium text-[#1D4ED8]">= Computed Closing</div>
                        <div className="mt-1 font-mono text-sm font-semibold text-[#0F172A] tabular-nums">
                          {statement.integrity.computedClosingBalance !== null
                            ? formatINR(statement.integrity.computedClosingBalance)
                            : 'N/A'}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#334155]">
                          Calculated ledger sum
                        </div>
                      </div>
                      <div
                        className={`rounded-md border px-3.5 py-2.5 ${
                          statement.integrity.discrepancy === null
                            ? 'border-[#E2E8F0] bg-[#F1F5F9]/70'
                            : Math.abs(statement.integrity.discrepancy) <= 0.05
                              ? 'border-[#16A34A]/35 bg-green-50/70'
                              : 'border-[#DC2626]/35 bg-red-50/70'
                        }`}
                      >
                        <div className="text-xs font-medium text-[#64748B]">
                          Reported Closing & Variance
                        </div>
                        <div className="mt-1 font-mono text-sm font-semibold text-[#0F172A] tabular-nums">
                          {statement.integrity.closingBalance !== null
                            ? formatINR(statement.integrity.closingBalance)
                            : 'N/A'}
                        </div>
                        {statement.integrity.discrepancy !== null && (
                          <div
                            className={`mt-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                              Math.abs(statement.integrity.discrepancy) <= 0.05
                                ? 'text-[#16A34A]'
                                : 'text-[#DC2626]'
                            }`}
                          >
                            {Math.abs(statement.integrity.discrepancy) <= 0.05
                              ? `Matched · Diff ${formatINR(statement.integrity.discrepancy)}`
                              : `Mismatch · Diff ${formatINR(statement.integrity.discrepancy)}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Undisclosed Loan & Private Borrowing Tracker */}
                  {loanSummary && (
                    <LoanTrackerView
                      transactions={statement.transactions}
                      loanSummary={loanSummary}
                      thresholdAmount={thresholdAmount}
                      onInspectTransaction={(tx) => setInspectedTxId(tx.id)}
                      onQuickStatusChange={handleQuickStatusChange}
                    />
                  )}

                  {/* High-Value Segregation Engine */}
                  <HighValueSegregation
                    transactions={statement.transactions}
                    thresholdAmount={thresholdAmount}
                    onThresholdChange={setThresholdAmount}
                    onInspectTransaction={(tx) => setInspectedTxId(tx.id)}
                    onQuickStatusChange={handleQuickStatusChange}
                  />

                  {/* Credit Underwriting & Risk Intelligence Suite (Modules 1-6) */}
                  {underwritingReport && (
                    <UnderwritingIntelligenceView
                      report={underwritingReport}
                      onInspectTransaction={(tx) => setInspectedTxId(tx.id)}
                    />
                  )}

                  {/* Cleared Cheque Register */}
                  <ChequeRegisterView
                    transactions={statement.transactions}
                    onInspectTransaction={(tx) => setInspectedTxId(tx.id)}
                    onQuickStatusChange={handleQuickStatusChange}
                  />
                </div>
              )}

              {activeView === 'inspection-audit' && loanSummary && (
                <StatementInspectionAuditView
                  statement={statement}
                  loanSummary={loanSummary}
                  thresholdAmount={thresholdAmount}
                  onThresholdChange={setThresholdAmount}
                  onInspectTransaction={(tx) => setInspectedTxId(tx.id)}
                  onQuickStatusChange={handleQuickStatusChange}
                />
              )}

              {activeView === 'underwriting' && underwritingReport && (
                <UnderwritingIntelligenceView
                  report={underwritingReport}
                  onInspectTransaction={(tx) => setInspectedTxId(tx.id)}
                />
              )}

              {activeView === 'high-value' && (
                <HighValueSegregation
                  transactions={statement.transactions}
                  thresholdAmount={thresholdAmount}
                  onThresholdChange={setThresholdAmount}
                  onInspectTransaction={(tx) => setInspectedTxId(tx.id)}
                  onQuickStatusChange={handleQuickStatusChange}
                />
              )}

              {activeView === 'loans' && loanSummary && (
                <LoanTrackerView
                  transactions={statement.transactions}
                  loanSummary={loanSummary}
                  thresholdAmount={thresholdAmount}
                  onInspectTransaction={(tx) => setInspectedTxId(tx.id)}
                  onQuickStatusChange={handleQuickStatusChange}
                />
              )}

              {activeView === 'cheques' && (
                <ChequeRegisterView
                  transactions={statement.transactions}
                  onInspectTransaction={(tx) => setInspectedTxId(tx.id)}
                  onQuickStatusChange={handleQuickStatusChange}
                />
              )}

              {activeView === 'ledger' && (
                <FullLedgerView
                  transactions={statement.transactions}
                  onInspectTransaction={(tx) => setInspectedTxId(tx.id)}
                  onQuickStatusChange={handleQuickStatusChange}
                />
              )}

              {activeView === 'pdf-forensics' && (
                <PdfForensicsView
                  report={pdfForensicsReport}
                  isAnalyzing={isAnalyzingForensics}
                  errorMessage={forensicsError}
                  onFileSelected={(file) => handleForensicsFileSelected(file)}
                  onClearReport={() => {
                    setPdfForensicsReport(null);
                    setForensicsError(null);
                  }}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Slide-over Audit Status & Remarks Drawer */}
      <AuditDrawer
        transaction={inspectedTransaction}
        onClose={() => setInspectedTxId(null)}
        onSaveAudit={handleSaveAudit}
      />

      {/* Manual Column & Header Override / Fallback Rescue Mapper */}
      {(pendingFallbackRaw || (statement && isMapperOpen)) && (
        <ColumnMapperModal
          key={
            pendingFallbackRaw
              ? `fallback-${pendingFallbackRaw.raw.fileName}`
              : `${statement!.metadata.fileName}-${statement!.mapping.headerRowIndex}`
          }
          isOpen={Boolean(pendingFallbackRaw) || isMapperOpen}
          raw={pendingFallbackRaw ? pendingFallbackRaw.raw : statement!.raw}
          currentMapping={pendingFallbackRaw ? pendingFallbackRaw.mapping : statement!.mapping}
          isFallbackRescue={Boolean(pendingFallbackRaw)}
          onClose={() => {
            setIsMapperOpen(false);
            setPendingFallbackRaw(null);
          }}
          onApplyMapping={handleApplyMapping}
        />
      )}

      {/* Password-Protected PDF / Excel Unlock Modal */}
      <PasswordPromptModal
        file={pendingLockedFile}
        isUnlocking={isUnlocking}
        errorMessage={unlockError}
        attemptCount={unlockAttempts}
        onSubmitPassword={handleUnlockSubmit}
        onCancel={() => {
          setPendingLockedFile(null);
          setUnlockError(null);
          setUnlockAttempts(0);
        }}
      />
    </div>
  );
}
