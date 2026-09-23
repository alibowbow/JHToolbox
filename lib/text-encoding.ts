/**
 * Text decoding for user-supplied text files (no runtime deps → unit testable).
 *
 * `File.text()` always decodes as UTF-8, which garbles the CP949 CSVs that
 * Korean Excel saves by default. Honour a BOM when present, accept the bytes as
 * UTF-8 when they are valid UTF-8, and otherwise fall back to Korean legacy
 * encoding. The WHATWG "euc-kr" decoder is Windows-949 (CP949), so it also
 * covers the extension syllables (e.g. 똠, 뷁) that strict EUC-KR lacks.
 */

export type DetectedTextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'euc-kr';

export interface DecodedText {
  text: string;
  encoding: DetectedTextEncoding;
}

/** Prepended to CSV output so Excel opens UTF-8 Korean text correctly. */
export const UTF8_BOM = '﻿';

export function decodeTextBytes(bytes: Uint8Array): DecodedText {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be' };
  }

  try {
    // The UTF-8 decoder strips a leading BOM by default.
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('euc-kr').decode(bytes), encoding: 'euc-kr' };
  }
}
