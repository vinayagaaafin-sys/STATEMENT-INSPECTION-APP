import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, FileLock2, Loader2, Lock, X } from 'lucide-react';
import { formatFileSize } from '../utils/indianFormat';

interface PasswordPromptModalProps {
  file: File | null;
  isUnlocking: boolean;
  errorMessage: string | null;
  attemptCount: number;
  onSubmitPassword: (password: string) => Promise<void>;
  onCancel: () => void;
}

export const PasswordPromptModal: React.FC<PasswordPromptModalProps> = ({
  file,
  isUnlocking,
  errorMessage,
  attemptCount,
  onSubmitPassword,
  onCancel,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (file) {
      setPassword('');
      setShowPassword(false);
      // Focus password field cleanly when modal opens
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 40);
      return () => clearTimeout(t);
    }
  }, [file]);

  useEffect(() => {
    if (errorMessage && attemptCount > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [errorMessage, attemptCount]);

  if (!file) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || isUnlocking) return;
    const transientPassword = password;
    await onSubmitPassword(transientPassword);
  };

  const handleCancel = () => {
    setPassword('');
    setShowPassword(false);
    onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/55 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-modal-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#334155] bg-[#1E293B] px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#3B82F6]/35 bg-[#334155] text-[#DBEAFE]">
              <FileLock2 className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="password-modal-title"
                className="font-display text-base font-semibold text-white"
              >
                Document Password Required
              </h2>
              <p className="mt-0.5 text-xs text-slate-300">
                Decrypted strictly in local browser memory
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isUnlocking}
            onClick={handleCancel}
            aria-label="Close password prompt"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#475569] bg-[#334155] text-slate-200 transition-colors hover:bg-[#475569] hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5" autoComplete="off">
          {/* File Context Box */}
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-[#64748B]">Protected Statement File</div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs font-semibold text-[#0F172A]" title={file.name}>
                {file.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-[#64748B] tabular-nums">
                {formatFileSize(file.size)}
              </span>
            </div>
          </div>

          {/* Password Input with Shake on Error + Show/Hide Toggle */}
          <div>
            <label
              htmlFor="statement-password-input"
              className="block text-xs font-semibold text-[#334155]"
            >
              Statement Password
            </label>
            <div
              key={attemptCount}
              className={`relative mt-1.5 ${errorMessage ? 'animate-input-shake' : ''}`}
            >
              <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
              <input
                ref={inputRef}
                id="statement-password-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isUnlocking}
                placeholder="Enter document password..."
                autoComplete="new-password"
                className={`w-full rounded-lg border bg-white py-2.5 pr-10 pl-9 font-mono text-sm text-[#0F172A] placeholder:font-sans placeholder:text-xs placeholder:text-[#64748B] focus:outline-none ${
                  errorMessage
                    ? 'border-[#DC2626] focus:border-[#DC2626]'
                    : 'border-[#E2E8F0] focus:border-[#3B82F6]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#DC2626]"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <p className="mt-2.5 text-xs leading-relaxed text-[#64748B]">
              Tip: Usually Customer ID, Account Number, PAN, or Name+DOB (e.g., first 4 letters of
              name followed by DDMM).
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 border-t border-[#E2E8F0] pt-4">
            <button
              type="button"
              disabled={isUnlocking}
              onClick={handleCancel}
              className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#334155] transition-colors hover:bg-[#F1F5F9] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!password || isUnlocking}
              className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUnlocking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{isUnlocking ? 'Decrypting & Parsing...' : 'Unlock & Process Statement'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
