/**
 * Phase 6 parity gaps — direct API coverage:
 *
 *  1. Global search (`GET /api/search?q=`) — the legacy `search_result.php`
 *     was per-page only; this is the cross-entity replacement. Asserts:
 *     - entity groups (product/customer/supplier/price_list by code+name+phone)
 *     - document-code groups (invoice, quotation, sales_order, waybill,
 *       purchase_order) with deep-link href + status evidence
 *     - RBAC: entity groups filtered by the caller's permissions
 *       (cashier has sales:read but NOT purchasing:read)
 *     - tenant isolation via the standard RLS session (tenant B sees nothing)
 *     - validation (1-char term → 400) and auth (no token → 401)
 *     - LIKE-wildcard escaping: a term of "%%" matches nothing instead of
 *       everything
 *
 *  2. Price-list management reads (`GET /api/price-lists/:id/items`) — the
 *     endpoint behind the new web management UX: catalog labels, newest
 *     effective window first, RBAC (auditor read-only), overlap 409, 404.
 *
 *  3. Resolve precedence sanity for the preview card (standard list wins over
 *     the product default when no customer list applies).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

const TODAY = new Date().toISOString().slice(0, 10);

describe('global search + price-list management (Phase 6 parity)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let cashier: Record<string, string>;
  let auditor: Record<string, string>;
  let tenantB: Record<string, string>;

  let wh: string;
  let unit: string;
  let product: string;
  let product2: string;
  let customer: string;
  let supplier: string;
  let priceListId: string;

  let quotationCode: string;
  let orderCode: string;
  let waybillCode: string;
  let invoiceCode: string;
  let posInvoiceCode: string;
  let poCode: string;

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = { Authorization: `Bearer ${fx.tenantA.users.owner!.token!}` };
    manager = { Authorization: `Bearer ${fx.tenantA.users.manager!.token!}` };
    cashier = { Authorization: `Bearer ${fx.tenantA.users.cashier!.token!}` };
    auditor = { Authorization: `Bearer ${fx.tenantA.users.auditor!.token!}` };
    tenantB = { Authorization: `Bearer ${fx.tenantB.users.owner!.token!}` };

    const api = () => request(app.getHttpServer());

    wh = (await api().post('/api/warehouses').set(manager).send({ code: 'SRCH-WH', name: 'Search WH' })).body.id;
    unit = (await api().post('/api/units').set(manager).send({ code: 'SRCH-PC', name: 'Search Pieces' })).body.id;
    product = (
      await api().post('/api/products').set(manager).send({
        code: 'SRCH-P', name: 'Search Parity Widget', baseUnitId: unit,
        sellingPrice: '50.00', purchasePrice: '30.00',
      })
    ).body.id;
    product2 = (
      await api().post('/api/products').set(manager).send({
        code: 'SRCH-P2', name: 'Search Parity Gadget', baseUnitId: unit,
        sellingPrice: '70.00', purchasePrice: '40.00',
      })
    ).body.id;
    customer = (
      await api().post('/api/customers').set(manager).send({ name: 'Search Parity Customer', phone: '0244000111' })
    ).body.id;
    supplier = (
      await api().post('/api/suppliers').set(manager).send({ name: 'Search Parity Supplier', phone: '0244000222' })
    ).body.id;

    // price list + two items (different products coexist under the exclusion
    // constraint; the newest effective window must list first)
    priceListId = (
      await api().post('/api/price-lists').set(manager).send({
        code: 'SRCH-STD', name: 'Search Standard List', kind: 'standard',
      })
    ).body.id;
    expect(
      (
        await api().post(`/api/price-lists/${priceListId}/items`).set(manager).send({
          productId: product, unitId: unit, price: '45.00', effectiveFrom: '2020-01-01',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await api().post(`/api/price-lists/${priceListId}/items`).set(manager).send({
          productId: product2, unitId: unit, price: '65.00', effectiveFrom: TODAY,
        })
      ).status,
    ).toBe(201);

    // quotation
    const quotation = await api().post('/api/quotations').set(manager).send({
      warehouseId: wh,
      customerId: customer,
      validUntil: '2099-12-31',
      lines: [{ productId: product, quantityBase: '1', unitPrice: '45.00' }],
    });
    expect(quotation.status, JSON.stringify(quotation.body)).toBe(201);
    quotationCode = quotation.body.code as string;

    // opening stock FIRST — order confirmation posts the sale immediately
    expect(
      (
        await api().post('/api/inventory/opening-stock').set(manager).send({
          warehouseId: wh,
          authority: 'physical_count',
          businessDate: TODAY,
          lines: [
            { productId: product, quantityBase: '100', unitCost: '30.00' },
            { productId: product2, quantityBase: '100', unitCost: '40.00' },
          ],
        })
      ).status,
    ).toBe(201);

    // sales order → confirm (posts the invoice) → fulfillment (waybill)
    const order = await api().post('/api/sales-orders').set(manager).send({
      warehouseId: wh,
      customerId: customer,
      lines: [{ productId: product, quantityBase: '2', unitPrice: '45.00' }],
    });
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    orderCode = order.body.code as string;
    const confirmed = await api().post(`/api/sales-orders/${order.body.id}/confirm`).set(manager).send({});
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(201);
    invoiceCode = confirmed.body.invoice.code as string;
    const waybill = await api().post('/api/fulfillments').set(manager).send({
      salesOrderId: order.body.id,
      lines: [{ orderLineId: order.body.lines[0].id, quantityBase: '2' }],
    });
    expect(waybill.status, JSON.stringify(waybill.body)).toBe(201);
    waybillCode = waybill.body.code as string;

    // a second, PAID invoice straight from the POS path (F4 price authority:
    // the client must send the server-resolved standard-list price 45.00)
    const sale = await api().post('/api/sales/commit').set(manager).send({
      warehouseId: wh,
      customerId: customer,
      lines: [{ productId: product, quantityBase: '4', unitPrice: '45.00' }],
      tenders: [{ method: 'cash', amount: '180.00' }],
    });
    expect(sale.status, JSON.stringify(sale.body)).toBe(201);
    posInvoiceCode = sale.body.invoice.code as string;

    // purchase order
    const po = await api().post('/api/purchasing/purchase-orders').set(manager).send({
      supplierId: supplier,
      warehouseId: wh,
      expectedDate: TODAY,
      lines: [{ productId: product, orderedQuantity: '10', unitPrice: '30.00' }],
      submit: true,
    });
    expect(po.status, JSON.stringify(po.body)).toBe(201);
    poCode = po.body.code as string;
  });

  afterAll(async () => {
    await fx?.close();
  });

  async function search(term: string, token: Record<string, string> = owner) {
    const res = await request(app.getHttpServer())
      .get(`/api/search?q=${encodeURIComponent(term)}`)
      .set(token);
    return res;
  }

  function groupOf(body: { groups: Array<{ entity: string; items: Array<Record<string, unknown>> }> }, entity: string) {
    return body.groups.find((g) => g.entity === entity);
  }

  /* ------------------------------ validation ------------------------------ */

  it('requires authentication (401) and a 2+ character term (400)', async () => {
    expect((await request(app.getHttpServer()).get('/api/search?q=ab')).status).toBe(401);
    expect((await search('x')).status).toBe(400);
    expect((await request(app.getHttpServer()).get('/api/search').set(owner)).status).toBe(400);
  });

  it('rejects a 101-character term (400)', async () => {
    expect((await search('a'.repeat(101))).status).toBe(400);
  });

  /* --------------------------- master-data groups -------------------------- */

  it('finds products by code and by name with selling-price evidence', async () => {
    const byCode = await search('SRCH-P');
    expect(byCode.status).toBe(200);
    const g = groupOf(byCode.body, 'product');
    expect(g).toBeTruthy();
    const hit = g!.items.find((i) => i.code === 'SRCH-P');
    expect(hit).toBeTruthy();
    expect(hit!.title).toBe('Search Parity Widget');
    expect(hit!.subtitle).toBe('selling 50.0000');
    expect(hit!.href).toBe('/catalog');
    expect(hit!.status).toBe('active');
  });

  it('one term can match several entities ("Search Parity" → product + customer + supplier)', async () => {
    const res = await search('Search Parity');
    expect(res.status).toBe(200);
    expect(groupOf(res.body, 'product')).toBeTruthy();
    expect(groupOf(res.body, 'customer')).toBeTruthy();
    expect(groupOf(res.body, 'supplier')).toBeTruthy();
  });

  it('finds a customer by phone', async () => {
    const res = await search('0244000111');
    const g = groupOf(res.body, 'customer');
    expect(g).toBeTruthy();
    expect(g!.items.some((i) => i.title === 'Search Parity Customer')).toBe(true);
  });

  it('finds a price list by code with kind evidence', async () => {
    const res = await search('SRCH-STD');
    const g = groupOf(res.body, 'price_list');
    expect(g).toBeTruthy();
    expect(g!.items[0]!.title).toBe('Search Standard List');
    expect(g!.items[0]!.subtitle).toBe('standard');
    expect(g!.items[0]!.href).toBe('/price-lists');
  });

  /* ---------------------------- document groups ---------------------------- */

  it('finds invoice / quotation / order / waybill codes in their own groups with deep links', async () => {
    const invoice = await search(invoiceCode);
    expect(groupOf(invoice.body, 'invoice')?.items[0]!.href).toBe('/sales');

    const posInvoice = await search(posInvoiceCode);
    expect(groupOf(posInvoice.body, 'invoice')?.items[0]!.code).toBe(posInvoiceCode);

    const quotation = await search(quotationCode);
    expect(groupOf(quotation.body, 'quotation')?.items[0]!.href).toBe('/quotations');

    const order = await search(orderCode);
    expect(groupOf(order.body, 'sales_order')?.items[0]!.href).toBe('/sales-orders');

    const waybill = await search(waybillCode);
    const w = groupOf(waybill.body, 'waybill');
    expect(w).toBeTruthy();
    expect(w!.items[0]!.href).toBe('/sales-orders');
    expect(String(w!.items[0]!.subtitle)).toContain(orderCode);
  });

  it('finds a purchase order for a principal with purchasing:read', async () => {
    const res = await search(poCode, owner);
    const g = groupOf(res.body, 'purchase_order');
    expect(g).toBeTruthy();
    expect(g!.items[0]!.title).toBe(poCode);
    expect(g!.items[0]!.subtitle).toBe('Search Parity Supplier');
    expect(g!.items[0]!.href).toBe('/purchasing/orders');
  });

  /* -------------------------- security boundaries -------------------------- */

  it('filters groups by the caller permissions: cashier sees invoices but never purchase orders', async () => {
    // cashier holds sales:read — the invoice group is visible
    const invoice = await search(invoiceCode, cashier);
    expect(invoice.status).toBe(200);
    expect(groupOf(invoice.body, 'invoice')).toBeTruthy();
    expect(groupOf(invoice.body, 'purchase_order')).toBeUndefined();

    // the same PO code the owner finds yields nothing for the cashier
    const po = await search(poCode, cashier);
    expect(po.status).toBe(200);
    expect(groupOf(po.body, 'purchase_order')).toBeUndefined();
    expect(po.body.total).toBe(0);
  });

  it('never crosses tenants (RLS session, not a query parameter)', async () => {
    for (const term of ['SRCH-P', 'Search Parity', invoiceCode, quotationCode, poCode]) {
      const res = await search(term, tenantB);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.groups).toEqual([]);
    }
  });

  it('escapes LIKE wildcards: "%%" matches nothing instead of everything', async () => {
    const res = await search('%%');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  /* ----------------------- price-list management reads ---------------------- */

  it('lists items with catalog labels, newest effective window first', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/price-lists/${priceListId}/items`)
      .set(manager);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    const items = res.body.items as Array<Record<string, string | null>>;
    expect(items[0]!.productCode).toBe('SRCH-P2'); // TODAY > 2020-01-01
    expect(items[0]!.productName).toBe('Search Parity Gadget');
    expect(items[0]!.unitCode).toBe('SRCH-PC');
    expect(items[0]!.price).toBe('65.0000');
    expect(items[0]!.effectiveFrom).toBe(TODAY);
    expect(items[1]!.productCode).toBe('SRCH-P');
    expect(items[1]!.effectiveFrom).toBe('2020-01-01');
    expect(items[1]!.effectiveTo).toBeNull();
  });

  it('price-list item reads are RBAC-gated (auditor read OK) and unknown lists 404', async () => {
    expect(
      (await request(app.getHttpServer()).get(`/api/price-lists/${priceListId}/items`).set(auditor)).status,
    ).toBe(200);
    expect(
      (
        await request(app.getHttpServer()).get('/api/price-lists/00000000-0000-0000-0000-000000000000/items').set(manager)
      ).status,
    ).toBe(404);
  });

  it('overlap for the same product/unit is refused by the DB exclusion constraint (409)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/price-lists/${priceListId}/items`)
      .set(manager)
      .send({ productId: product, unitId: unit, price: '40.00', effectiveFrom: '2021-06-01' });
    expect(res.status).toBe(409);
    expect(String(res.body.error)).toMatch(/overlap/i);
  });

  it('resolve preview precedence: standard list beats the product default', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pricing/resolve?productId=${product}&unitId=${unit}`)
      .set(manager);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('standard_list');
    expect(res.body.price).toBe('45.00');
    expect(res.body.priceListId).toBe(priceListId);
  });
});
