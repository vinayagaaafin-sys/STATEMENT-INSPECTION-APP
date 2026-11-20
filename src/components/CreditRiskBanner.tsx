import React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { CreditRiskAssessment, RiskRatingBand } from '../types/statement';

interface CreditRiskBannerProps {
  assessment: CreditRiskAssessment;
  onOpenUnderwritingSuite?: () => void;
}

function getBandColors(band: RiskRatingBand): {
  text: string;
  bg: string;
  border: string;
  bar: string;
} {
  switch (band) {
    case 'Strong Conduct':
      return {
        text: 'text-[#16A34A]',
        bg: 'bg-green-50',
        border: 'border-[#16A34A]/35',
        bar: 'bg-[#16A34A]',
      };
    case 'Satisfactory Conduct':
      return {
        text: 'text-[#2563EB]',
        bg: 'bg-[#DBEAFE]/60',
        border: 'border-[#3B82F6]/40',
        bar: 'bg-[#2563EB]',
      };
    case 'Moderate Risk — Review':
      return {
        text: 'text-[#D97706]',
        bg: 'bg-amber-50',
        border: 'border-[#F59E0B]/45',
        bar: 'bg-[#F59E0B]',
      };
    case 'High Risk — Caution':
      return {
        text: 'text-[#DC2626]',
        bg: 'bg-red-50',
        border: 'border-[#DC2626]/35',
        bar: 'bg-[#DC2626]',
      };
  }
}

export const CreditRiskBanner: React.FC<CreditRiskBannerProps> = ({
  assessment,
}) => {
  const colors = getBandColors(assessment.ratingBand);

  return (
    <section
      aria-label="Executive Credit Risk Score"
      className="rounded-lg border border-[#E2E8F0] bg-white shadow-xs"
    >
      <div className="p-5">
        <div className="flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                Account Conduct Score
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-bold text-[#0F172A] tabular-nums">
                  {assessment.score}
                </span>
                <span className="font-mono text-sm font-medium text-[#64748B]">/ 100</span>
              </div>
            </div>
            <div
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${colors.bg} ${colors.text} ${colors.border}`}
            >
              {assessment.score >= 70 ? (
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>{assessment.ratingBand}</span>
            </div>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
            <div
              className={`h-full rounded-full transition-all ${colors.bar}`}
              style={{ width: `${assessment.score}%` }}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-5">
            {assessment.factors.map((f) => {
              const badgeColor =
                f.status === 'positive'
                  ? 'text-[#16A34A]'
                  : f.status === 'negative'
                    ? 'text-[#DC2626]'
                    : f.status === 'warning'
                      ? 'text-[#D97706]'
                      : 'text-[#64748B]';
              return (
                <div
                  key={f.label}
                  className="flex items-center justify-between gap-2 rounded border border-[#E2E8F0] bg-[#F1F5F9]/50 px-3 py-2 text-[11px]"
                  title={f.detail}
                >
                  <span className="truncate text-[#334155]">{f.label}</span>
                  <span className={`font-mono font-semibold tabular-nums whitespace-nowrap ${badgeColor}`}>
                    {f.impact === 0 ? 'Pass (0)' : `${f.impact} pts`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
