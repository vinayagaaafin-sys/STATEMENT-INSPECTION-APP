import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfForensicsReport } from '../types/statement';
import { IncorrectPasswordError, PasswordRequiredError } from './excelDecrypt';
import { analyzePdfForensicsFromBytes } from './pdfForensicsEngine';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function isPdfCandidate(file: File, bytes: Uint8Array): boolean {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    return true;
  }
  const head = String.fromCharCode(...bytes.subarray(0, 16));
  return head.includes('%PDF-');
}

export async function analyzePdfForensics(
  file: File,
  password?: string,
): Promise<PdfForensicsReport> {
  const buffer = await file.arrayBuffer();
  const rawBytes = new Uint8Array(buffer);

  if (!isPdfCandidate(file, rawBytes)) {
    throw new Error(
      `Unsupported file "${file.name}". Please upload a valid PDF (.pdf) bank statement for metadata forensics.`,
    );
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer.slice(0)),
    password,
  });

  let pdfDoc: pdfjsLib.PDFDocumentProxy;
  try {
    pdfDoc = await loadingTask.promise;
  } catch (err: unknown) {
    const pdfErr = err as { name?: string; code?: number; message?: string };
    if (
      pdfErr?.name === 'PasswordException' ||
      pdfErr?.code === pdfjsLib.PasswordResponses.NEED_PASSWORD ||
      pdfErr?.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD ||
      (pdfErr?.message || '').toLowerCase().includes('password')
    ) {
      if (
        pdfErr?.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD ||
        Boolean(password)
      ) {
        throw new IncorrectPasswordError();
      }
      throw new PasswordRequiredError(file.name);
    }
    throw err;
  }

  let info: Record<string, unknown> | null = null;
  const xmpMap: Record<string, string> = {};

  try {
    const meta = await pdfDoc.getMetadata();
    if (meta?.info && typeof meta.info === 'object') {
      info = meta.info as Record<string, unknown>;
    }
    const xmpContainer = meta?.metadata as unknown as
      | { getAll?: () => Record<string, unknown> }
      | null
      | undefined;
    if (xmpContainer && typeof xmpContainer.getAll === 'function') {
      const allXmp = xmpContainer.getAll();
      if (allXmp && typeof allXmp === 'object') {
        for (const [key, val] of Object.entries(allXmp)) {
          if (typeof val === 'string' && val.trim().length > 0) {
            xmpMap[key.toLowerCase()] = val.trim();
          }
        }
      }
    }
  } finally {
    try {
      const disposableDoc = pdfDoc as unknown as {
        destroy?: () => Promise<void>;
        cleanup?: () => Promise<void>;
      };
      if (typeof disposableDoc.destroy === 'function') {
        await disposableDoc.destroy();
      } else if (typeof disposableDoc.cleanup === 'function') {
        await disposableDoc.cleanup();
      }
    } catch {
      // Ignore cleanup errors on already-disposed documents
    }
  }

  return analyzePdfForensicsFromBytes(rawBytes, file.name, file.size, {
    info,
    xmpMap,
  });
}
