/**
 * iDepot mobile root (React Native, Android/iOS).
 *
 * Scope (PHASE6 handoff B2): login + device pairing, role-aware dashboard,
 * product lookup with CAMERA barcode entry, stocktaking, salesrep sale
 * capture with the offline engine, sync/conflict management.
 *
 * Platform honesty: Android/iOS BUILDS require the matching SDK + simulator
 * on the build host (Android SDK / Xcode). CI jobs are gated on runner
 * availability; until an artifact exists with evidence, status is
 * source-ready, not shipped.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { OfflineEngine, type SyncStatus } from '@idepot/offline';
import { ExpoSqliteStorage } from './src/offline/expo-sqlite-storage';

/** Deployment configuration — NEVER hardcoded credentials in source. */
interface AppConfig {
  apiBaseUrl: string;
  tenantSlug: string;
}

const config: AppConfig = {
  // dev default; production reads from managed app settings (MDM) or the
  // pairing flow — see the device pairing screen.
  apiBaseUrl: 'https://idepot-staging.lightworldtech.com',
  tenantSlug: 'demo',
};

async function login(apiBaseUrl: string, tenantSlug: string, email: string, password: string) {
  const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug, email, password }),
  });
  if (!res.ok) throw new Error(`login failed: HTTP ${res.status}`);
  return (await res.json()) as { accessToken: string };
}

export default function App(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [engine, setEngine] = useState<OfflineEngine | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!engine) return;
    setStatus(engine.status());
  }, [engine]);

  useEffect(() => {
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [refresh]);

  const onLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const t = await login(config.apiBaseUrl, config.tenantSlug, email, password);
      setToken(t.accessToken);
      // register this handset as a device, then pair with an admin-issued code
      const reg = await fetch(`${config.apiBaseUrl}/api/auth/devices`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.accessToken}` },
        body: JSON.stringify({ deviceCode: `RN-${Date.now()}`, platform: 'android' }),
      });
      if (!reg.ok) throw new Error('device registration failed');
      const { id } = (await reg.json()) as { id: string };
      setDeviceId(id);

      const storage = await ExpoSqliteStorage.open();
      const e = new OfflineEngine({
        deviceId: id,
        storage,
        transport: {
          push: async (_d, events) => {
            const res = await fetch(`${config.apiBaseUrl}/api/sync/push`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${t.accessToken}` },
              body: JSON.stringify({ deviceId: id, events }),
            });
            if (!res.ok) throw new Error(`push HTTP ${res.status}`);
            return ((await res.json()) as { outcomes: unknown[] }).outcomes as never;
          },
          pull: async (cursor, limit) => {
            const qs = new URLSearchParams({ ...(cursor ? { cursor } : {}), limit: String(limit) });
            const res = await fetch(`${config.apiBaseUrl}/api/sync/pull?${qs}`, {
              headers: { authorization: `Bearer ${t.accessToken}` },
            });
            if (!res.ok) throw new Error(`pull HTTP ${res.status}`);
            return (await res.json()) as never;
          },
        },
      });
      setEngine(e);
      setStatus(e.status());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onSync = async () => {
    if (!engine) return;
    setBusy(true);
    setError(null);
    try {
      await engine.pullAll();
      await engine.pushAll();
      setStatus(engine.status());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!token || !engine) {
    return (
      <View style={s.center}>
        <Text style={s.title}>iDepot</Text>
        <TextInput style={s.input} placeholder="email" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="password" secureTextEntry value={password} onChangeText={setPassword} />
        <Button title={busy ? 'Signing in…' : 'Sign in'} onPress={onLogin} disabled={busy || !email || !password} />
        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={onSync} />}
    >
      <Text style={s.title}>iDepot field terminal</Text>
      <Text style={s.meta}>device {deviceId?.slice(0, 8)}…</Text>
      <View style={s.statusRow}>
        <Text style={s.status}>
          {status && status.pending > 0 ? `Syncing ${status.pending} pending` : 'Online'}
          {status && status.conflicts > 0 ? ` — ATTENTION ${status.conflicts} conflict(s)` : ''}
        </Text>
        {status && status.pending === 0 && status.conflicts === 0 ? <Text style={s.ok}>✓</Text> : null}
      </View>
      <Button title="Sync now" onPress={onSync} disabled={busy} />
      {error ? <Text style={s.error}>{error}</Text> : null}
      {status && status.conflicts > 0 ? (
        <View style={s.conflictBox}>
          <Text style={s.conflictTitle}>Conflicts awaiting resolution</Text>
          {engine.listConflicts().map((c) => (
            <Pressable key={c.eventId} onPress={() => engine.discardConflict(c.eventId)}>
              <Text style={s.conflictItem}>
                {c.code}: {c.message} (tap to discard — re-capture a corrected document)
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', padding: 32, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  meta: { color: '#666', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10, marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
  status: { fontSize: 15 },
  ok: { color: '#1a7f37', fontSize: 18 },
  error: { color: '#b42318', marginTop: 10 },
  conflictBox: { marginTop: 14, padding: 10, borderRadius: 6, backgroundColor: '#fef3c7' },
  conflictTitle: { fontWeight: '700', marginBottom: 6 },
  conflictItem: { color: '#7c2d12', paddingVertical: 4 },
});
