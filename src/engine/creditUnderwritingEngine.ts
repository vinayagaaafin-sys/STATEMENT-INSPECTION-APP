import type {
  AbbSummary,
  AnalyzedStatement,
  BounceReturnSummary,
  CashAnalyticsSummary,
  CircularDetectionSummary,
  CircularPair,
  ConcentrationParty,
  ConcentrationSummary,
  CreditRiskAssessment,
  CreditUnderwritingReport,
  DishonouredInstrument,
  LoanAnalysisSummary,
  MonthlyTurnoverRow,
  NormalizedTransaction,
  ReturnDirection,
  RiskRatingBand,
  ScoreFactor,
  StatutoryCategory,
  StatutoryCategorySummary,
  StatutoryExpenseItem,
  StatutoryExpenseSummary,
} from '../types/statement';
import { formatINR } from '../utils/indianFormat';
import {
  computeCounterpartySimilarity,
  normalizeEntityTokens,
} from './loanTrackerEngine';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function isoDateToUtcMs(isoDate: string): number {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function getDaysInMonth(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

function formatMonthLabel(monthKey: string): string {
  const m = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return monthKey;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return dt.toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// ============================================================================
// MODULE 1: CHEQUE BOUNCE & NACH / ECS RETURN TRACKER
// ============================================================================
const BOUNCE_PRIMARY_RX =
  /\b(CHQ\s*RET(?:URN)?|CHEQUE\s*RET(?:URN)?|CHQ\s*RTN|ECS\s*RTN|ECS\s*RET(?:URN)?|NACH\s*RTN|NACH\s*RET(?:URN)?|ACH\s*RET(?:URN)?|ACH\s*RTN|MANDATE\s*RET(?:URN)?|BOUNCE(?:D)?|INSUFFICIENT\s*FUNDS?|FUNDS?\s*INSUFFICIENT|INW(?:ARD)?\s*RET(?:URN)?|OUTW(?:ARD)?\s*RET(?:URN)?|DISHOUN?O?URED|UNPAID\s*CHQ|RET(?:URN)?\s*CHQ)\b/i;

const BOUNCE_GENERIC_RETURN_RX = /\bRETURN(?:ED)?\b/i;
const BOUNCE_CONTEXT_RX =
  /\b(CHQ|CHEQUE|CLG|CTS|ECS|NACH|ACH|INSUFFICIENT|BOUNCE|CHG|CHARGE|FEE|PENALTY|DR|REVERSAL|UNPAID|INSTRUMENT)\b/i;
const COMMERCIAL_RETURN_EXCLUSION_RX =
  /\b(SALES\s*RETURN|GOODS\s*RETURN|MATERIAL\s*RETURN|STOCK\s*RETURN)\b/i;

const RETURN_CHARGE_RX =
  /\b(RET(?:URN)?\s*CHG|RET(?:URN)?\s*CHARGE|BOUNCE\s*CHG|BOUNCE\s*CHARGE|ECS\s*RET\s*CHG|NACH\s*RET\s*CHG|ACH\s*RET\s*CHG|CHQ\s*RET\s*CHG|PENALTY|DISHONOU?R\s*CHG)\b/i;

export function analyzeBounceAndReturns(
  transactions: NormalizedTransaction[],
): BounceReturnSummary {
  const instruments: DishonouredInstrument[] = [];

  for (const tx of transactions) {
    const narr = `${tx.narration} ${tx.refNo}`.trim();
    if (COMMERCIAL_RETURN_EXCLUSION_RX.test(narr)) continue;

    const hasPrimary = BOUNCE_PRIMARY_RX.test(narr);
    const hasGenericReturn =
      BOUNCE_GENERIC_RETURN_RX.test(narr) && BOUNCE_CONTEXT_RX.test(narr);

    if (!hasPrimary && !hasGenericReturn) continue;

    const isCharge =
      tx.debit > 0 &&
      (RETURN_CHARGE_RX.test(narr) ||
        (tx.debit <= 1500 && /\b(CHG|CHARGE|FEE|PENALTY|GST)\b/i.test(narr)));

    const isMandate = /\b(NACH|ECS|ACH|MANDATE)\b/i.test(narr);
    let direction: ReturnDirection;
    let instrumentType: DishonouredInstrument['instrumentType'];

    if (isCharge) {
      direction = 'Return Penalty Charge';
      instrumentType = 'Return Charge';
    } else if (
      /\b(INW(?:ARD)?\s*RET|CLG\s*RET.*CR|DEP(?:OSIT)?\s*RET|BY\s*CLG.*RET)\b/i.test(
        narr,
      ) &&
      !isMandate
    ) {
      direction = 'Inward Return';
      instrumentType = 'Cheque';
    } else if (
      /\b(OUTW(?:ARD)?\s*RET|INSUFFICIENT|NACH|ECS|ACH)\b/i.test(narr) ||
      tx.debit > 0
    ) {
      direction = 'Outward Return';
      instrumentType = isMandate ? 'NACH / ECS / ACH' : 'Cheque';
    } else {
      // Credit reversal of an instrument without inward keyword
      direction = isMandate ? 'Outward Return' : 'Inward Return';
      instrumentType = isMandate ? 'NACH / ECS / ACH' : 'Cheque';
    }

    let reasonHint = 'Instrument Dishonoured / Returned';
    if (/\bINSUFFICIENT\b/i.test(narr)) {
      reasonHint = 'Funds Insufficient';
    } else if (isCharge) {
      reasonHint = 'Bank Return / Bounce Penalty Charge';
    } else if (isMandate) {
      reasonHint = 'NACH / ECS / ACH Mandate Return';
    } else if (direction === 'Inward Return') {
      reasonHint = 'Deposited Cheque Returned Unpaid';
    } else {
      reasonHint = 'Issued Cheque Returned';
    }

    const amount = tx.debit > 0 ? tx.debit : tx.credit;
    const instrumentRef = tx.chequeNumber || tx.refNo || '—';

    instruments.push({
      id: `ret-${tx.id}`,
      transaction: tx,
      direction,
      instrumentType,
      instrumentRef,
      amount,
      reasonHint,
    });
  }

  const inwardCount = instruments.filter((i) => i.direction === 'Inward Return').length;
  const outwardCount = instruments.filter((i) => i.direction === 'Outward Return').length;
  const chargeCount = instruments.filter((i) => i.direction === 'Return Penalty Charge').length;
  const totalBounceCount = inwardCount + outwardCount;

  const totalBouncedValue = round2(
    instruments
      .filter((i) => i.direction !== 'Return Penalty Charge')
      .reduce((sum, i) => sum + i.amount, 0),
  );
  const totalPenaltyCharges = round2(
    instruments
      .filter((i) => i.direction === 'Return Penalty Charge')
      .reduce((sum, i) => sum + i.amount, 0),
  );

  // Denominator: cleared cheques + NACH/ECS/ACH debits + total bounces
  const instrumentAttempts = transactions.filter(
    (t) =>
      t.isChequeCleared ||
      /\b(CHQ|CHEQUE|CLG|CTS|NACH|ECS|ACH)\b/i.test(t.narration),
  ).length;
  const bounceRatePct = round2(
    (totalBounceCount / Math.max(1, instrumentAttempts)) * 100,
  );

  return {
    inwardCount,
    outwardCount,
    chargeCount,
    totalBounceCount,
    totalBouncedValue,
    totalPenaltyCharges,
    bounceRatePct,
    instruments,
  };
}

// ============================================================================
// MODULE 2: CIRCULAR / ROUND-TRIPPING TRANSACTION DETECTOR
// ============================================================================
const CIRCULAR_EXCLUSION_RX =
  /\b(GST|CGST|SGST|IGST|TDS|INCOME\s*TAX|BANK\s*CHARGES|SMS\s*CHG|AMC|FOLIO|SWEEP\s*TRF|AUTO\s*SWEEP)\b/i;

export function detectCircularTransactions(
  transactions: NormalizedTransaction[],
): CircularDetectionSummary {
  const MIN_CIRCULAR_AMT = 5_000;
  const credits = transactions.filter(
    (t) => t.credit >= MIN_CIRCULAR_AMT && !CIRCULAR_EXCLUSION_RX.test(t.narration),
  );
  const debits = transactions.filter(
    (t) => t.debit >= MIN_CIRCULAR_AMT && !CIRCULAR_EXCLUSION_RX.test(t.narration),
  );

  interface CandidatePair {
    creditTx: NormalizedTransaction;
    debitTx: NormalizedTransaction;
    daysApart: number;
    amountMatchType: CircularPair['amountMatchType'];
    similarity: number;
    partyName: string;
    scoreRank: number;
  }

  const candidates: CandidatePair[] = [];

  for (const cr of credits) {
    const crMs = isoDateToUtcMs(cr.isoDate);
    if (!crMs) continue;

    const crCpTokens = normalizeEntityTokens(cr.counterparty || '');
    const crTokens =
      crCpTokens.length > 0
        ? crCpTokens.slice(0, 4)
        : normalizeEntityTokens(cr.narration).slice(0, 4);

    for (const dr of debits) {
      if (dr.id === cr.id) continue;
      const drMs = isoDateToUtcMs(dr.isoDate);
      if (!drMs) continue;

      const daysDiff = Math.round(Math.abs(drMs - crMs) / 86_400_000);
      if (daysDiff > 3) continue;

      const exactAmount = Math.abs(cr.credit - dr.debit) <= 1;
      const maxAmt = Math.max(cr.credit, dr.debit);
      const minAmt = Math.min(cr.credit, dr.debit);
      const nearAmount = !exactAmount && minAmt / maxAmt >= 0.95;

      const drText = `${dr.counterparty} ${dr.chequePayee || ''} ${dr.narration}`;
      const sim =
        crTokens.length > 0
          ? computeCounterpartySimilarity(crTokens, drText)
          : { score: 0, reason: '' };

      const hasEntityMatch = sim.score >= 0.65;

      // Require either:
      // 1) Matching/similar counterparty name within 0-3 days (and meaningful amount overlap or >= 0.50 ratio)
      // 2) Identical amount (>= ₹10,000) within 1 to 3 days (or same day if counterparty overlaps or >= ₹25,000)
      if (!hasEntityMatch && !exactAmount) continue;
      if (exactAmount && !hasEntityMatch && cr.credit < 10_000) continue;
      if (hasEntityMatch && !exactAmount && !nearAmount && minAmt / maxAmt < 0.5) continue;

      const amountMatchType: CircularPair['amountMatchType'] = exactAmount
        ? 'Exact Amount'
        : nearAmount
          ? 'Near Amount'
          : 'Counterparty Match';

      const partyLabel =
        crTokens.length > 0
          ? toTitleCase(crTokens.join(' '))
          : cr.counterparty !== 'Unspecified'
            ? cr.counterparty
            : 'Matched Amount Pair';

      const scoreRank =
        (hasEntityMatch ? 100 : 0) +
        (exactAmount ? 80 : nearAmount ? 40 : 10) -
        daysDiff * 5 +
        sim.score * 20;

      candidates.push({
        creditTx: cr,
        debitTx: dr,
        daysApart: daysDiff,
        amountMatchType,
        similarity: sim.score,
        partyName: partyLabel,
        scoreRank,
      });
    }
  }

  candidates.sort((a, b) => b.scoreRank - a.scoreRank);

  const usedCreditIds = new Set<string>();
  const usedDebitIds = new Set<string>();
  const pairs: CircularPair[] = [];

  for (const cand of candidates) {
    if (usedCreditIds.has(cand.creditTx.id) || usedDebitIds.has(cand.debitTx.id)) {
      continue;
    }
    usedCreditIds.add(cand.creditTx.id);
    usedDebitIds.add(cand.debitTx.id);

    pairs.push({
      id: `circ-${pairs.length + 1}`,
      creditTx: cand.creditTx,
      debitTx: cand.debitTx,
      daysApart: cand.daysApart,
      amountMatchType: cand.amountMatchType,
      counterpartySimilarity: round2(cand.similarity),
      counterpartyName: cand.partyName,
      amountInvolved: round2(Math.min(cand.creditTx.credit, cand.debitTx.debit)),
      flagLabel: 'Suspected Fund Rotation / Accommodation Entry',
    });
  }

  pairs.sort((a, b) => b.amountInvolved - a.amountInvolved);

  return {
    pairCount: pairs.length,
    totalRotatedAmount: round2(pairs.reduce((s, p) => s + p.amountInvolved, 0)),
    pairs,
  };
}

// ============================================================================
// MODULE 3: MONTH-WISE TURNOVER & AVERAGE BANK BALANCE (ABB) MATRIX
// ============================================================================
const NON_BUSINESS_CREDIT_RX =
  /\b(LOAN\s*DISBURS|DISBURSAL|FD\s*MATUR|FIXED\s*DEP|TERM\s*DEP|AUTO\s*SWEEP|SWEEP\s*CR|INT\.?\s*PAID|INTEREST\s*CR|TAX\s*REFUND|IT\s*REFUND|GST\s*REFUND|REV(?:ERSAL)?|RETURN|BOUNCE|SELF\s*TRF|OWN\s*TRF|CAPITAL\s*INTRO)\b/i;

export function analyzeMonthWiseAbb(
  statement: AnalyzedStatement,
  loanSummary: LoanAnalysisSummary,
): AbbSummary {
  const { transactions, integrity } = statement;
  const loanCreditIds = new Set<string>(
    loanSummary.tracedLoanChains.flatMap((c) => c.creditTransactions.map((t) => t.id)),
  );

  const monthMap = new Map<string, NormalizedTransaction[]>();
  for (const tx of transactions) {
    if (!tx.isoDate || tx.isoDate.length < 7) continue;
    const key = tx.isoDate.slice(0, 7);
    const arr = monthMap.get(key);
    if (arr) arr.push(tx);
    else monthMap.set(key, [tx]);
  }

  const sortedKeys = Array.from(monthMap.keys()).sort();
  const months: MonthlyTurnoverRow[] = [];

  let runningPrevClosing: number | null = integrity.openingBalance;
  const allDailyBalances: number[] = [];
  let minObservedBalance: number | null = null;
  let maxObservedBalance: number | null = null;
  let totalBusinessCredits = 0;
  let totalNonBusinessCredits = 0;

  for (let mIdx = 0; mIdx < sortedKeys.length; mIdx++) {
    const key = sortedKeys[mIdx];
    const txs = monthMap.get(key)!;
    const [yearStr, monStr] = key.split('-');
    const year = Number(yearStr);
    const mon = Number(monStr);
    const daysInMonth = getDaysInMonth(year, mon);

    let monthTotalCredits = 0;
    let monthBusinessCredits = 0;
    let monthNonBusinessCredits = 0;
    let monthTotalDebits = 0;

    // Derive month opening balance
    let openingBal: number | null = runningPrevClosing;
    if (openingBal === null) {
      const firstWithBal = txs.find((t) => t.balance !== null);
      if (firstWithBal && firstWithBal.balance !== null) {
        openingBal = round2(
          firstWithBal.balance - firstWithBal.credit + firstWithBal.debit,
        );
      }
    }

    const dayEndBalance = new Map<number, number>();
    const observedBalances: number[] = [];
    if (openingBal !== null) observedBalances.push(openingBal);

    for (const tx of txs) {
      monthTotalCredits += tx.credit;
      monthTotalDebits += tx.debit;

      if (tx.credit > 0) {
        const isNonBusiness =
          loanCreditIds.has(tx.id) || NON_BUSINESS_CREDIT_RX.test(tx.narration);
        if (isNonBusiness) {
          monthNonBusinessCredits += tx.credit;
        } else {
          monthBusinessCredits += tx.credit;
        }
      }

      if (tx.balance !== null) {
        observedBalances.push(tx.balance);
        const dayNum = Number(tx.isoDate.slice(8, 10));
        if (dayNum >= 1 && dayNum <= 31) {
          dayEndBalance.set(dayNum, tx.balance);
        }
      }
    }

    monthTotalCredits = round2(monthTotalCredits);
    monthBusinessCredits = round2(monthBusinessCredits);
    monthNonBusinessCredits = round2(monthNonBusinessCredits);
    monthTotalDebits = round2(monthTotalDebits);
    totalBusinessCredits += monthBusinessCredits;
    totalNonBusinessCredits += monthNonBusinessCredits;

    const lastWithBal = [...txs].reverse().find((t) => t.balance !== null);
    const closingBal: number | null =
      lastWithBal && lastWithBal.balance !== null
        ? lastWithBal.balance
        : openingBal !== null
          ? round2(openingBal + monthTotalCredits - monthTotalDebits)
          : null;

    let minBal: number | null = null;
    let maxBal: number | null = null;
    let abb: number | null = null;

    if (observedBalances.length > 0) {
      minBal = round2(Math.min(...observedBalances));
      maxBal = round2(Math.max(...observedBalances));
      minObservedBalance =
        minObservedBalance === null ? minBal : Math.min(minObservedBalance, minBal);
      maxObservedBalance =
        maxObservedBalance === null ? maxBal : Math.max(maxObservedBalance, maxBal);

      // True daily end-of-day balance average across calendar days in month
      const firstTxDay = Number(txs[0].isoDate.slice(8, 10)) || 1;
      const startDay = mIdx === 0 && runningPrevClosing === null ? firstTxDay : 1;
      let curBal = openingBal !== null ? openingBal : observedBalances[0];
      const monthDaily: number[] = [];

      for (let d = startDay; d <= daysInMonth; d++) {
        if (dayEndBalance.has(d)) {
          curBal = dayEndBalance.get(d)!;
        }
        monthDaily.push(curBal);
        allDailyBalances.push(curBal);
      }

      if (monthDaily.length > 0) {
        abb = round2(
          monthDaily.reduce((s, v) => s + v, 0) / monthDaily.length,
        );
      }
    }

    if (closingBal !== null) {
      runningPrevClosing = closingBal;
    }

    months.push({
      monthKey: key,
      monthLabel: formatMonthLabel(key),
      openingBalance: openingBal,
      totalCredits: monthTotalCredits,
      businessCredits: monthBusinessCredits,
      nonBusinessCredits: monthNonBusinessCredits,
      totalDebits: monthTotalDebits,
      closingBalance: closingBal,
      minBalance: minBal,
      maxBalance: maxBal,
      abb,
      txCount: txs.length,
    });
  }

  const overallAbb =
    allDailyBalances.length > 0
      ? round2(
          allDailyBalances.reduce((s, v) => s + v, 0) / allDailyBalances.length,
        )
      : null;

  return {
    months,
    overallAbb,
    minObservedBalance:
      minObservedBalance !== null ? round2(minObservedBalance) : null,
    maxObservedBalance:
      maxObservedBalance !== null ? round2(maxObservedBalance) : null,
    totalBusinessCredits: round2(totalBusinessCredits),
    totalNonBusinessCredits: round2(totalNonBusinessCredits),
  };
}

// ============================================================================
// MODULE 4: CASH DEPOSIT & WITHDRAWAL ANALYTICS
// ============================================================================
const CASH_DEPOSIT_RX =
  /\b(BY\s*CASH|CASH\s*DEP(?:OSIT)?|CDM\s*DEP|CASH\s*COUNTER|CSH\s*DEP)\b/i;
const CASH_WITHDRAWAL_RX =
  /\b(TO\s*SELF|SELF\s*CHQ|SELF\s*WITHDRAWAL|TO\s*CASH|ATM\s*WDL|ATM\s*CASH|CASH\s*WDL|CASH\s*WITHDRAWAL|CSH\s*WDL)\b/i;

export function analyzeCashActivity(
  statement: AnalyzedStatement,
): CashAnalyticsSummary {
  const { transactions, integrity } = statement;
  const totalTurnover = round2(integrity.totalCredits + integrity.totalDebits);

  const cashDeposits = transactions.filter(
    (t) =>
      t.credit > 0 &&
      (t.paymentMode === 'CASH' || CASH_DEPOSIT_RX.test(t.narration)),
  );

  const cashWithdrawals = transactions.filter(
    (t) =>
      t.debit > 0 &&
      (t.paymentMode === 'CASH' ||
        t.chequeCategory === 'Self / Cash Withdrawal' ||
        CASH_WITHDRAWAL_RX.test(t.narration)),
  );

  const totalCashDeposits = round2(
    cashDeposits.reduce((s, t) => s + t.credit, 0),
  );
  const totalCashWithdrawals = round2(
    cashWithdrawals.reduce((s, t) => s + t.debit, 0),
  );

  const denomTurnover = Math.max(1, totalTurnover);
  const depositShareOfTurnoverPct = round2(
    (totalCashDeposits / denomTurnover) * 100,
  );
  const withdrawalShareOfTurnoverPct = round2(
    (totalCashWithdrawals / denomTurnover) * 100,
  );
  const combinedCashTurnoverPct = round2(
    ((totalCashDeposits + totalCashWithdrawals) / denomTurnover) * 100,
  );

  const depositShareOfCreditsPct = round2(
    (totalCashDeposits / Math.max(1, integrity.totalCredits)) * 100,
  );
  const withdrawalShareOfDebitsPct = round2(
    (totalCashWithdrawals / Math.max(1, integrity.totalDebits)) * 100,
  );

  return {
    depositCount: cashDeposits.length,
    totalCashDeposits,
    depositShareOfTurnoverPct,
    depositShareOfCreditsPct,
    withdrawalCount: cashWithdrawals.length,
    totalCashWithdrawals,
    withdrawalShareOfTurnoverPct,
    withdrawalShareOfDebitsPct,
    combinedCashTurnoverPct,
    totalBankingTurnover: totalTurnover,
    cashDeposits,
    cashWithdrawals,
  };
}

// ============================================================================
// MODULE 5: STATUTORY & OPERATIONAL EXPENSE VERIFICATION
// ============================================================================
const STATUTORY_CATEGORIES: Array<{
  category: StatutoryCategory;
  label: string;
  rx: RegExp;
  excludeBankFeeGst?: boolean;
}> = [
  {
    category: 'GST',
    label: 'GST (CGST / SGST / IGST)',
    rx: /\b(GSTN|GST\s*PAYMENT|GST\s*CHALLAN|CBIC|CGST|SGST|IGST|GST)\b/i,
    excludeBankFeeGst: true,
  },
  {
    category: 'INCOME TAX',
    label: 'Income Tax / Advance Tax',
    rx: /\b(INCOME\s*TAX|ADVANCE\s*TAX|SELF\s*ASSESSMENT|OLTAS|CBDT|TIN\s*NSDL|NSDL\s*TAX)\b/i,
  },
  {
    category: 'TDS',
    label: 'TDS / Challan 281',
    rx: /\b(TDS|TAX\s*DEDUCTED|CHALLAN\s*281)\b/i,
  },
  {
    category: 'EPF',
    label: 'EPF / Provident Fund',
    rx: /\b(EPFO|EPF|PF\s*PAYMENT|PROVIDENT\s*FUND)\b/i,
  },
  {
    category: 'ESIC',
    label: 'ESIC / Employee Insurance',
    rx: /\b(ESIC|ESI\s*PAYMENT|ESI\s*CONTRIBUTION)\b/i,
  },
  {
    category: 'ELECTRICITY',
    label: 'TNEB / Electricity / Power',
    rx: /\b(TNEB|TANGEDCO|BESCOM|MSEDCL|TORRENT\s*POWER|ADANI\s*ELEC|CESC|POWER\s*BILL|ELECTRICITY|EB\s*BILL)\b/i,
  },
  {
    category: 'RENT',
    label: 'Office / Premises Rent',
    rx: /\b(RENT|OFFICE\s*RENT|GODOWN\s*RENT|SHOP\s*RENT|LEASE\s*RENT|WAREHOUSE\s*RENT)\b/i,
  },
];

export function analyzeStatutoryExpenses(
  transactions: NormalizedTransaction[],
): StatutoryExpenseSummary {
  const items: StatutoryExpenseItem[] = [];
  const catBuckets = new Map<
    StatutoryCategory,
    { label: string; count: number; totalPaid: number; lastPaidDate: string | null }
  >();

  for (const def of STATUTORY_CATEGORIES) {
    catBuckets.set(def.category, {
      label: def.label,
      count: 0,
      totalPaid: 0,
      lastPaidDate: null,
    });
  }

  for (const tx of transactions) {
    if (tx.debit <= 0) continue;
    const text = `${tx.counterparty} ${tx.narration}`;

    for (const def of STATUTORY_CATEGORIES) {
      if (!def.rx.test(text)) continue;

      // Avoid matching trivial bank service fee GST (e.g. "SMS CHG + GST Rs. 18.00")
      if (
        def.excludeBankFeeGst &&
        tx.debit < 1000 &&
        /\b(SMS|CHG|CHARGES|FOLIO|AMC|PENALTY|FEE|CARD)\b/i.test(text) &&
        !/\b(GSTN|CBIC|GST\s*PAYMENT|GST\s*CHALLAN)\b/i.test(text)
      ) {
        continue;
      }

      const bucket = catBuckets.get(def.category)!;
      bucket.count += 1;
      bucket.totalPaid = round2(bucket.totalPaid + tx.debit);
      bucket.lastPaidDate = tx.date;

      items.push({
        id: `stat-${def.category}-${tx.id}`,
        category: def.category,
        transaction: tx,
        amount: tx.debit,
        date: tx.date,
      });
      break;
    }
  }

  const byCategory: StatutoryCategorySummary[] = STATUTORY_CATEGORIES.map((def) => {
    const b = catBuckets.get(def.category)!;
    return {
      category: def.category,
      label: b.label,
      count: b.count,
      totalPaid: b.totalPaid,
      lastPaidDate: b.lastPaidDate,
    };
  });

  const totalStatutoryAndOpexPaid = round2(
    items.reduce((sum, i) => sum + i.amount, 0),
  );

  return {
    totalStatutoryAndOpexPaid,
    totalCount: items.length,
    activeCategoriesCount: byCategory.filter((c) => c.count > 0).length,
    byCategory,
    items,
  };
}

// ============================================================================
// MODULE 6: TOP 10 BUYERS & TOP 10 SUPPLIERS CONCENTRATION
// ============================================================================
const CONCENTRATION_SKIP_RX =
  /^\s*(BANK\s*CHARGES|SMS\s*CHARGES|CASH\s*DEPOSIT|CASH\s*WITHDRAWAL|SELF|UNSPECIFIED|OPENING\s*BALANCE|CLOSING\s*BALANCE)\s*$/i;

function buildTopConcentration(
  transactions: NormalizedTransaction[],
  direction: 'credit' | 'debit',
  denominatorTotal: number,
): ConcentrationParty[] {
  const groups: Array<{
    partyName: string;
    normalizedKey: string;
    tokens: string[];
    totalAmount: number;
    latestDate: string;
    transactions: NormalizedTransaction[];
  }> = [];

  for (const tx of transactions) {
    const amt = direction === 'credit' ? tx.credit : tx.debit;
    if (amt <= 0) continue;
    if (tx.paymentMode === 'CHARGES') continue;

    const candidateRaw =
      direction === 'debit' && tx.chequePayee && tx.chequePayee !== 'Self / Cash Withdrawal'
        ? tx.chequePayee
        : tx.counterparty;

    if (CONCENTRATION_SKIP_RX.test(candidateRaw)) continue;

    const cpTokens = normalizeEntityTokens(candidateRaw || '');
    const tokens =
      cpTokens.length > 0
        ? cpTokens.slice(0, 4)
        : normalizeEntityTokens(tx.narration).slice(0, 4);

    if (tokens.length === 0) continue;

    const key = tokens.join(' ');
    const displayName = toTitleCase(key).slice(0, 52);

    // Fuzzy group merge with already discovered entities
    let matchedGroup = groups.find((g) => g.normalizedKey === key);
    if (!matchedGroup) {
      matchedGroup = groups.find(
        (g) => computeCounterpartySimilarity(g.tokens, key).score >= 0.72,
      );
    }

    if (matchedGroup) {
      matchedGroup.totalAmount = round2(matchedGroup.totalAmount + amt);
      matchedGroup.latestDate = tx.date;
      matchedGroup.transactions.push(tx);
    } else {
      groups.push({
        partyName: displayName,
        normalizedKey: key,
        tokens,
        totalAmount: round2(amt),
        latestDate: tx.date,
        transactions: [tx],
      });
    }
  }

  groups.sort((a, b) => b.totalAmount - a.totalAmount);
  const denom = Math.max(1, denominatorTotal);

  return groups.slice(0, 10).map((g, idx) => ({
    rank: idx + 1,
    partyName: g.partyName,
    normalizedKey: g.normalizedKey,
    txCount: g.transactions.length,
    totalAmount: g.totalAmount,
    sharePct: round2((g.totalAmount / denom) * 100),
    latestDate: g.latestDate,
    transactions: g.transactions,
  }));
}

export function analyzeCounterpartyConcentration(
  statement: AnalyzedStatement,
): ConcentrationSummary {
  const { transactions, integrity } = statement;
  const topBuyers = buildTopConcentration(
    transactions,
    'credit',
    integrity.totalCredits,
  );
  const topSuppliers = buildTopConcentration(
    transactions,
    'debit',
    integrity.totalDebits,
  );

  return {
    topBuyers,
    topSuppliers,
    topBuyersConcentrationPct: round2(
      topBuyers.reduce((s, p) => s + p.sharePct, 0),
    ),
    topSuppliersConcentrationPct: round2(
      topSuppliers.reduce((s, p) => s + p.sharePct, 0),
    ),
  };
}

// ============================================================================
// MODULE 7: EXECUTIVE CREDIT RISK SCORE (0-100) & ANALYST SUMMARY NOTE
// ============================================================================
export function assessCreditRisk(
  statement: AnalyzedStatement,
  loanSummary: LoanAnalysisSummary,
  bounceReturns: BounceReturnSummary,
  circularTransactions: CircularDetectionSummary,
  abbMatrix: AbbSummary,
  cashAnalytics: CashAnalyticsSummary,
  statutoryExpenses: StatutoryExpenseSummary,
): CreditRiskAssessment {
  let score = 100;
  const factors: ScoreFactor[] = [];

  // 1. Bounce / Return Rate Factor (max -35 pts)
  if (bounceReturns.totalBounceCount === 0) {
    factors.push({
      label: 'Cheque & NACH Conduct',
      impact: 0,
      status: 'positive',
      detail: 'Zero inward/outward cheque bounces or NACH/ECS returns observed.',
    });
  } else {
    const bouncePenalty = Math.min(
      35,
      bounceReturns.outwardCount * 10 + bounceReturns.inwardCount * 5,
    );
    score -= bouncePenalty;
    factors.push({
      label: 'Cheque & NACH Returns',
      impact: -bouncePenalty,
      status: bouncePenalty >= 15 ? 'negative' : 'warning',
      detail: `${bounceReturns.outwardCount} outward & ${bounceReturns.inwardCount} inward returns (${bounceReturns.bounceRatePct}% rate).`,
    });
  }

  // 2. Average Bank Balance (ABB) & Liquidity Cushion (max -20 pts)
  const monthCount = Math.max(1, abbMatrix.months.length);
  const avgMonthlyDebit = statement.integrity.totalDebits / monthCount;
  if (abbMatrix.overallAbb === null) {
    score -= 5;
    factors.push({
      label: 'ABB & Liquidity Buffer',
      impact: -5,
      status: 'neutral',
      detail: 'Running balance column unavailable to compute daily ABB.',
    });
  } else if (
    abbMatrix.minObservedBalance !== null &&
    abbMatrix.minObservedBalance < 0
  ) {
    score -= 15;
    factors.push({
      label: 'ABB & Liquidity Buffer',
      impact: -15,
      status: 'negative',
      detail: `Overdrawn / negative balance observed (Min: ${formatINR(abbMatrix.minObservedBalance)}; ABB: ${formatINR(abbMatrix.overallAbb)}).`,
    });
  } else if (avgMonthlyDebit > 0 && abbMatrix.overallAbb < avgMonthlyDebit * 0.05) {
    score -= 10;
    factors.push({
      label: 'ABB & Liquidity Buffer',
      impact: -10,
      status: 'warning',
      detail: `Thin average balance (${formatINR(abbMatrix.overallAbb)}) relative to monthly debit outflow.`,
    });
  } else {
    factors.push({
      label: 'ABB & Liquidity Buffer',
      impact: 0,
      status: 'positive',
      detail: `Healthy daily ABB of ${formatINR(abbMatrix.overallAbb)} with zero overdrawals.`,
    });
  }

  // 3. Undisclosed Outside Private Borrowing (max -20 pts)
  if (loanSummary.tracedPrivateCount === 0) {
    factors.push({
      label: 'Outside Private Borrowings',
      impact: 0,
      status: 'positive',
      detail: 'No private financier or unsecured associate repayment chains detected.',
    });
  } else {
    const privatePenalty = Math.min(20, loanSummary.tracedPrivateCount * 8);
    score -= privatePenalty;
    factors.push({
      label: 'Outside Private Borrowings',
      impact: -privatePenalty,
      status: privatePenalty >= 15 ? 'negative' : 'warning',
      detail: `${loanSummary.tracedPrivateCount} traced private/associate borrowing chains (${formatINR(loanSummary.tracedPrivatePrincipal)} principal).`,
    });
  }

  // 4. Circular / Round-Tripping Entries (max -20 pts)
  if (circularTransactions.pairCount === 0) {
    factors.push({
      label: 'Circular Fund Rotation',
      impact: 0,
      status: 'positive',
      detail: 'No 1-to-3 day round-tripping or accommodation pairs detected.',
    });
  } else {
    const circPenalty = Math.min(20, circularTransactions.pairCount * 7);
    score -= circPenalty;
    factors.push({
      label: 'Circular Fund Rotation',
      impact: -circPenalty,
      status: circPenalty >= 14 ? 'negative' : 'warning',
      detail: `${circularTransactions.pairCount} suspected round-tripping pairs (${formatINR(circularTransactions.totalRotatedAmount)}).`,
    });
  }

  // 5. Cash Intensity & Statutory Compliance (max -10 / +0)
  if (cashAnalytics.combinedCashTurnoverPct > 30) {
    score -= 10;
    factors.push({
      label: 'Cash Turnover Intensity',
      impact: -10,
      status: 'warning',
      detail: `Elevated cash share at ${cashAnalytics.combinedCashTurnoverPct}% of total banking turnover.`,
    });
  } else {
    factors.push({
      label: 'Cash & Statutory Discipline',
      impact: 0,
      status: statutoryExpenses.activeCategoriesCount > 0 ? 'positive' : 'neutral',
      detail: `Cash intensity ${cashAnalytics.combinedCashTurnoverPct}%; ${statutoryExpenses.activeCategoriesCount} statutory/opex categories verified.`,
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let ratingBand: RiskRatingBand;
  if (score >= 85) ratingBand = 'Strong Conduct';
  else if (score >= 70) ratingBand = 'Satisfactory Conduct';
  else if (score >= 50) ratingBand = 'Moderate Risk — Review';
  else ratingBand = 'High Risk — Caution';

  const holder =
    statement.metadata.accountHolderName ||
    `${statement.metadata.detectedBank} Corporate Account`;
  const periodStr =
    statement.metadata.statementPeriod ||
    (abbMatrix.months.length > 0
      ? `${abbMatrix.months[0].monthLabel} to ${abbMatrix.months[abbMatrix.months.length - 1].monthLabel}`
      : 'Uploaded Statement Period');

  const abbText =
    abbMatrix.overallAbb !== null ? formatINR(abbMatrix.overallAbb) : 'Unavailable';

  const summaryNote =
    `CREDIT OFFICER SUMMARY NOTE — ${holder} (${statement.metadata.detectedBank}${
      statement.metadata.accountNumber ? ` · A/C ${statement.metadata.accountNumber}` : ''
    }, ${periodStr}): ` +
    `Account Conduct Score is ${score}/100 (${ratingBand}). ` +
    `Total Credits stood at ${formatINR(statement.integrity.totalCredits)} (Business Credits: ${formatINR(abbMatrix.totalBusinessCredits)}) against Total Debits of ${formatINR(statement.integrity.totalDebits)}, maintaining an Average Bank Balance (ABB) of ${abbText}. ` +
    `Cheque/NACH discipline shows ${bounceReturns.outwardCount} outward and ${bounceReturns.inwardCount} inward returns (${bounceReturns.bounceRatePct}% bounce rate). ` +
    `Underwriting screens flagged ${circularTransactions.pairCount} suspected circular rotation pair(s) and ${loanSummary.tracedPrivateCount} private/associate borrowing chain(s) alongside ${loanSummary.institutionalLoanCount} institutional EMI lender(s). ` +
    `Cash deposits & withdrawals represent ${cashAnalytics.combinedCashTurnoverPct}% of total turnover, with ${formatINR(statutoryExpenses.totalStatutoryAndOpexPaid)} verified across ${statutoryExpenses.activeCategoriesCount} statutory/operational payment categories.`;

  return {
    score,
    ratingBand,
    factors,
    summaryNote,
  };
}

// ============================================================================
// UNIFIED ENTRY POINT
// ============================================================================
export function analyzeCreditUnderwriting(
  statement: AnalyzedStatement,
  loanSummary: LoanAnalysisSummary,
): CreditUnderwritingReport {
  const bounceReturns = analyzeBounceAndReturns(statement.transactions);
  const circularTransactions = detectCircularTransactions(statement.transactions);
  const abbMatrix = analyzeMonthWiseAbb(statement, loanSummary);
  const cashAnalytics = analyzeCashActivity(statement);
  const statutoryExpenses = analyzeStatutoryExpenses(statement.transactions);
  const concentration = analyzeCounterpartyConcentration(statement);
  const riskAssessment = assessCreditRisk(
    statement,
    loanSummary,
    bounceReturns,
    circularTransactions,
    abbMatrix,
    cashAnalytics,
    statutoryExpenses,
  );

  return {
    bounceReturns,
    circularTransactions,
    abbMatrix,
    cashAnalytics,
    statutoryExpenses,
    concentration,
    riskAssessment,
  };
}
