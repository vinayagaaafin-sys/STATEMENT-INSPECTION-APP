import * as XLSX from 'xlsx';

export class PasswordRequiredError extends Error {
  constructor(fileName?: string) {
    super(
      fileName
        ? `Document "${fileName}" is password-protected.`
        : 'Document is password-protected.',
    );
    this.name = 'PasswordRequiredError';
  }
}

export class IncorrectPasswordError extends Error {
  constructor(message = 'Incorrect password. Please try again.') {
    super(message);
    this.name = 'IncorrectPasswordError';
  }
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function uint32LE(val: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, val, true);
  return buf;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function utf16LE(str: string): Uint8Array {
  const out = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return out;
}

function toExactSize(bytes: Uint8Array, length: number, fillByte = 0): Uint8Array {
  if (bytes.length === length) return bytes;
  const out = new Uint8Array(length).fill(fillByte);
  out.set(bytes.subarray(0, Math.min(bytes.length, length)), 0);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function normalizeHashName(raw: string): 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' {
  const u = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (u === 'SHA1') return 'SHA-1';
  if (u === 'SHA256') return 'SHA-256';
  if (u === 'SHA384') return 'SHA-384';
  if (u === 'SHA512') return 'SHA-512';
  return 'SHA-512';
}

async function digest(algo: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512', data: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest(algo, data as unknown as BufferSource);
  return new Uint8Array(buf);
}

/**
 * Performs raw AES-CBC decryption without PKCS#7 padding rejection by appending
 * a forged final padding block derived from the ciphertext's last 16-byte block.
 */
async function aesCbcDecryptRaw(
  rawKey: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  if (ciphertext.length === 0) return new Uint8Array(0);
  const blockAlignedLen = Math.ceil(ciphertext.length / 16) * 16;
  const paddedCipher = toExactSize(ciphertext, blockAlignedLen, 0);
  const lastBlock = paddedCipher.subarray(paddedCipher.length - 16);

  const key = await crypto.subtle.importKey(
    'raw',
    rawKey as unknown as BufferSource,
    { name: 'AES-CBC' },
    false,
    ['encrypt', 'decrypt'],
  );

  // Encrypt 0 bytes with iv=lastBlock produces E_K([0x10 x 16] XOR lastBlock)
  const padBlock = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv: lastBlock as unknown as BufferSource },
      key,
      new Uint8Array(0),
    ),
  );

  const combined = concatBytes(paddedCipher, padBlock);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: toExactSize(iv, 16) as unknown as BufferSource },
    key,
    combined as unknown as BufferSource,
  );
  return new Uint8Array(plain);
}

async function aesEcbDecryptRaw(rawKey: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    rawKey as unknown as BufferSource,
    { name: 'AES-CBC' },
    false,
    ['encrypt', 'decrypt'],
  );
  const zeroIv = new Uint8Array(16);
  const out = new Uint8Array(ciphertext.length);

  for (let off = 0; off < ciphertext.length; off += 16) {
    const block = toExactSize(ciphertext.subarray(off, off + 16), 16);
    const padBlock = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: block as unknown as BufferSource },
        key,
        new Uint8Array(0),
      ),
    );
    const plainBlock = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv: zeroIv as unknown as BufferSource },
        key,
        concatBytes(block, padBlock) as unknown as BufferSource,
      ),
    );
    out.set(plainBlock, off);
  }
  return out;
}

function getAttr(xml: string, tagPattern: RegExp, attrName: string): string | null {
  const tagMatch = xml.match(tagPattern);
  if (!tagMatch) return null;
  const attrRx = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`, 'i');
  const m = tagMatch[0].match(attrRx);
  return m ? m[1] : null;
}

async function decryptAgilePackage(
  encInfoBytes: Uint8Array,
  encPkgBytes: Uint8Array,
  password: string,
): Promise<ArrayBuffer> {
  const xml = new TextDecoder('utf-8').decode(encInfoBytes.subarray(8));

  const keyDataTag = /<keyData\b[^>]*>/i;
  const encKeyTag = /<p:encryptedKey\b[^>]*>|<encryptedKey\b[^>]*>/i;

  const kdSaltB64 = getAttr(xml, keyDataTag, 'saltValue');
  const kdKeyBits = Number.parseInt(getAttr(xml, keyDataTag, 'keyBits') || '256', 10);
  const kdBlockSize = Number.parseInt(getAttr(xml, keyDataTag, 'blockSize') || '16', 10);
  const kdHashAlgo = normalizeHashName(getAttr(xml, keyDataTag, 'hashAlgorithm') || 'SHA512');

  const ekSaltB64 = getAttr(xml, encKeyTag, 'saltValue');
  const ekSpinCount = Number.parseInt(getAttr(xml, encKeyTag, 'spinCount') || '100000', 10);
  const ekKeyBits = Number.parseInt(getAttr(xml, encKeyTag, 'keyBits') || '256', 10);
  const ekBlockSize = Number.parseInt(getAttr(xml, encKeyTag, 'blockSize') || '16', 10);
  const ekHashAlgo = normalizeHashName(getAttr(xml, encKeyTag, 'hashAlgorithm') || 'SHA512');
  const verInputB64 = getAttr(xml, encKeyTag, 'encryptedVerifierHashInput');
  const verValueB64 = getAttr(xml, encKeyTag, 'encryptedVerifierHashValue');
  const encKeyValB64 = getAttr(xml, encKeyTag, 'encryptedKeyValue');

  if (!kdSaltB64 || !ekSaltB64 || !verInputB64 || !verValueB64 || !encKeyValB64) {
    throw new Error('Unsupported Agile encryption metadata in workbook.');
  }

  const kdSalt = base64ToBytes(kdSaltB64);
  const ekSalt = base64ToBytes(ekSaltB64);
  const ekKeyBytes = ekKeyBits / 8;
  const kdKeyBytes = kdKeyBits / 8;

  // Step 1: Iterated password hash H_final
  let h = await digest(ekHashAlgo, concatBytes(ekSalt, utf16LE(password)));
  const iterInput = new Uint8Array(4 + h.length);
  const iterView = new DataView(iterInput.buffer);
  for (let i = 0; i < ekSpinCount; i++) {
    iterView.setUint32(0, i, true);
    iterInput.set(h, 4);
    h = await digest(ekHashAlgo, iterInput);
  }

  // Step 2: Derive keys with ECMA-376 Agile block keys
  const deriveKey = async (blockKey: Uint8Array) =>
    toExactSize(await digest(ekHashAlgo, concatBytes(h, blockKey)), ekKeyBytes, 0x36);

  const verInputKey = await deriveKey(new Uint8Array([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]));
  const verValueKey = await deriveKey(new Uint8Array([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]));
  const pkgKeyKey = await deriveKey(new Uint8Array([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]));

  const ekIv = toExactSize(ekSalt, ekBlockSize);
  const decryptedVerInput = await aesCbcDecryptRaw(verInputKey, ekIv, base64ToBytes(verInputB64));
  const decryptedVerValue = await aesCbcDecryptRaw(verValueKey, ekIv, base64ToBytes(verValueB64));
  const expectedVerHash = await digest(ekHashAlgo, decryptedVerInput);

  if (!bytesEqual(expectedVerHash, decryptedVerValue.subarray(0, expectedVerHash.length))) {
    throw new IncorrectPasswordError();
  }

  // Step 3: Decrypt actual package encryption key
  const pkgKeyRaw = await aesCbcDecryptRaw(pkgKeyKey, ekIv, base64ToBytes(encKeyValB64));
  const packageKey = toExactSize(pkgKeyRaw, kdKeyBytes);

  // Step 4: Decrypt /EncryptedPackage in 4096-byte segments
  const pkgView = new DataView(encPkgBytes.buffer, encPkgBytes.byteOffset, encPkgBytes.byteLength);
  const unencryptedSizeLow = pkgView.getUint32(0, true);
  const unencryptedSizeHigh = pkgView.getUint32(4, true);
  const totalSize = unencryptedSizeHigh * 0x100000000 + unencryptedSizeLow;

  const encryptedPayload = encPkgBytes.subarray(8);
  const decryptedChunks: Uint8Array[] = [];
  const SEGMENT_SIZE = 4096;

  for (let segIdx = 0, offset = 0; offset < encryptedPayload.length; segIdx++, offset += SEGMENT_SIZE) {
    const segCipher = encryptedPayload.subarray(offset, offset + SEGMENT_SIZE);
    const segIv = toExactSize(
      await digest(kdHashAlgo, concatBytes(kdSalt, uint32LE(segIdx))),
      kdBlockSize,
    );
    const plainSeg = await aesCbcDecryptRaw(packageKey, segIv, segCipher);
    decryptedChunks.push(plainSeg);
  }

  const fullDecrypted = concatBytes(...decryptedChunks);
  return fullDecrypted.slice(0, totalSize).buffer;
}

async function decryptStandardPackage(
  encInfoBytes: Uint8Array,
  encPkgBytes: Uint8Array,
  password: string,
): Promise<ArrayBuffer> {
  const view = new DataView(encInfoBytes.buffer, encInfoBytes.byteOffset, encInfoBytes.byteLength);
  const headerSize = view.getUint32(8, true);
  const keyBits = view.getUint32(12 + 16, true) || 128; // EncryptionHeader.keySize at offset 16 inside header
  const verifierOffset = 12 + headerSize;

  const saltSize = view.getUint32(verifierOffset, true);
  const salt = encInfoBytes.subarray(verifierOffset + 4, verifierOffset + 4 + saltSize);
  const encryptedVerifier = encInfoBytes.subarray(verifierOffset + 20, verifierOffset + 36);
  const verifierHashSize = view.getUint32(verifierOffset + 36, true);
  const encryptedVerifierHash = encInfoBytes.subarray(verifierOffset + 40, verifierOffset + 72);

  // Derive SHA-1 key (ECMA-376 Standard Encryption, 50000 iterations)
  let h = await digest('SHA-1', concatBytes(salt, utf16LE(password)));
  const iterBuf = new Uint8Array(4 + h.length);
  const iterView = new DataView(iterBuf.buffer);
  for (let i = 0; i < 50000; i++) {
    iterView.setUint32(0, i, true);
    iterBuf.set(h, 4);
    h = await digest('SHA-1', iterBuf);
  }

  const block0 = await digest('SHA-1', concatBytes(h, uint32LE(0)));
  const buf1 = new Uint8Array(64).fill(0x36);
  for (let i = 0; i < 20; i++) buf1[i] ^= block0[i];
  const x1 = await digest('SHA-1', buf1);

  const buf2 = new Uint8Array(64).fill(0x5c);
  for (let i = 0; i < 20; i++) buf2[i] ^= block0[i];
  const x2 = await digest('SHA-1', buf2);

  const keyLen = keyBits / 8;
  const derivedKey = toExactSize(concatBytes(x1, x2), keyLen);

  const decVerifier = await aesEcbDecryptRaw(derivedKey, encryptedVerifier);
  const decVerifierHash = await aesEcbDecryptRaw(derivedKey, encryptedVerifierHash);
  const expectedHash = await digest('SHA-1', decVerifier);

  if (!bytesEqual(expectedHash, decVerifierHash.subarray(0, Math.min(20, verifierHashSize)))) {
    throw new IncorrectPasswordError();
  }

  const pkgView = new DataView(encPkgBytes.buffer, encPkgBytes.byteOffset, encPkgBytes.byteLength);
  const totalSize = pkgView.getUint32(4, true) * 0x100000000 + pkgView.getUint32(0, true);
  const plain = await aesEcbDecryptRaw(derivedKey, encPkgBytes.subarray(8));
  return plain.slice(0, totalSize).buffer;
}

/**
 * Inspects an Excel buffer; if it is an ECMA-376 encrypted OOXML package,
 * decrypts it in memory using Web Crypto API and returns the raw ZIP ArrayBuffer.
 */
export async function decryptProtectedWorkbookIfNeeded(
  buffer: ArrayBuffer,
  password?: string,
): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(buffer);
  // Check OLE2 / CFB magic header D0 CF 11 E0 A1 B1 1A E1
  const isCfb =
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1;

  if (!isCfb) return buffer;

  const cfb = XLSX.CFB.read(bytes, { type: 'array' });
  const encInfo = XLSX.CFB.find(cfb, '/EncryptionInfo');
  const encPkg = XLSX.CFB.find(cfb, '/EncryptedPackage');

  if (!encInfo || !encPkg) {
    // Either unencrypted .xls or BIFF-encrypted .xls (handled directly by XLSX.read)
    return buffer;
  }

  if (password === undefined || password === '') {
    throw new PasswordRequiredError();
  }

  const infoBytes = new Uint8Array(encInfo.content as number[]);
  const pkgBytes = new Uint8Array(encPkg.content as number[]);
  const view = new DataView(infoBytes.buffer, infoBytes.byteOffset, infoBytes.byteLength);
  const vMajor = view.getUint16(0, true);
  const vMinor = view.getUint16(2, true);

  if (vMajor === 4 && vMinor === 4) {
    return decryptAgilePackage(infoBytes, pkgBytes, password);
  }
  if ((vMajor === 2 || vMajor === 3 || vMajor === 4) && vMinor === 2) {
    return decryptStandardPackage(infoBytes, pkgBytes, password);
  }

  throw new Error('Unsupported Excel workbook encryption scheme.');
}
