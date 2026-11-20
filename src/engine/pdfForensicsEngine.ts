import type {
  ForensicFieldRow,
  ForensicFieldStatus,
  PdfForensicsReport,
} from '../types/statement';

export interface PdfJsMetadataSnapshot {
  info?: Record<string, unknown> | null;
  xmpMap?: Record<string, string> | null;
}

const KNOWN_EDITING_TOOLS: Array<{ label: string; rx: RegExp }> = [
  { label: 'iLovePDF', rx: /\bilovepdf\b/i },
  { label: 'SmallPDF', rx: /\bsmallpdf\b/i },
  { label: 'Sejda PDF', rx: /\bsejda\b/i },
  { label: 'PDFescape', rx: /\bpdfescape\b/i },
  { label: 'Adobe Acrobat Pro / Editor', rx: /\b(?:adobe\s*acrobat|acrobat\s*(?:pro|standard|dc|distiller\s*edit))\b/i },
  { label: 'Adobe Photoshop', rx: /\bphotoshop\b/i },
  { label: 'Adobe Illustrator / InDesign', rx: /\b(?:illustrator|indesign)\b/i },
  { label: 'Foxit PDF Editor', rx: /\bfoxit\b/i },
  { label: 'Canva', rx: /\bcanva\b/i },
  { label: 'Microsoft Word', rx: /\bmicrosoft[®\s]*word\b/i },
  { label: 'Microsoft Excel', rx: /\bmicrosoft[®\s]*excel\b/i },
  { label: 'Microsoft Print to PDF', rx: /\bmicrosoft\s*print\s*to\s*pdf\b/i },
  { label: 'LibreOffice / OpenOffice', rx: /\b(?:libreoffice|openoffice)\b/i },
  { label: 'Mac Preview / Quartz PDFContext', rx: /\b(?:quartz\s*pdfcontext|mac\s*os\s*x.*quartz|apple\s*preview)\b/i },
  { label: 'Nitro PDF Editor', rx: /\bnitro\s*(?:pdf|pro)\b/i },
  { label: 'Wondershare PDFelement', rx: /\b(?:pdfelement|wondershare)\b/i },
  { label: 'PDFsam / PDF24 / Soda PDF', rx: /\b(?:pdfsam|pdf24|soda\s*pdf|docfly)\b/i },
  { label: 'WPS Office PDF', rx: /\bwps\s*(?:office|writer|pdf)\b/i },
  { label: 'Chrome / Skia PDF Print', rx: /\b(?:skia\/pdf|headlesschrome)\b/i },
];

const BANKING_PDF_ENGINES: Array<{ label: string; rx: RegExp }> = [
  { label: 'JasperReports', rx: /\bjasper\s*reports?\b/i },
  { label: 'iText / Lowagie / OpenPDF', rx: /\b(?:itext|itextsharp|lowagie|openpdf)\b/i },
  { label: 'Oracle BI Publisher / XMLP', rx: /\b(?:oracle\s*bi\s*publisher|oracle\s*xml|bi\s*publisher|xdo)\b/i },
  { label: 'SAP NetWeaver / SmartForms', rx: /\bsap\b/i },
  { label: 'Infosys Finacle', rx: /\bfinacle\b/i },
  { label: 'TCS BaNCS / Core Banking', rx: /\b(?:bancs|tcs|flexcube|temenos|t24)\b/i },
  { label: 'Apache FOP / PDFBox', rx: /\b(?:apache\s*fop|pdfbox)\b/i },
  { label: 'Crystal Reports', rx: /\bcrystal\s*reports\b/i },
  { label: 'ReportLab', rx: /\breportlab\b/i },
  { label: 'Aspose.PDF / Syncfusion', rx: /\b(?:aspose|syncfusion|telerik)\b/i },
  { label: 'wkhtmltopdf / Flying Saucer', rx: /\b(?:wkhtmltopdf|flying\s*saucer|xhtmlrenderer|bfo)\b/i },
  { label: 'TCPDF / FPDF / mPDF / PDFlib', rx: /\b(?:tcpdf|fpdf|mpdf|pdflib)\b/i },
  { label: 'Datalogics / Haru / Ghostscript Enterprise', rx: /\b(?:datalogics|libharu|haru)\b/i },
];

function decodePdfTextValue(raw: string): string {
  let s = raw.trim();
  if (!s) return '';

  // Handle UTF-16BE BOM (\xFE\xFF)
  if (s.charCodeAt(0) === 0xfe && s.charCodeAt(1) === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < s.length; i += 2) {
      const code = (s.charCodeAt(i) << 8) | s.charCodeAt(i + 1);
      if (code !== 0) out += String.fromCharCode(code);
    }
    return out.trim();
  }

  // Unescape common PDF literal escapes
  s = s
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\r/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\\([0-7]{3})/g, (_, oct) =>
      String.fromCharCode(Number.parseInt(oct, 8)),
    );

  return s.replace(/\0/g, '').trim();
}

function extractRawInfoField(latin1Text: string, key: string): string | null {
  // Match balanced parenthesized PDF literal string: /Key (value)
  const rx = new RegExp(`/${key}\\s*\\(([^()\\\\]*(?:\\\\.[^()\\\\]*)*)\\)`, 'g');
  let lastMatch: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(latin1Text)) !== null) {
    const decoded = decodePdfTextValue(m[1]);
    if (decoded) lastMatch = decoded;
  }
  return lastMatch;
}

function extractRawXmpPacket(latin1Text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const startIdx = latin1Text.indexOf('<x:xmpmeta');
  const endIdx =
    startIdx >= 0 ? latin1Text.indexOf('</x:xmpmeta>', startIdx) : -1;

  let xml = '';
  if (startIdx >= 0 && endIdx > startIdx) {
    xml = latin1Text.slice(startIdx, endIdx + 12);
  } else {
    const rdfStart = latin1Text.indexOf('<rdf:RDF');
    const rdfEnd = rdfStart >= 0 ? latin1Text.indexOf('</rdf:RDF>', rdfStart) : -1;
    if (rdfStart >= 0 && rdfEnd > rdfStart) {
      xml = latin1Text.slice(rdfStart, rdfEnd + 10);
    }
  }

  if (!xml) return result;

  const tags = [
    'pdf:Producer',
    'xmp:CreatorTool',
    'xmp:CreateDate',
    'xmp:ModifyDate',
    'xmp:MetadataDate',
    'xap:CreatorTool',
    'xap:CreateDate',
    'xap:ModifyDate',
  ];

  for (const tag of tags) {
    // Element syntax <tag>value</tag>
    const elemRx = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i');
    const elemMatch = xml.match(elemRx);
    if (elemMatch && elemMatch[1].trim()) {
      result[tag] = elemMatch[1].trim();
      continue;
    }

    // Attribute syntax tag="value"
    const attrRx = new RegExp(`${tag}\\s*=\\s*["']([^"']+)["']`, 'i');
    const attrMatch = xml.match(attrRx);
    if (attrMatch && attrMatch[1].trim()) {
      result[tag] = attrMatch[1].trim();
    }
  }

  return result;
}

export function parsePdfDate(raw: string | null | undefined): {
  epochMs: number | null;
  formatted: string | null;
} {
  if (!raw) return { epochMs: null, formatted: null };
  const s = String(raw).trim();
  if (!s) return { epochMs: null, formatted: null };

  // 1. PDF Date string: D:YYYYMMDDHHmmSSOHH'mm'
  const pdfRx =
    /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz])|([+\-])(\d{2})'?(\d{2})'?)?/;
  const m = s.match(pdfRx);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2] || '01');
    const day = Number(m[3] || '01');
    const hour = Number(m[4] || '00');
    const min = Number(m[5] || '00');
    const sec = Number(m[6] || '00');

    let offsetMinutes = 0;
    if (m[8]) {
      const sign = m[8] === '-' ? -1 : 1;
      offsetMinutes = sign * (Number(m[9] || '0') * 60 + Number(m[10] || '0'));
    }

    const utcMs =
      Date.UTC(year, month - 1, day, hour, min, sec) - offsetMinutes * 60_000;
    if (Number.isFinite(utcMs)) {
      const dt = new Date(utcMs);
      return {
        epochMs: utcMs,
        formatted: dt.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };
    }
  }

  // 2. ISO 8601 XMP Date
  const parsedMs = Date.parse(s);
  if (Number.isFinite(parsedMs)) {
    return {
      epochMs: parsedMs,
      formatted: new Date(parsedMs).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };
  }

  return { epochMs: null, formatted: s };
}

function formatDurationDelta(seconds: number): string {
  const abs = Math.abs(Math.round(seconds));
  if (abs < 60) return `${abs}s`;
  const mins = Math.floor(abs / 60);
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ${hrs % 24}h`;
}

function pickString(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.replace(/\0/g, '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function analyzePdfForensicsFromBytes(
  bytes: Uint8Array,
  fileName: string,
  fileSizeBytes: number,
  pdfjsMeta?: PdfJsMetadataSnapshot,
): PdfForensicsReport {
  // Convert bytes to Latin-1 string (1:1 byte preserving ASCII markers, /Info, XMP, %%EOF)
  let latin1 = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    latin1 += String.fromCharCode(...slice);
  }

  // 1. PDF Header Version & Structural Signals
  const headerSlice = latin1.slice(0, 1024);
  const versionMatch = headerSlice.match(/%PDF-(\d+\.\d+)/);
  const pdfVersion = versionMatch ? versionMatch[1] : null;

  const eofMatches = latin1.match(/%%EOF/g);
  const eofMarkerCount = eofMatches ? eofMatches.length : 0;

  const hasDigitalSignature =
    /\/Type\s*\/Sig\b/.test(latin1) && /\/ByteRange\s*\[/.test(latin1);
  const isEncrypted = /\/Encrypt\b/.test(latin1);

  // 2. Merge Document Info & XMP Metadata (prefer pdfjs parsed values, fallback to raw byte scan)
  const rawXmp = extractRawXmpPacket(latin1);
  const info = pdfjsMeta?.info || {};
  const xmp = pdfjsMeta?.xmpMap || {};

  const producer =
    pickString(info.Producer) || extractRawInfoField(latin1, 'Producer');
  const creator =
    pickString(info.Creator) || extractRawInfoField(latin1, 'Creator');
  const creationDateRaw =
    pickString(info.CreationDate) || extractRawInfoField(latin1, 'CreationDate');
  const modDateRaw =
    pickString(info.ModDate) || extractRawInfoField(latin1, 'ModDate');

  const xmpProducer =
    pickString(xmp['pdf:producer']) || pickString(rawXmp['pdf:Producer']);
  const xmpCreatorTool =
    pickString(xmp['xmp:creatortool']) ||
    pickString(rawXmp['xmp:CreatorTool']) ||
    pickString(rawXmp['xap:CreatorTool']);
  const xmpCreateDate =
    pickString(xmp['xmp:createdate']) ||
    pickString(rawXmp['xmp:CreateDate']) ||
    pickString(rawXmp['xap:CreateDate']);
  const xmpModifyDate =
    pickString(xmp['xmp:modifydate']) ||
    pickString(rawXmp['xmp:ModifyDate']) ||
    pickString(rawXmp['xap:ModifyDate']);

  // 3. Evaluate Software Tampering Rules
  const combinedSoftware = [producer, creator, xmpProducer, xmpCreatorTool]
    .filter(Boolean)
    .join(' | ');

  const matchedEditingTools: string[] = [];
  for (const tool of KNOWN_EDITING_TOOLS) {
    if (tool.rx.test(combinedSoftware)) {
      matchedEditingTools.push(tool.label);
    }
  }

  let matchedBankingEngine: string | null = null;
  for (const engine of BANKING_PDF_ENGINES) {
    if (engine.rx.test(combinedSoftware)) {
      matchedBankingEngine = engine.label;
      break;
    }
  }

  // 4. Evaluate Timestamp Consistency (Info & XMP)
  const effectiveCreationRaw = creationDateRaw || xmpCreateDate;
  const effectiveModRaw = modDateRaw || xmpModifyDate;
  const parsedCreate = parsePdfDate(effectiveCreationRaw);
  const parsedMod = parsePdfDate(effectiveModRaw);

  let timestampDeltaSeconds: number | null = null;
  let hasTimestampMismatch = false;
  if (parsedCreate.epochMs !== null && parsedMod.epochMs !== null) {
    timestampDeltaSeconds = Math.round(
      (parsedMod.epochMs - parsedCreate.epochMs) / 1000,
    );
    // Flag if modified > 120 seconds after creation (or before creation)
    if (Math.abs(timestampDeltaSeconds) > 120) {
      hasTimestampMismatch = true;
    }
  }

  // 5. Evaluate Missing / Stripped Metadata & Incremental Updates
  const isGeneratorStripped = !producer && !creator && !xmpProducer && !xmpCreatorTool;
  const isCreationDateMissing = !effectiveCreationRaw;
  const hasSuspiciousIncrementalUpdates =
    eofMarkerCount > 1 && !(hasDigitalSignature && eofMarkerCount === 2);

  // 6. Compile Exact Tampering Reasons
  const reasons: string[] = [];

  for (const tool of matchedEditingTools) {
    reasons.push(`Edited or processed using ${tool}`);
  }

  if (hasTimestampMismatch && timestampDeltaSeconds !== null) {
    const dir =
      timestampDeltaSeconds >= 0
        ? `${formatDurationDelta(timestampDeltaSeconds)} after creation`
        : `${formatDurationDelta(timestampDeltaSeconds)} before creation`;
    reasons.push(`Modification date does not match creation date (${dir})`);
  }

  if (isGeneratorStripped) {
    reasons.push(
      'Standard banking generator signatures (Producer / Creator) are missing or stripped',
    );
  }

  if (isCreationDateMissing) {
    reasons.push('PDF CreationDate timestamp is missing or stripped');
  }

  if (hasSuspiciousIncrementalUpdates) {
    reasons.push(
      `Multiple EOF markers detected (${eofMarkerCount} %%EOF markers indicating post-creation incremental saves)`,
    );
  }

  const verdict = reasons.length === 0 ? 'original' : 'modified';
  const verdictLabel =
    verdict === 'original' ? 'Original Bank PDF' : 'Modified PDF Warning';

  // 7. Build Forensic Breakdown Table (Raw Metadata vs. Risk Status)
  const fields: ForensicFieldRow[] = [];

  // Producer
  const producerHit = KNOWN_EDITING_TOOLS.find(
    (t) => producer && t.rx.test(producer),
  );
  const producerStatus: ForensicFieldStatus = producerHit
    ? 'tampered'
    : isGeneratorStripped
      ? 'warning'
      : matchedBankingEngine && producer && BANKING_PDF_ENGINES.some((e) => e.rx.test(producer))
        ? 'verified'
        : 'clean';
  fields.push({
    field: 'Producer',
    rawValue: producer || 'Missing / Stripped',
    xmpValue: xmpProducer,
    ruleChecked: 'Known PDF Editor & Bank Engine Signature',
    status: producerStatus,
    detail: producerHit
      ? `Flagged manipulation tool: ${producerHit.label}`
      : isGeneratorStripped
        ? 'Producer metadata absent'
        : matchedBankingEngine
          ? `Matches standard generator (${matchedBankingEngine})`
          : 'No PDF editor software detected',
  });

  // Creator
  const creatorHit = KNOWN_EDITING_TOOLS.find(
    (t) => creator && t.rx.test(creator),
  );
  const creatorStatus: ForensicFieldStatus = creatorHit
    ? 'tampered'
    : isGeneratorStripped
      ? 'warning'
      : creator
        ? matchedBankingEngine && BANKING_PDF_ENGINES.some((e) => e.rx.test(creator))
          ? 'verified'
          : 'clean'
        : 'clean';
  fields.push({
    field: 'Creator',
    rawValue: creator || 'Not Specified',
    xmpValue: xmpCreatorTool,
    ruleChecked: 'Authoring Application Check',
    status: creatorStatus,
    detail: creatorHit
      ? `Flagged authoring/editing tool: ${creatorHit.label}`
      : isGeneratorStripped
        ? 'Creator metadata absent'
        : 'No editing software signature found',
  });

  // CreationDate
  fields.push({
    field: 'CreationDate',
    rawValue: parsedCreate.formatted
      ? `${parsedCreate.formatted} (${effectiveCreationRaw})`
      : effectiveCreationRaw || 'Missing / Stripped',
    xmpValue: xmpCreateDate,
    ruleChecked: 'Presence of Original Generation Timestamp',
    status: isCreationDateMissing ? 'warning' : 'clean',
    detail: isCreationDateMissing
      ? 'Creation timestamp missing from Info and XMP dictionaries'
      : 'Valid creation timestamp present',
  });

  // ModDate
  fields.push({
    field: 'ModDate',
    rawValue: parsedMod.formatted
      ? `${parsedMod.formatted} (${effectiveModRaw})`
      : effectiveModRaw || 'Absent (Unmodified)',
    xmpValue: xmpModifyDate,
    ruleChecked: 'CreationDate vs. ModDate Delta (> 2 mins)',
    status: hasTimestampMismatch ? 'tampered' : 'clean',
    detail: hasTimestampMismatch && timestampDeltaSeconds !== null
      ? `Timestamp mismatch: ${formatDurationDelta(timestampDeltaSeconds)} gap from CreationDate`
      : parsedMod.epochMs !== null
        ? 'Matches CreationDate within normal generation window'
        : 'No post-creation modification timestamp',
  });

  // PDF Version
  fields.push({
    field: 'PDF Version',
    rawValue: pdfVersion ? `PDF ${pdfVersion}` : 'Unknown Header',
    xmpValue: null,
    ruleChecked: 'Binary %PDF-x.y Header Validation',
    status: pdfVersion ? 'clean' : 'warning',
    detail: pdfVersion
      ? `Standard PDF specification v${pdfVersion}`
      : 'Missing standard %PDF header',
  });

  // EOF / Incremental Updates
  fields.push({
    field: 'Incremental Updates (%%EOF)',
    rawValue: `${eofMarkerCount} %%EOF marker(s)${hasDigitalSignature ? ' · Digitally Signed' : ''}`,
    xmpValue: null,
    ruleChecked: 'Post-Creation Appended Revision Check',
    status: hasSuspiciousIncrementalUpdates
      ? 'tampered'
      : hasDigitalSignature
        ? 'verified'
        : 'clean',
    detail: hasSuspiciousIncrementalUpdates
      ? `${eofMarkerCount} EOF trailers found without digital signature — indicates re-saving/editing`
      : hasDigitalSignature
        ? 'Digital signature /ByteRange trailer intact'
        : 'Single EOF trailer — no incremental post-save edits',
  });

  return {
    fileName,
    fileSizeBytes,
    analyzedAtIso: new Date().toISOString(),
    verdict,
    verdictLabel,
    reasons,
    pdfVersion,
    eofMarkerCount,
    hasDigitalSignature,
    isEncrypted,
    producer,
    creator,
    creationDateRaw,
    creationDateFormatted: parsedCreate.formatted,
    modDateRaw: modDateRaw,
    modDateFormatted: parsedMod.formatted,
    xmpProducer,
    xmpCreatorTool,
    xmpCreateDate,
    xmpModifyDate,
    matchedBankingEngine,
    matchedEditingTools,
    timestampDeltaSeconds,
    fields,
  };
}
