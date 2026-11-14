/**
 * Hardware abstraction layer — adapters, transports and the terminal
 * registry (docs/architecture/pos-hardware.md §1/§3/§6).
 *
 * The business layer emits INTENTS (PrintReceipt / OpenDrawer / PrintLabel /
 * Scan handled as events) and never device commands. Adapters translate
 * intents to bytes on a transport. Every adapter class has a first-class
 * SIMULATED implementation so apps are fully functional and testable
 * without physical devices (B4: "allow simulation without physical device").
 *
 * Safety (pos-hardware.md §6):
 *  - drawer kicks require an OPEN SHIFT reference; the guard refuses to kick
 *    on failed/duplicate sales (B4: "no unconditional cash drawer kicks");
 *  - every (re)print is auditable by the caller (the adapter reports intent
 *    metadata — the API records the audit event).
 */

import {
  EscposBuilder,
  PROFILE_58MM,
  PROFILE_80MM,
  type PrinterProfile,
} from './escpos.js';

/* --------------------------------- intents -------------------------------- */

export interface PrintReceiptIntent {
  kind: 'PrintReceipt';
  /** device-independent print job (packages/print-templates) */
  document: ThermalDocument;
  /** audit: who triggered the print and on what evidence */
  actorUserId: string;
  evidence: { type: 'payment' | 'invoice' | 'credit_note' | 'shift_report'; id: string };
  /** reprint flag — callers must hold the matching reprint permission */
  isReprint: boolean;
}

export interface OpenDrawerIntent {
  kind: 'OpenDrawer';
  /** kicking requires an open cashier shift (the invoking user recorded) */
  shiftId: string;
  actorUserId: string;
  /** only completed, exactly-once sales may auto-open the drawer */
  trigger: 'sale_completed' | 'manual';
}

export interface PrintLabelIntent {
  kind: 'PrintLabel';
  labels: Array<{
    productName: string;
    barcode: string;
    barcodeSymbology: 'ean13' | 'code128';
    price: string;
    extraLine?: string;
  }>;
  actorUserId: string;
}

export type HardwareIntent = PrintReceiptIntent | OpenDrawerIntent | PrintLabelIntent;

/* ------------------------- device-independent model ------------------------ */
/** A thermal print job in device-independent form: the SAME model is
 *  rendered to ESC/POS bytes here, to browser preview HTML in the web app
 *  and to A4 PDF layouts — data always from API evidence. */
export interface ThermalDocument {
  title: string;
  headerLines: string[];
  rows: Array<{ label: string; value: string; strong?: boolean }>;
  blocks: Array<{ heading?: string; lines: string[]; center?: boolean }>;
  barcode?: { data: string; symbology: 'code128' };
  qrPayload?: string;
  footerLines: string[];
  cut: boolean;
}

/* -------------------------------- transports ------------------------------- */

export interface PrinterTransport {
  id: string;
  /** send raw ESC/POS bytes; resolves when buffered to the device */
  send(bytes: Uint8Array): Promise<void>;
}

export interface DrawerTransport {
  id: string;
  /** low-level kick — adapters own the GUARD logic, never call directly */
  rawKick(): Promise<void>;
}

export interface ScannerSource {
  id: string;
  /** keyboard-wedge style scan events (most USB scanners) */
  onScan(handler: (barcode: string, symbology?: string) => void): () => void;
}

/* --------------------------------- adapters -------------------------------- */

export interface PrinterAdapter {
  readonly deviceId: string;
  readonly profile: PrinterProfile;
  printReceipt(intent: PrintReceiptIntent): Promise<PrintResult>;
}

export interface DrawerAdapter {
  readonly deviceId: string;
  open(intent: OpenDrawerIntent): Promise<PrintResult>;
}

export interface LabelPrinterAdapter {
  readonly deviceId: string;
  printLabels(intent: PrintLabelIntent): Promise<PrintResult>;
}

export interface PrintResult {
  ok: boolean;
  deviceId: string;
  bytesSent: number;
  /** audit hook data — the caller records it in the audit trail */
  audit: { intent: string; at: string; evidence?: PrintReceiptIntent['evidence']; reprint: boolean };
  error?: string;
}

/* ---------------------- ESC/POS renderer (shared core) --------------------- */

/** Render a ThermalDocument to an ESC/POS stream (58/80mm). Pure + testable;
 *  used by every printer adapter regardless of transport. */
export function renderThermal(doc: ThermalDocument, profile: PrinterProfile): Uint8Array {
  const b = new EscposBuilder(profile);
  b.init().codepage437();
  b.align('center').size('double-width').text(doc.title).size('normal');
  for (const h of doc.headerLines) b.text(h);
  b.align('left').rule();
  for (const r of doc.rows) {
    if (r.strong) b.bold(true);
    b.row(r.label, r.value);
    if (r.strong) b.bold(false);
  }
  for (const block of doc.blocks) {
    b.rule();
    if (block.heading) b.bold(true).text(block.heading).bold(false);
    b.align(block.center ? 'center' : 'left');
    for (const line of block.lines) b.text(line);
    b.align('left');
  }
  b.rule();
  if (doc.barcode) b.barcodeCode128(doc.barcode.data);
  if (doc.qrPayload) b.newline().qr(doc.qrPayload).newline();
  b.align('center');
  for (const f of doc.footerLines) b.text(f);
  b.align('left');
  if (doc.cut) b.cut();
  return b.build();
}

/* ------------------------------ adapters (real) ---------------------------- */

/** Transport-backed thermal printer (USB/serial/network/Bluetooth — the
 *  transport is injected; the adapter is transport-agnostic). */
export class EscposPrinterAdapter implements PrinterAdapter, LabelPrinterAdapter {
  readonly profile: PrinterProfile;
  constructor(
    readonly deviceId: string,
    private readonly transport: PrinterTransport,
    profile: PrinterProfile = PROFILE_80MM,
  ) {
    this.profile = profile;
  }

  async printReceipt(intent: PrintReceiptIntent): Promise<PrintResult> {
    const bytes = renderThermal(intent.document, this.profile);
    await this.transport.send(bytes);
    return {
      ok: true,
      deviceId: this.deviceId,
      bytesSent: bytes.length,
      audit: {
        intent: 'PrintReceipt',
        at: new Date().toISOString(),
        evidence: intent.evidence,
        reprint: intent.isReprint,
      },
    };
  }

  async printLabels(intent: PrintLabelIntent): Promise<PrintResult> {
    const b = new EscposBuilder(this.profile);
    b.init().codepage437();
    for (const label of intent.labels) {
      b.align('center').size('double-width').text(label.productName.slice(0, this.profile.columns)).size('normal');
      if (label.extraLine) b.text(label.extraLine);
      b.size('double-height').row('PRICE', label.price).size('normal');
      b.newline();
      if (label.barcodeSymbology === 'ean13') b.barcodeEan13(label.barcode);
      else b.barcodeCode128(label.barcode);
      b.newline(2);
    }
    b.cut();
    const bytes = b.build();
    await this.transport.send(bytes);
    return {
      ok: true,
      deviceId: this.deviceId,
      bytesSent: bytes.length,
      audit: { intent: 'PrintLabel', at: new Date().toISOString(), reprint: false },
    };
  }
}

/** Drawer adapter with the open-shift guard. The GUARD decision is injected
 *  (`isOpenShift`) so the web/desktop app asks the API while tests simulate. */
export class GuardedDrawerAdapter implements DrawerAdapter {
  constructor(
    readonly deviceId: string,
    private readonly transport: DrawerTransport,
    private readonly guards: {
      isOpenShift: (shiftId: string) => Promise<boolean>;
      /** dedupe: sale_completed triggers may kick exactly once per evidence */
      alreadyKickedFor?: (trigger: OpenDrawerIntent['trigger'], shiftId: string, evidenceId?: string) => boolean;
      onKick?: (intent: OpenDrawerIntent) => void;
    },
  ) {}

  async open(intent: OpenDrawerIntent): Promise<PrintResult> {
    const open = await this.guards.isOpenShift(intent.shiftId);
    if (!open) {
      return {
        ok: false,
        deviceId: this.deviceId,
        bytesSent: 0,
        audit: { intent: 'OpenDrawer', at: new Date().toISOString(), reprint: false },
        error: 'refused: cash drawer may only open within an open cashier shift',
      };
    }
    if (
      intent.trigger === 'sale_completed' &&
      this.guards.alreadyKickedFor?.('sale_completed', intent.shiftId, undefined)
    ) {
      return {
        ok: false,
        deviceId: this.deviceId,
        bytesSent: 0,
        audit: { intent: 'OpenDrawer', at: new Date().toISOString(), reprint: false },
        error: 'refused: drawer already kicked for this sale (no duplicate kicks)',
      };
    }
    await this.transport.rawKick();
    this.guards.onKick?.(intent);
    return {
      ok: true,
      deviceId: this.deviceId,
      bytesSent: 5, // ESC p m t1 t2
      audit: { intent: 'OpenDrawer', at: new Date().toISOString(), reprint: false },
    };
  }
}

/* ------------------------------- simulated --------------------------------- */

/** In-memory transport: records every byte stream for assertions/preview. */
export class SimulatedPrinterTransport implements PrinterTransport {
  readonly id: string;
  readonly sent: Uint8Array[] = [];
  constructor(id = 'sim-printer') {
    this.id = id;
  }
  async send(bytes: Uint8Array): Promise<void> {
    this.sent.push(bytes);
  }
  /** last stream rendered as CP437-ish text for snapshot tests/debugging. */
  lastStreamAsText(): string {
    const bytes = this.sent[this.sent.length - 1];
    if (!bytes) return '';
    let out = '';
    for (const b of bytes) {
      if (b === 0x0a) out += '\n';
      else if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b);
      else if (b === 0x9b) out += '¢';
      // control bytes (ESC/GS sequences) are intentionally invisible here
    }
    return out;
  }
}

export class SimulatedDrawerTransport implements DrawerTransport {
  readonly id: string;
  kicks = 0;
  constructor(id = 'sim-drawer') {
    this.id = id;
  }
  async rawKick(): Promise<void> {
    this.kicks++;
  }
}

/** Keyboard-wedge scanner simulation: emits scans programmatically. */
export class SimulatedScannerSource implements ScannerSource {
  readonly id: string;
  private handler: ((barcode: string, symbology?: string) => void) | null = null;
  constructor(id = 'sim-scanner') {
    this.id = id;
  }
  onScan(handler: (barcode: string, symbology?: string) => void): () => void {
    this.handler = handler;
    return () => {
      this.handler = null;
    };
  }
  /** test/simulation hook */
  scan(barcode: string, symbology = 'EAN13'): void {
    this.handler?.(barcode, symbology);
  }
}

/* ----------------------------- terminal registry ---------------------------- */

/** Per-terminal hardware configuration (pos-hardware.md §3): which devices
 *  this terminal uses, synced with the backend device registry. */
export interface TerminalHardwareConfig {
  terminalId: string;
  branchId: string | null;
  receiptPrinter: { deviceId: string; profile: 'escpos-58mm' | 'escpos-80mm' } | null;
  labelPrinter: { deviceId: string } | null;
  drawer: { deviceId: string } | null;
  scanner: { deviceId: string } | null;
}

export function profileById(id: string): PrinterProfile {
  if (id === PROFILE_58MM.id) return PROFILE_58MM;
  if (id === PROFILE_80MM.id) return PROFILE_80MM;
  throw new Error(`unknown printer profile: ${id}`);
}

/** A terminal's connected adapter set, resolvable from live hardware or
 *  simulation. Apps register adapters per deviceId at startup. */
export class TerminalHardware {
  private readonly printers = new Map<string, PrinterAdapter>();
  private readonly drawers = new Map<string, DrawerAdapter>();
  private readonly labelPrinters = new Map<string, LabelPrinterAdapter>();
  private readonly scanners = new Map<string, ScannerSource>();

  registerPrinter(a: PrinterAdapter): void {
    this.printers.set(a.deviceId, a);
  }
  registerDrawer(a: DrawerAdapter): void {
    this.drawers.set(a.deviceId, a);
  }
  registerLabelPrinter(a: LabelPrinterAdapter): void {
    this.labelPrinters.set(a.deviceId, a);
  }
  registerScanner(s: ScannerSource): void {
    this.scanners.set(s.id, s);
  }

  /** Resolve the configured devices for a terminal; throws with a precise
   *  message when a configured device is not registered (hot-plug UX). */
  resolve(config: TerminalHardwareConfig): {
    receiptPrinter: PrinterAdapter | null;
    drawer: DrawerAdapter | null;
    labelPrinter: LabelPrinterAdapter | null;
    scanner: ScannerSource | null;
  } {
    const need = <T>(map: Map<string, T>, deviceId: string | null, what: string): T | null => {
      if (!deviceId) return null;
      const found = map.get(deviceId);
      if (!found) throw new Error(`${what} '${deviceId}' is configured but not connected`);
      return found;
    };
    return {
      receiptPrinter: need(this.printers, config.receiptPrinter?.deviceId ?? null, 'receipt printer'),
      drawer: need(this.drawers, config.drawer?.deviceId ?? null, 'cash drawer'),
      labelPrinter: need(this.labelPrinters, config.labelPrinter?.deviceId ?? null, 'label printer'),
      scanner: need(this.scanners, config.scanner?.deviceId ?? null, 'barcode scanner'),
    };
  }
}
