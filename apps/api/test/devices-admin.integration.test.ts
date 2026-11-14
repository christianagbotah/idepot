/**
 * Phase 6 device administration (migration 0021 + DevicesAdminController):
 *
 *  - pairing-code lifecycle: issue (audited) → pair (single-use, expiry,
 *    hardware profile adoption) → reuse/expiry/revocation refusals;
 *  - fleet list with license + pairing evidence (devices:read);
 *  - RBAC: manager/auditor read-only, cashier refused everything, only
 *    owner/admin manage;
 *  - revocation immediately blocks sync push (the sync device guard) and
 *    reactivation restores it — the legacy-credential rotation path;
 *  - license seat issue/revoke lifecycle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

describe('device administration (Phase 6)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let cashier: Record<string, string>;
  let auditor: Record<string, string>;

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = { Authorization: `Bearer ${fx.tenantA.users.owner!.token!}` };
    manager = { Authorization: `Bearer ${fx.tenantA.users.manager!.token!}` };
    cashier = { Authorization: `Bearer ${fx.tenantA.users.cashier!.token!}` };
    auditor = { Authorization: `Bearer ${fx.tenantA.users.auditor!.token!}` };
  });

  afterAll(async () => {
    await fx.close();
  });

  it('issues a pairing code (owner only) and pairs a device with the code exactly once', async () => {
    const denied = await request(app.getHttpServer()).post('/api/devices/pairing-codes').set(manager).send({});
    expect(denied.status).toBe(403);

    const issued = await request(app.getHttpServer()).post('/api/devices/pairing-codes').set(owner).send({
      hardwareConfig: { receiptPrinter: { deviceId: 'prn-1', profile: 'escpos-80mm' }, drawer: { deviceId: 'drw-1' } },
    });
    expect(issued.status, JSON.stringify(issued.body)).toBe(201);
    expect(issued.body.code).toMatch(/^[A-Z2-9]{8}$/);
    const code = issued.body.code as string;

    // pair from the device side (any user with sync:device — the cashier operating the terminal)
    const paired = await request(app.getHttpServer()).post('/api/devices/pair').set(cashier).send({
      pairingCode: code,
      deviceCode: 'POS-TERM-01',
      platform: 'windows',
      name: 'Front counter',
      appVersion: '6.0.0-alpha.1',
    });
    expect(paired.status, JSON.stringify(paired.body)).toBe(201);
    const deviceId = paired.body.deviceId as string;

    // single use: the same code must never pair a second device
    const reuse = await request(app.getHttpServer()).post('/api/devices/pair').set(cashier).send({
      pairingCode: code,
      deviceCode: 'POS-TERM-02',
      platform: 'windows',
    });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error).toMatch(/already used/);

    // the paired device adopted the hardware profile and pairing evidence
    const list = await request(app.getHttpServer()).get('/api/devices').set(owner);
    expect(list.status).toBe(200);
    const me = list.body.find((d: { device_code: string }) => d.device_code === 'POS-TERM-01');
    expect(me.hardware_config.receiptPrinter).toEqual({ deviceId: 'prn-1', profile: 'escpos-80mm' });
    expect(me.paired_at).toBeTruthy();
    expect(me.name).toBe('Front counter');

    // fleet list RBAC: manager + auditor read; cashier refused
    expect((await request(app.getHttpServer()).get('/api/devices').set(manager)).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/api/devices').set(auditor)).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/api/devices').set(cashier)).status).toBe(403);
    return deviceId;
  });

  it('expired and unknown pairing codes are refused with precise errors', async () => {
    const unknown = await request(app.getHttpServer()).post('/api/devices/pair').set(cashier).send({
      pairingCode: 'ZZZZZZZZ',
      deviceCode: 'POS-TERM-03',
      platform: 'windows',
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatch(/unknown pairing code/);

    const short = await request(app.getHttpServer()).post('/api/devices/pairing-codes').set(owner).send({ validMinutes: 5 });
    expect(short.status).toBe(201);
    const row = await fx.admin.query(
      `UPDATE device_pairing_code SET expires_at = now() - interval '1 minute' WHERE code = $1 RETURNING id`,
      [short.body.code],
    );
    expect(row.rowCount).toBe(1);
    const expired = await request(app.getHttpServer()).post('/api/devices/pair').set(cashier).send({
      pairingCode: short.body.code,
      deviceCode: 'POS-TERM-04',
      platform: 'windows',
    });
    expect(expired.status).toBe(400);
    expect(expired.body.error).toMatch(/expired/);
  });

  it('a sale event pushes through an ACTIVE paired device and is REFUSED once revoked, then works again after reactivation', async () => {
    // seed a sellable product (warehouse/unit/opening stock)
    const wh = (await request(app.getHttpServer()).post('/api/warehouses').set(manager).send({ code: 'DEV-WH', name: 'Devices WH' })).body.id;
    const unit = (await request(app.getHttpServer()).post('/api/units').set(manager).send({ code: 'DEV-PC', name: 'Devices pieces' })).body.id;
    const product = (
      await request(app.getHttpServer()).post('/api/products').set(manager).send({
        code: 'DEV-P', name: 'Device product', baseUnitId: unit, sellingPrice: '10.00', purchasePrice: '6.00',
      })
    ).body.id;
    await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(manager).send({
      warehouseId: wh, authority: 'physical_count', businessDate: new Date().toISOString().slice(0, 10),
      lines: [{ productId: product, quantityBase: '100', unitCost: '6.00' }],
    });

    const issued = await request(app.getHttpServer()).post('/api/devices/pairing-codes').set(owner).send({});
    const paired = await request(app.getHttpServer()).post('/api/devices/pair').set(cashier).send({
      pairingCode: issued.body.code, deviceCode: 'POS-TERM-SYNC', platform: 'windows',
    });
    const deviceId = paired.body.deviceId as string;

    const saleEvent = (n: string) => ({
      eventId: `00000000-0000-4000-8000-00000000000${n}`,
      idempotencyKey: `devadmin-${n}`,
      type: 'sale.create',
      payload: {
        warehouseId: wh,
        lines: [{ productId: product, quantityBase: '1', unitPrice: '10.00' }],
        tenders: [{ method: 'cash', amount: '10.00' }],
        clientDocId: `00000000-0000-4000-8000-00000000000${n}`,
      },
    });

    const ok = await request(app.getHttpServer()).post('/api/sync/push').set(cashier).send({ deviceId, events: [saleEvent('1')] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.outcomes[0].status).toBe('applied');

    // revoke → sync immediately refused (credential rotation path)
    const revoked = await request(app.getHttpServer()).post(`/api/devices/${deviceId}/revoke`).set(owner);
    expect(revoked.status).toBe(201);
    const blocked = await request(app.getHttpServer()).post('/api/sync/push').set(cashier).send({ deviceId, events: [saleEvent('2')] });
    expect(blocked.status).toBe(403);
    expect(JSON.stringify(blocked.body)).toMatch(/not an active device|re-pairing/);

    // re-pairing path: reactivate restores sync
    const back = await request(app.getHttpServer()).post(`/api/devices/${deviceId}/reactivate`).set(owner);
    expect(back.status).toBe(201);
    const resumed = await request(app.getHttpServer()).post('/api/sync/push').set(cashier).send({ deviceId, events: [saleEvent('3')] });
    expect(resumed.status, JSON.stringify(resumed.body)).toBe(201);
    expect(resumed.body.outcomes[0].status).toBe('applied');
  });

  it('license seat lifecycle: issue, list evidence, revoke', async () => {
    const issued = await request(app.getHttpServer()).post('/api/devices/pairing-codes').set(owner).send({});
    const paired = await request(app.getHttpServer()).post('/api/devices/pair').set(cashier).send({
      pairingCode: issued.body.code, deviceCode: 'POS-TERM-LIC', platform: 'macos',
    });
    const deviceId = paired.body.deviceId as string;

    const lic = await request(app.getHttpServer()).post(`/api/devices/${deviceId}/license`).set(owner).send({
      validUntil: '2027-12-31',
      note: 'annual seat',
    });
    expect(lic.status, JSON.stringify(lic.body)).toBe(201);
    expect(lic.body.status).toBe('active');

    const list = await request(app.getHttpServer()).get('/api/devices').set(manager);
    const row = list.body.find((d: { device_code: string }) => d.device_code === 'POS-TERM-LIC');
    expect(row.license_status).toBe('active');
    expect(String(row.license_valid_until).slice(0, 10)).toBe('2027-12-31');

    const revoked = await request(app.getHttpServer()).post(`/api/devices/${deviceId}/license/revoke`).set(owner);
    expect(revoked.status).toBe(201);
    const after = await request(app.getHttpServer()).get('/api/devices').set(owner);
    const rowAfter = after.body.find((d: { device_code: string }) => d.device_code === 'POS-TERM-LIC');
    expect(rowAfter.license_status).toBe('revoked');

    // re-issuing flips it back to active (upsert semantics)
    const reissued = await request(app.getHttpServer()).post(`/api/devices/${deviceId}/license`).set(owner).send({});
    expect(reissued.body.status).toBe('active');
  });

  it('cross-tenant isolation: tenant B never sees tenant A devices', async () => {
    const issued = await request(app.getHttpServer()).post('/api/devices/pairing-codes').set(owner).send({});
    await request(app.getHttpServer()).post('/api/devices/pair').set(cashier).send({
      pairingCode: issued.body.code, deviceCode: 'POS-TERM-ISO', platform: 'web',
    });
    const tenantBOwner = { Authorization: `Bearer ${fx.tenantB.users.owner!.token!}` };
    const foreign = await request(app.getHttpServer()).get('/api/devices').set(tenantBOwner);
    expect(foreign.status).toBe(200);
    expect(foreign.body.find((d: { device_code: string }) => d.device_code === 'POS-TERM-ISO')).toBeUndefined();
    // and tenant B cannot revoke tenant A's device (unknown → 400, never a cross-tenant write)
    const list = await request(app.getHttpServer()).get('/api/devices').set(owner);
    const target = list.body.find((d: { device_code: string }) => d.device_code === 'POS-TERM-ISO');
    const attack = await request(app.getHttpServer()).post(`/api/devices/${target.id}/revoke`).set(tenantBOwner);
    expect([400, 403]).toContain(attack.status);
  });
});
