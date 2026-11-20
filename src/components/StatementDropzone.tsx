import React, { useRef, useState } from 'react';
import { FileSpreadsheet, FileText, Lock, ShieldCheck, Upload } from 'lucide-react';

interface StatementDropzoneProps {
  onFileSelected: (file: File) => void;
  isParsing: boolean;
  errorMessage: string | null;
}

export const StatementDropzone: React.FC<StatementDropzoneProps> = ({
  onFileSelected,
  isParsing,
  errorMessage,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0 || isParsing) return;
    onFileSelected(files[0]);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 text-xs font-medium tracking-wide text-[#64748B]">
          <Lock className="h-3.5 w-3.5 text-[#1D4ED8]" />
          <span>100% Client-Side Browser Processing</span>
          <span aria-hidden="true">·</span>
          <span>Zero Server Data Transmission</span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl text-balance">
          Corporate Current Account Statement Inspector
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[#64748B]">
          Upload any Indian bank current account statement in CSV, Excel, or PDF format to run
          automated header normalization, balance integrity verification, high-value transaction
          segregation, and cleared cheque auditing.
        </p>
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
        className={`rounded-xl border-2 border-dashed bg-white p-10 text-center shadow-xs transition-colors ${
          isDragging
            ? 'border-[#1D4ED8] bg-[#DBEAFE]/45'
            : 'border-[#E2E8F0] hover:border-[#3B82F6]/60'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xls,.xlsx,.pdf,.txt"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-[#3B82F6]/25 bg-[#DBEAFE]/60 text-[#1D4ED8]">
          <Upload className="h-6 w-6" />
        </div>

        <h2 className="mt-4 font-display text-lg font-semibold text-[#0F172A]">
          {isParsing ? 'Parsing & Normalizing Statement...' : 'Drop Bank Statement File Here'}
        </h2>
        <p className="mt-1.5 text-sm text-[#64748B]">
          Supports multi-line PDF narrations, single-column Dr/Cr sheets, and raw corporate exports
        </p>

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            disabled={isParsing}
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#1D4ED8] px-6 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#1E40AF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6] disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <Upload className="h-4 w-4" />
            <span>{isParsing ? 'Analyzing Statement...' : 'Select Statement File'}</span>
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mx-auto mt-6 max-w-xl rounded-lg border border-[#DC2626]/35 bg-red-50 px-4 py-3 text-left text-xs font-medium text-[#DC2626]"
          >
            {errorMessage}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-4 border-t border-[#E2E8F0] pt-6 text-left sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-[#1D4ED8]" />
            <div>
              <p className="text-xs font-semibold text-[#0F172A]">Excel & CSV Engines</p>
              <p className="mt-0.5 text-xs text-[#64748B]">
                Auto-skips bank address headers and normalizes .xlsx, .xls, and .csv grids.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#1D4ED8]" />
            <div>
              <p className="text-xs font-semibold text-[#0F172A]">Spatial PDF Extraction</p>
              <p className="mt-0.5 text-xs text-[#64748B]">
                Reconstructs columns by X/Y coordinates and merges wrapped narrations.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1D4ED8]" />
            <div>
              <p className="text-xs font-semibold text-[#0F172A]">Zero External Uploads</p>
              <p className="mt-0.5 text-xs text-[#64748B]">
                Sensitive corporate banking data remains strictly inside browser RAM.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-xs text-[#64748B]">
        Compatible with SBI · HDFC Bank · ICICI Bank · Axis Bank · TMB · Kotak Mahindra · Canara
        Bank · Indian Bank · IOB · Union Bank · Any Indian Bank
      </div>
    </div>
  );
};
