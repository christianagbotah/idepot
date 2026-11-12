/**
 * ESC/POS command stream builder for thermal receipt printers (58mm/32-col
 * and 80mm/48-col profiles) — docs/architecture/pos-hardware.md §2/§5.
 *
 * Design rules:
 *  - PURE: building a document never talks to a device; the caller ships the
 *    final Uint8Array over any transport (USB/serial/network/Bluetooth) via
 *    a PrinterAdapter. This keeps the renderer golden-byte testable and the
 *    transports pluggable (pos-hardware.md §1: the domain layer never sees
 *    device commands).
 *  - Text first, bytes never: callers compose with semantic calls
 *    (text/align/bold/barcode/qr/cut/kick) — raw ESC/POS bytes never leak
 *    into business code.
 *  - Ghana cedi (₵, U+20B5): CP437 (the ESC/POS default codepage) cannot
 *    encode ₵, so amounts render as "GH¢" (the legacy system's convention,
 *    cent sign IS CP437 0x9B) unless a profile sets a printable override.
 *    This is a DOCUMENTED, deliberate choice — not a silent substitution.
 *  - Codepage: builders pin PC437 (ESC t 0) so output is deterministic
 *    regardless of the printer's saved config.
 */

/** Printable width and geometry per printer profile. */
export interface PrinterProfile {
  id: string;
  /** paper width in mm (58 or 80) */
  widthMm: 32 | 58 | 80;
  /** printable columns at 12×24 font (32 for 58mm, 48 for 80mm) */
  columns: number;
  /** cedi rendering for money strings */
  cedi: 'GH¢' | '₵' | 'GHS';
  /** feed lines before an automatic cut */
  feedBeforeCut: number;
}

export const PROFILE_58MM: PrinterProfile = {
  id: 'escpos-58mm',
  widthMm: 58,
  columns: 32,
  cedi: 'GH¢',
  feedBeforeCut: 3,
};

export const PROFILE_80MM: PrinterProfile = {
  id: 'escpos-80mm',
  widthMm: 80,
  columns: 48,
  cedi: 'GH¢',
  feedBeforeCut: 3,
};

export type Align = 'left' | 'center' | 'right';
export type TextSize = 'normal' | 'double-width' | 'double-height' | 'double';

const ESC = 0x1b;
const GS = 0x1d;

/** CP437 high-byte characters used by this builder (everything else is ASCII). */
const CP437 = new Map<string, number>([
  ['¢', 0x9b],
  ['°', 0xf8],
  ['±', 0xf1],
]);

function encode(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code <= 0x7e) {
      bytes.push(code);
    } else if (CP437.has(ch)) {
      bytes.push(CP437.get(ch)!);
    } else {
      // deterministic replacement: unmappable characters become '?'
      bytes.push(0x3f);
    }
  }
  return bytes;
}

/** Builds one ESC/POS document for a specific printer profile. */
export class EscposBuilder {
  private readonly out: number[] = [];

  constructor(private readonly profile: PrinterProfile) {}

  /** ESC @ — initialize (resets justification/styles to power-on state). */
  init(): this {
    this.out.push(ESC, 0x40);
    return this;
  }

  /** Pin codepage PC437 so output is independent of printer config. */
  codepage437(): this {
    this.out.push(ESC, 0x74, 0x00);
    return this;
  }

  align(a: Align): this {
    this.out.push(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2);
    return this;
  }

  bold(on: boolean): this {
    this.out.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  size(s: TextSize): this {
    // ESC ! n bit 4 = double height, bit 5 = double width
    const n =
      s === 'normal' ? 0x00 : s === 'double-width' ? 0x20 : s === 'double-height' ? 0x10 : 0x30;
    this.out.push(ESC, 0x21, n);
    return this;
  }

  /** Plain text line (no wrapping — callers use the layout helpers). */
  text(line: string): this {
    this.out.push(...encode(line));
    return this.newline();
  }

  newline(n = 1): this {
    for (let i = 0; i < n; i++) this.out.push(0x0a);
    return this;
  }

  /** Two-column money row: label left, value right, dotted leader.
   *  Values keep their string form (already formatted by the caller — the
   *  builder NEVER recomputes money). */
  row(label: string, value: string): this {
    const labelTxt = label.endsWith(' ') ? label : `${label} `;
    const valueTxt = value.startsWith(' ') ? value : ` ${value}`;
    const leader = Math.max(1, this.profile.columns - labelTxt.length - valueTxt.length);
    return this.text(`${labelTxt}${'.'.repeat(leader)}${valueTxt}`);
  }

  /** Full-width divider. */
  rule(char = '-'): this {
    return this.text(char.repeat(this.profile.columns));
  }

  /** CODE128 barcode (variable data, receipt/waybill codes). */
  barcodeCode128(data: string, heightDots = 60): this {
    if (!/^[\x20-\x7e]{1,40}$/.test(data)) {
      throw new Error(`CODE128 payload must be 1-40 printable ASCII chars: ${JSON.stringify(data)}`);
    }
    this.out.push(GS, 0x68, heightDots); // height
    this.out.push(GS, 0x77, 0x02); // module width 2
    this.out.push(GS, 0x6b, 0x49, ...encode(data), 0x00); // CODE128-B, NUL-terminated
    return this;
  }

  /** EAN-13 product barcode (label printing). */
  barcodeEan13(data: string, heightDots = 70): this {
    if (!/^\d{13}$/.test(data)) throw new Error(`EAN-13 payload must be 13 digits: ${data}`);
    this.out.push(GS, 0x68, heightDots);
    this.out.push(GS, 0x77, 0x02);
    this.out.push(GS, 0x6b, 0x43, ...encode(data)); // EAN13, fixed length
    return this;
  }

  /** QR code (model 2) with the error-correction level used by POS flows. */
  qr(data: string): this {
    const payload = encode(data);
    if (payload.length > 500) throw new Error('QR payload too long (>500 bytes)');
    const lenLsb = payload.length & 0xff;
    const lenMsb = (payload.length >> 8) & 0xff;
    this.out.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model 2
    this.out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x05); // ECC level M
    this.out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x06); // module 6
    this.out.push(GS, 0x28, 0x6b, lenLsb, lenMsb, 0x31, 0x50, 0x30, ...payload); // data
    this.out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // print
    return this;
  }

  /** Partial cut with the profile's feed-before-cut. */
  cut(): this {
    this.newline(this.profile.feedBeforeCut);
    this.out.push(GS, 0x56, 0x42, 0x00); // GS V B 0 — partial cut
    return this;
  }

  /** Cash-drawer kick on pin 2 (ESC p m t1 t2) — the ONLY drawer primitive;
   *  adapters/guards decide WHEN kicking is allowed (pos-hardware.md §6). */
  drawerKick(pin: 0 | 1 = 0, onMs = 60, offMs = 240): this {
    this.out.push(ESC, 0x70, pin, onMs, offMs);
    return this;
  }

  /** Final byte stream for the transport. */
  build(): Uint8Array {
    return Uint8Array.from(this.out);
  }
}

/** Render the Ghana cedi according to the profile (documented CP437 limit). */
export function cedi(profile: PrinterProfile): string {
  return profile.cedi;
}
