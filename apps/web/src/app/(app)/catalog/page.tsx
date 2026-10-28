'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { isValidMoney } from '../../../lib/decimal';
import type {
  CategoryDto,
  ListDto,
  ProductBarcodeDto,
  ProductDto,
  ProductUnitDto,
  UnitDto,
} from '../../../lib/types';
import { StatusBadge } from '../../../components/status-badge';

interface ProductDetail {
  units: ProductUnitDto[];
  barcodes: ProductBarcodeDto[];
}

/** Products: list + create + per-product unit conversions and barcodes. */
export default function CatalogPage() {
  const session = useSession();

  const [products, setProducts] = useState<ProductDto[]>([]);
  const [units, setUnits] = useState<UnitDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // create-product form
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [baseUnitId, setBaseUnitId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [soldInUnits, setSoldInUnits] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  // expansion + detail data
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ProductDetail>>({});
  const [detailError, setDetailError] = useState('');
  const [detailBusy, setDetailBusy] = useState(false);

  // add-conversion form (per expanded product)
  const [convUnitId, setConvUnitId] = useState('');
  const [convFactor, setConvFactor] = useState('');
  const [convPrice, setConvPrice] = useState('');

  // add-barcode form (per expanded product)
  const [barcode, setBarcode] = useState('');
  const [barcodePrimary, setBarcodePrimary] = useState(false);

  const loadProducts = useCallback(async (token: string) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch<ListDto<ProductDto>>('/products', { token });
      setProducts(res.items);
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    const token = session.accessToken;
    void loadProducts(token);
    void apiFetch<ListDto<UnitDto>>('/units', { token }).then(
      (r) => setUnits(r.items),
      () => setUnits([]),
    );
    void apiFetch<ListDto<CategoryDto>>('/categories', { token }).then(
      (r) => setCategories(r.items),
      () => setCategories([]),
    );
  }, [session, loadProducts]);

  const unitById = new Map(units.map((u) => [u.id, u] as const));
  const categoryById = new Map(categories.map((c) => [c.id, c] as const));

  async function openDetail(product: ProductDto) {
    if (!session) return;
    if (expandedId === product.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(product.id);
    setDetailError('');
    setConvUnitId('');
    setConvFactor('');
    setConvPrice('');
    setBarcode('');
    setBarcodePrimary(false);
    if (details[product.id]) return;
    setDetailBusy(true);
    try {
      const [u, b] = await Promise.all([
        apiFetch<ProductUnitDto[]>(`/products/${product.id}/units`, { token: session.accessToken }),
        apiFetch<ProductBarcodeDto[]>(`/products/${product.id}/barcodes`, {
          token: session.accessToken,
        }),
      ]);
      setDetails((prev) => ({ ...prev, [product.id]: { units: u, barcodes: b } }));
    } catch (err) {
      setDetailError(apiErrorMessage(err));
    } finally {
      setDetailBusy(false);
    }
  }

  function refreshDetail(id: string) {
    if (!session) return;
    void Promise.all([
      apiFetch<ProductUnitDto[]>(`/products/${id}/units`, { token: session.accessToken }),
      apiFetch<ProductBarcodeDto[]>(`/products/${id}/barcodes`, { token: session.accessToken }),
    ]).then(
      ([u, b]) => setDetails((prev) => ({ ...prev, [id]: { units: u, barcodes: b } })),
      (err) => setDetailError(apiErrorMessage(err)),
    );
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setFormError('');
    setOkMsg('');
    if (code.trim().length < 2) {
      setFormError('Code must be at least 2 characters.');
      return;
    }
    if (name.trim().length < 2) {
      setFormError('Name must be at least 2 characters.');
      return;
    }
    if (!isValidMoney(sellingPrice.trim())) {
      setFormError('Selling price must be a decimal like 12.50 (no minus sign).');
      return;
    }
    if (!baseUnitId) {
      setFormError('Pick a base unit.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch<ProductDto>('/products', {
        method: 'POST',
        token: session.accessToken,
        body: {
          code: code.trim(),
          name: name.trim(),
          sellingPrice: sellingPrice.trim(),
          baseUnitId,
          categoryId: categoryId || undefined,
          soldInUnits,
        },
      });
      setCode('');
      setName('');
      setSellingPrice('');
      setBaseUnitId('');
      setCategoryId('');
      setSoldInUnits(true);
      setOkMsg('Product created.');
      await loadProducts(session.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addConversion(productId: string) {
    if (!session) return;
    setDetailError('');
    if (!convUnitId) {
      setDetailError('Pick a unit for the conversion.');
      return;
    }
    const factor = convFactor.trim();
    const price = convPrice.trim();
    if (!/^\d{1,14}(\.\d{1,6})?$/.test(factor) || factor === '0' || factor === '0.000000') {
      setDetailError('Conversion factor must be a positive decimal, e.g. 12 or 0.5.');
      return;
    }
    if (price && !isValidMoney(price)) {
      setDetailError('Price must be a decimal like 12.50.');
      return;
    }
    setDetailBusy(true);
    try {
      await apiFetch<ProductUnitDto>(`/products/${productId}/units`, {
        method: 'POST',
        token: session.accessToken,
        body: {
          unitId: convUnitId,
          conversionFactor: factor,
          price: price || undefined,
        },
      });
      setConvUnitId('');
      setConvFactor('');
      setConvPrice('');
      refreshDetail(productId);
    } catch (err) {
      setDetailError(apiErrorMessage(err));
    } finally {
      setDetailBusy(false);
    }
  }

  async function addBarcode(productId: string) {
    if (!session) return;
    setDetailError('');
    const value = barcode.trim();
    if (value.length < 3) {
      setDetailError('Barcode must be at least 3 characters.');
      return;
    }
    setDetailBusy(true);
    try {
      await apiFetch<ProductBarcodeDto>(`/products/${productId}/barcodes`, {
        method: 'POST',
        token: session.accessToken,
        body: { barcode: value, isPrimary: barcodePrimary },
      });
      setBarcode('');
      setBarcodePrimary(false);
      refreshDetail(productId);
    } catch (err) {
      setDetailError(apiErrorMessage(err));
    } finally {
      setDetailBusy(false);
    }
  }

  if (!session) return <p className="muted">Loading…</p>;

  const detail = expandedId ? details[expandedId] : undefined;

  return (
    <>
      <div className="page-head">
        <h1>Products</h1>
        <span className="muted">
          {products.length} product{products.length === 1 ? '' : 's'} · expand a row for units
          &amp; barcodes
        </span>
      </div>

      <section className="card">
        <h2>New product</h2>
        <form className="form-grid" onSubmit={(e) => void createProduct(e)}>
          <label>
            <span className="muted">Code</span>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. SKU-001"
              required
              minLength={2}
            />
          </label>
          <label>
            <span className="muted">Name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mineral water 1L"
              required
              minLength={2}
            />
          </label>
          <label>
            <span className="muted">Selling price (base unit)</span>
            <input
              className="input"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="e.g. 12.50"
              inputMode="decimal"
              required
            />
          </label>
          <label>
            <span className="muted">Base unit</span>
            <select
              className="input"
              value={baseUnitId}
              onChange={(e) => setBaseUnitId(e.target.value)}
              required
            >
              <option value="">— pick a unit —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">Category (optional)</span>
            <select
              className="input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— none —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="span-2 check-row" style={{ marginTop: 'var(--idp-space-2)' }}>
            <input
              id="sold-in-units"
              type="checkbox"
              checked={soldInUnits}
              onChange={(e) => setSoldInUnits(e.target.checked)}
            />
            <label htmlFor="sold-in-units">Sold in multiple units (enable conversions)</label>
          </div>
          <div className="span-2">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create product'}
            </button>
            {formError ? (
              <p className="error-text" role="alert">
                {formError}
              </p>
            ) : null}
            {okMsg ? <p className="ok-text" role="status">{okMsg}</p> : null}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>All products</h2>
        {loading ? (
          <p className="muted">Loading products…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : products.length === 0 ? (
          <p className="muted">No products yet — create the first one above.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th className="num">Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    expanded={expandedId === p.id}
                    onToggle={() => void openDetail(p)}
                    unitLabel={unitById.get(p.baseUnitId)?.code ?? '—'}
                    categoryLabel={
                      p.categoryId
                        ? categoryById.get(p.categoryId)?.name ?? null
                        : null
                    }
                  />
                ))}
                {expandedId && detail ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="detail-grid">
                        <div>
                          <h3 style={{ marginTop: 0 }}>Unit conversions</h3>
                          {detail.units.length === 0 ? (
                            <p className="muted">No conversions defined yet.</p>
                          ) : (
                            <div className="table">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Unit</th>
                                    <th className="num">× Factor</th>
                                    <th className="num">Price</th>
                                    <th>Default sale</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.units.map((pu) => (
                                    <tr key={pu.id}>
                                      <td>{pu.unitCode ?? unitById.get(pu.unitId)?.code ?? pu.unitId.slice(0, 8)}</td>
                                      <td className="num">{pu.conversionFactor}</td>
                                      <td className="num">{pu.price ?? '—'}</td>
                                      <td>{pu.isDefaultSale ? 'yes' : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <form
                            className="form-grid"
                            style={{ marginTop: 'var(--idp-space-4)' }}
                            onSubmit={(e) => {
                              e.preventDefault();
                              void addConversion(expandedId);
                            }}
                          >
                            <label>
                              <span className="muted">Unit</span>
                              <select
                                className="input"
                                value={convUnitId}
                                onChange={(e) => setConvUnitId(e.target.value)}
                              >
                                <option value="">— pick a unit —</option>
                                {units.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.code} · {u.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span className="muted">Conversion factor (1 unit = N base)</span>
                              <input
                                className="input"
                                value={convFactor}
                                onChange={(e) => setConvFactor(e.target.value)}
                                placeholder="e.g. 12"
                                inputMode="decimal"
                              />
                            </label>
                            <label>
                              <span className="muted">Price in this unit (optional)</span>
                              <input
                                className="input"
                                value={convPrice}
                                onChange={(e) => setConvPrice(e.target.value)}
                                placeholder="e.g. 149.00"
                                inputMode="decimal"
                              />
                            </label>
                            <div className="span-2">
                              <button className="btn" type="submit" disabled={detailBusy}>
                                Add conversion
                              </button>
                            </div>
                          </form>
                        </div>
                        <div>
                          <h3 style={{ marginTop: 0 }}>Barcodes</h3>
                          {detail.barcodes.length === 0 ? (
                            <p className="muted">No barcodes registered yet.</p>
                          ) : (
                            <div className="table">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Barcode</th>
                                    <th>Primary</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.barcodes.map((b) => (
                                    <tr key={b.id}>
                                      <td>{b.barcode}</td>
                                      <td>{b.isPrimary ? 'yes' : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <form
                            className="form-grid"
                            style={{ marginTop: 'var(--idp-space-4)' }}
                            onSubmit={(e) => {
                              e.preventDefault();
                              void addBarcode(expandedId);
                            }}
                          >
                            <label>
                              <span className="muted">Barcode</span>
                              <input
                                className="input"
                                value={barcode}
                                onChange={(e) => setBarcode(e.target.value)}
                                placeholder="e.g. 8901234567890"
                              />
                            </label>
                            <div className="span-2 check-row">
                              <input
                                id="barcode-primary"
                                type="checkbox"
                                checked={barcodePrimary}
                                onChange={(e) => setBarcodePrimary(e.target.checked)}
                              />
                              <label htmlFor="barcode-primary">Primary barcode</label>
                            </div>
                            <div className="span-2">
                              <button className="btn" type="submit" disabled={detailBusy}>
                                Add barcode
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                      {detailError ? (
                        <p className="error-text" role="alert">
                          {detailError}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
                {expandedId && !detail && detailBusy ? (
                  <tr>
                    <td colSpan={5}>
                      <p className="muted">Loading product detail…</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function ProductRow(props: {
  product: ProductDto;
  expanded: boolean;
  onToggle: () => void;
  unitLabel: string;
  categoryLabel: string | null;
}) {
  const p = props.product;
  return (
    <tr data-clickable="true" onClick={props.onToggle}>
      <td>
        {p.code}
        <div className="muted">base: {props.unitLabel}</div>
      </td>
      <td>
        {p.name}
        {props.categoryLabel ? <div className="muted">{props.categoryLabel}</div> : null}
      </td>
      <td>
        <StatusBadge status={p.status} />
      </td>
      <td className="num">{p.sellingPrice}</td>
      <td>
        <button
          className="btn"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            props.onToggle();
          }}
        >
          {props.expanded ? 'Close' : 'Units & barcodes'}
        </button>
      </td>
    </tr>
  );
}
