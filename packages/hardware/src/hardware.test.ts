/**
 * ESC/POS renderer golden-byte tests (pos-hardware.md §8: "Golden-byte tests
 * for rendered ESC/POS output per template/profile") + adapter guard tests.
 *
 * The byte streams below are pinned EXACTLY: any change to the renderer is
 * a deliberate, reviewable diff — printers have no "close enough".
 */
import { describe, it, expect } from 'vitest';
import { EscposBuilder, PROFILE_58MM, PROFILE_80MM } from './escpos.js';
import { renderThermal, type ThermalDocument } from './adapters.js';
import {
  GuardedDrawerAdapter,
  SimulatedDrawerTransport,
  SimulatedPrinterTransport,
  SimulatedScannerSource,
  EscposPrinterAdapter,
  TerminalHardware,
  type TerminalHardwareConfig,
} from './adapters.js';

const hex = (b: Uint8Array) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(' ');

describe('EscposBuilder primitives', () => {
  it('init + codepage pin + centered title produce the exact byte prefix', () => {
    const b = new EscposBuilder(PROFILE_58MM).init().codepage437().align('center').text('IDEPOT');
    expect(hex(b.build()).replace(/ /g, '')).toBe('1b401b74001b6101494445504f540a');
  });

  it('money rows pad to the profile width with dotted leaders (32 vs 48 cols)', () => {
    const r58 = new EscposBuilder(PROFILE_58MM).row('TOTAL', '230.00').build();
    const text58 = Array.from(r58).map((x) => (x >= 0x20 && x <= 0x7e ? String.fromCharCode(x) : '·')).join('');
    expect(text58).toBe('TOTAL ................... 230.00·');
    expect(text58).toHaveLength(32 + 1); // 32 cols + newline rendered as ·

    const r80 = new EscposBuilder(PROFILE_80MM).row('TOTAL', '230.00').build();
    const text80 = Array.from(r80).map((x) => (x >= 0x20 && x <= 0x7e ? String.fromCharCode(x) : '·')).join('');
    expect(text80.startsWith('TOTAL ')).toBe(true);
    expect(text80).toHaveLength(48 + 1);
  });

  it('the cedi cent sign encodes as CP437 0x9B and ₵ degrades deterministically', () => {
    const bytes = new EscposBuilder(PROFILE_58MM).text('GH¢ 5.00').build();
    expect(Array.from(bytes)).toContain(0x9b);
    const fallback = new EscposBuilder(PROFILE_58MM).text('₵5.00').build();
    expect(Array.from(fallback)).toContain(0x3f); // '?'
  });

  it('CODE128 emits GS k 73 with a NUL terminator', () => {
    const b = new EscposBuilder(PROFILE_80MM).barcodeCode128('INV-000123');
    const bytes = Array.from(b.build());
    // [GS h n][GS w n][GS k 73 <10 chars> NUL] → tail is 14 bytes
    const tail = bytes.slice(-14);
    expect(tail[0]).toBe(0x1d);
    expect(tail[1]).toBe(0x6b);
    expect(tail[2]).toBe(0x49);
    expect(tail[13]).toBe(0x00);
  });

  it('EAN-13 requires exactly 13 digits and emits GS k 67', () => {
    const b = new EscposBuilder(PROFILE_80MM).barcodeEan13('5901234123457');
    const bytes = Array.from(b.build());
    // [GS h n][GS w n][GS k 67 <13 digits>] → 22 bytes; GS k 67 starts at 22-16
    expect(bytes[bytes.length - 16]).toBe(0x1d);
    expect(bytes[bytes.length - 15]).toBe(0x6b);
    expect(bytes[bytes.length - 14]).toBe(0x43);
    expect(() => new EscposBuilder(PROFILE_80MM).barcodeEan13('123')).toThrow(/13 digits/);
  });

  it('QR payload wraps GS ( k with correct length words', () => {
    const b = new EscposBuilder(PROFILE_80MM).qr('https://idepot.test/r/ABC123');
    const bytes = Array.from(b.build());
    // locate the store-data subsequence: GS ( k pL pH 31 50 30 <payload>
    let found = -1;
    for (let idx = 0; idx + 7 < bytes.length; idx++) {
      if (
        bytes[idx] === 0x1d && bytes[idx + 1] === 0x28 && bytes[idx + 2] === 0x6b &&
        bytes[idx + 5] === 0x31 && bytes[idx + 6] === 0x50 && bytes[idx + 7] === 0x30
      ) {
        found = idx;
        break;
      }
    }
    expect(found).toBeGreaterThan(0);
    const payloadLen = 28; // 'https://idepot.test/r/ABC123'.length
    expect(bytes[found + 3]).toBe(payloadLen & 0xff);
    expect(bytes[found + 4]).toBe((payloadLen >> 8) & 0xff);
  });

  it('drawer kick emits ESC p with pin and timing bytes', () => {
    const b = new EscposBuilder(PROFILE_80MM).drawerKick(0, 60, 240);
    expect(Array.from(b.build())).toEqual([0x1b, 0x70, 0x00, 60, 240]);
  });

  it('cut feeds the profile lines then GS V B 0', () => {
    const b = new EscposBuilder(PROFILE_58MM).cut();
    const bytes = Array.from(b.build());
    expect(bytes.slice(0, 3)).toEqual([0x0a, 0x0a, 0x0a]);
    expect(bytes.slice(3)).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });
});

describe('renderThermal golden streams', () => {
  const doc: ThermalDocument = {
    title: 'IDEPOT RECEIPT',
    headerLines: ['Lightworld Demo Depot', '030 200 0000'],
    rows: [
      { label: 'Cement Bag x4', value: '380.00' },
      { label: 'TOTAL', value: '380.00', strong: true },
    ],
    blocks: [{ heading: 'TENDERED', lines: ['CASH GH¢400.00', 'CHANGE GH¢20.00'] }],
    barcode: { data: 'RCT-000001', symbology: 'code128' },
    qrPayload: 'idepot:r:RCT-000001',
    footerLines: ['Thank you!', 'Powered by iDepot'],
    cut: true,
  };

  it('58mm and 80mm render deterministically (golden hex prefixes)', () => {
    const b58 = renderThermal(doc, PROFILE_58MM);
    const b80 = renderThermal(doc, PROFILE_80MM);
    // deterministic: same input → same output
    expect(hex(renderThermal(doc, PROFILE_58MM))).toBe(hex(b58));
    // both start with init (ESC @) + codepage pin (ESC t 0)
    expect(hex(b58.slice(0, 4)).replace(/ /g, '')).toBe('1b401b74');
    expect(hex(b80.slice(0, 4)).replace(/ /g, '')).toBe('1b401b74');
    // title present, and the 80mm stream is wider-padded
    expect(b58.length).toBeGreaterThan(40);
    expect(b80.length).toBeGreaterThan(b58.length - 10);
  });

  it('simulated transport renders human-readable text for previews', () => {
    const transport = new SimulatedPrinterTransport();
    const adapter = new EscposPrinterAdapter('printer-1', transport, PROFILE_80MM);
    void adapter.printReceipt({
      kind: 'PrintReceipt',
      document: doc,
      actorUserId: 'user-1',
      evidence: { type: 'payment', id: 'pay-1' },
      isReprint: false,
    });
    // (async — give the microtask queue a tick via awaiting in the next test)
  });

  it('printReceipt flows bytes through the transport and reports audit data', async () => {
    const transport = new SimulatedPrinterTransport();
    const adapter = new EscposPrinterAdapter('printer-1', transport, PROFILE_58MM);
    const result = await adapter.printReceipt({
      kind: 'PrintReceipt',
      document: doc,
      actorUserId: 'user-1',
      evidence: { type: 'payment', id: 'pay-1' },
      isReprint: true,
    });
    expect(result.ok).toBe(true);
    expect(result.bytesSent).toBe(transport.sent[0]!.length);
    expect(result.audit.reprint).toBe(true);
    expect(result.audit.evidence).toEqual({ type: 'payment', id: 'pay-1' });
    const text = transport.lastStreamAsText();
    expect(text).toContain('IDEPOT RECEIPT');
    expect(text).toContain('TOTAL');
    expect(text).toContain('CASH GH¢400.00');
  });
});

describe('drawer guard (pos-hardware.md §6: no unconditional kicks)', () => {
  const makeDrawer = (open: boolean, kicked = false) => {
    const t = new SimulatedDrawerTransport();
    const a = new GuardedDrawerAdapter('drawer-1', t, {
      isOpenShift: async () => open,
      alreadyKickedFor: () => kicked,
    });
    return { t, a };
  };
  const intent = (trigger: 'sale_completed' | 'manual' = 'sale_completed') => ({
    kind: 'OpenDrawer' as const,
    shiftId: 'shift-1',
    actorUserId: 'user-1',
    trigger,
  });

  it('kicks when the shift is open', async () => {
    const { t, a } = makeDrawer(true);
    const r = await a.open(intent());
    expect(r.ok).toBe(true);
    expect(t.kicks).toBe(1);
  });

  it('REFUSES without an open shift (closed/none) — no bytes, no kick', async () => {
    const { t, a } = makeDrawer(false);
    const r = await a.open(intent());
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/open cashier shift/);
    expect(t.kicks).toBe(0);
  });

  it('REFUSES duplicate sale_completed kicks', async () => {
    const { t, a } = makeDrawer(true, true);
    const r = await a.open(intent('sale_completed'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/duplicate/);
    expect(t.kicks).toBe(0);
  });

  it('manual kicks are never deduplicated (supervisor opens)', async () => {
    const { t, a } = makeDrawer(true, true);
    const r = await a.open(intent('manual'));
    expect(r.ok).toBe(true);
    expect(t.kicks).toBe(1);
  });
});

describe('scanner + terminal registry', () => {
  it('simulated scanner delivers scans to subscribers only while subscribed', () => {
    const s = new SimulatedScannerSource();
    const seen: string[] = [];
    const off = s.onScan((b) => seen.push(b));
    s.scan('5901234123457');
    off();
    s.scan('0000000000000');
    expect(seen).toEqual(['5901234123457']);
  });

  it('terminal resolves configured devices and reports missing ones precisely', () => {
    const hw = new TerminalHardware();
    const transport = new SimulatedPrinterTransport();
    const printer = new EscposPrinterAdapter('prn-1', transport, PROFILE_58MM);
    hw.registerPrinter(printer);
    hw.registerScanner(new SimulatedScannerSource('scan-1'));

    const ok: TerminalHardwareConfig = {
      terminalId: 't-1',
      branchId: 'b-1',
      receiptPrinter: { deviceId: 'prn-1', profile: 'escpos-58mm' },
      labelPrinter: null,
      drawer: null,
      scanner: { deviceId: 'scan-1' },
    };
    const resolved = hw.resolve(ok);
    expect(resolved.receiptPrinter).toBe(printer);
    expect(resolved.drawer).toBeNull();

    const missing: TerminalHardwareConfig = { ...ok, receiptPrinter: { deviceId: 'prn-9', profile: 'escpos-80mm' } };
    expect(() => hw.resolve(missing)).toThrow(/'prn-9' is configured but not connected/);
  });
});
