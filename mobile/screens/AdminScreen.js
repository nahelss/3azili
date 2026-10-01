import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { api } from '../src/api/client';
import { colors } from '../src/theme';

// Every write on this screen calls one of the admin_* RPCs (or, for
// lower-stakes actions like resolving a dispute, a direct table update) —
// all gated server-side by is_admin(), so this screen is a convenience
// layer, not the actual security boundary. See the Supabase migrations.
const SECTIONS = ['Overview', 'Settings', 'Regions & rates', 'Payments', 'Disputes', 'Users', 'Audit log'];

export default function AdminScreen() {
  const [section, setSection] = useState('Overview');

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={{ paddingHorizontal: 12 }}>
        {SECTIONS.map((s) => (
          <Pressable key={s} onPress={() => setSection(s)} style={[styles.tab, section === s && styles.tabActive]}>
            <Text style={[styles.tabText, section === s && styles.tabTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView style={styles.body} contentContainerStyle={{ padding: 16 }}>
        {section === 'Overview' && <Overview />}
        {section === 'Settings' && <Settings />}
        {section === 'Regions & rates' && <RegionsRates />}
        {section === 'Payments' && <Payments />}
        {section === 'Disputes' && <Disputes />}
        {section === 'Users' && <Users />}
        {section === 'Audit log' && <AuditLog />}
      </ScrollView>
    </View>
  );
}

function Card({ title, children }) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- Overview
function Overview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getAdminStats().then(setStats).catch((e) => Alert.alert('Could not load stats', e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 20 }} />;
  if (!stats) return null;

  const tiles = [
    ['Total users', stats.total_users],
    ['Clients', stats.total_clients],
    ['Cleaners', stats.total_cleaners],
    ['Suspended', stats.suspended_users],
    ['Total bookings', stats.total_bookings],
    ['Requested', stats.requested_bookings],
    ['Confirmed', stats.confirmed_bookings],
    ['Completed', stats.completed_bookings],
    ['Pending payments', stats.pending_payments],
    ['Open disputes', stats.open_disputes],
  ];

  return (
    <View style={styles.grid}>
      {tiles.map(([label, value]) => (
        <View key={label} style={styles.tile}>
          <Text style={styles.tileValue}>{value}</Text>
          <Text style={styles.tileLabel}>{label}</Text>
        </View>
      ))}
      <Pressable style={styles.refreshButton} onPress={load}>
        <Text style={styles.refreshButtonText}>Refresh</Text>
      </Pressable>
    </View>
  );
}

// ----------------------------------------------------------------- Settings
function Settings() {
  const [config, setConfig] = useState(null);
  const [laborRate, setLaborRate] = useState('');
  const [suppliesRate, setSuppliesRate] = useState('');
  const [whishName, setWhishName] = useState('');
  const [whishNumber, setWhishNumber] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getPlatformConfig().then((c) => {
      setConfig(c);
      setLaborRate(String(c.commission_rate_labor));
      setSuppliesRate(String(c.commission_rate_supplies));
      setWhishName(c.whish_receive_name ?? '');
      setWhishNumber(c.whish_receive_number ?? '');
    });
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api.setPlatformConfig({
        laborRate: Number(laborRate),
        suppliesRate: Number(suppliesRate),
        whishName: whishName.trim(),
        whishNumber: whishNumber.trim(),
      });
      Alert.alert('Saved', 'Platform settings updated.');
    } catch (e) {
      Alert.alert('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <ActivityIndicator style={{ marginTop: 20 }} />;

  return (
    <>
      <Card title="Commission">
        <Text style={styles.label}>Labor commission (%)</Text>
        <TextInput style={styles.input} value={laborRate} onChangeText={setLaborRate} keyboardType="numeric" />
        <Text style={styles.label}>Supplies commission (%)</Text>
        <TextInput style={styles.input} value={suppliesRate} onChangeText={setSuppliesRate} keyboardType="numeric" />
      </Card>

      <Card title="Whish payment receiving info">
        <Text style={styles.hint}>Shown to clients on the booking screen when they pay with Whish.</Text>
        <Text style={styles.label}>Display name</Text>
        <TextInput style={styles.input} value={whishName} onChangeText={setWhishName} placeholder="e.g. 3azili" />
        <Text style={styles.label}>Whish number</Text>
        <TextInput style={styles.input} value={whishNumber} onChangeText={setWhishNumber} placeholder="+961 ..." keyboardType="phone-pad" />
      </Card>

      <Pressable style={styles.button} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save settings</Text>}
      </Pressable>
    </>
  );
}

// ------------------------------------------------------------ RegionsRates
function RegionsRates() {
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newRegionName, setNewRegionName] = useState('');
  const [newCityByRegion, setNewCityByRegion] = useState({});
  const [rateByRegion, setRateByRegion] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    api
      .getRegionsWithRates()
      .then((data) => {
        setRegions(data);
        setRateByRegion(Object.fromEntries(data.map((r) => [r.id, r.recommendedHourlyRate != null ? String(r.recommendedHourlyRate) : ''])));
      })
      .catch((e) => Alert.alert('Could not load regions', e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function addRegion() {
    if (!newRegionName.trim()) return;
    try {
      await api.addRegion(newRegionName.trim());
      setNewRegionName('');
      load();
    } catch (e) {
      Alert.alert('Could not add region', e.message);
    }
  }

  async function removeRegion(id, name) {
    Alert.alert('Remove region', `Remove "${name}" and all its cities?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => api.removeRegion(id).then(load).catch((e) => Alert.alert('Could not remove', e.message)),
      },
    ]);
  }

  async function addCity(regionId) {
    const name = (newCityByRegion[regionId] || '').trim();
    if (!name) return;
    try {
      await api.addCity(regionId, name);
      setNewCityByRegion((prev) => ({ ...prev, [regionId]: '' }));
      load();
    } catch (e) {
      Alert.alert('Could not add city', e.message);
    }
  }

  async function removeCity(cityId, name) {
    Alert.alert('Remove city', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => api.removeCity(cityId).then(load).catch((e) => Alert.alert('Could not remove', e.message)) },
    ]);
  }

  async function saveRate(regionId) {
    const rate = Number(rateByRegion[regionId]);
    if (!rate) return;
    try {
      await api.setRecommendedRate(regionId, rate);
    } catch (e) {
      Alert.alert('Could not save rate', e.message);
    }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 20 }} />;

  return (
    <>
      <Card title="Add region">
        <View style={styles.inlineRow}>
          <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={newRegionName} onChangeText={setNewRegionName} placeholder="Region name" />
          <Pressable style={styles.smallButton} onPress={addRegion}>
            <Text style={styles.smallButtonText}>Add</Text>
          </Pressable>
        </View>
      </Card>

      {regions.map((region) => (
        <Card key={region.id} title={region.name}>
          <Pressable onPress={() => removeRegion(region.id, region.name)}>
            <Text style={styles.destructiveLink}>Remove region</Text>
          </Pressable>

          <Text style={styles.label}>Recommended hourly rate ($)</Text>
          <View style={styles.inlineRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={rateByRegion[region.id] ?? ''}
              onChangeText={(v) => setRateByRegion((prev) => ({ ...prev, [region.id]: v }))}
              keyboardType="numeric"
            />
            <Pressable style={styles.smallButton} onPress={() => saveRate(region.id)}>
              <Text style={styles.smallButtonText}>Save</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Cities / villages</Text>
          {region.cities.map((c) => (
            <View key={c.id} style={styles.cityRow}>
              <Text style={styles.cityName}>{c.name}</Text>
              <Pressable onPress={() => removeCity(c.id, c.name)}>
                <Text style={styles.destructiveLink}>Remove</Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.inlineRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={newCityByRegion[region.id] ?? ''}
              onChangeText={(v) => setNewCityByRegion((prev) => ({ ...prev, [region.id]: v }))}
              placeholder="New city / village"
            />
            <Pressable style={styles.smallButton} onPress={() => addCity(region.id)}>
              <Text style={styles.smallButtonText}>Add</Text>
            </Pressable>
          </View>
        </Card>
      ))}
    </>
  );
}

// -------------------------------------------------------------- Payments
function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.listPendingPayments().then(setPayments).catch((e) => Alert.alert('Could not load payments', e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function clear(paymentId) {
    Alert.alert('Mark cleared', "Confirm you've checked this transfer actually arrived in Whish before clearing.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark cleared',
        onPress: () => api.markPaymentCleared(paymentId).then(load).catch((e) => Alert.alert('Could not clear', e.message)),
      },
    ]);
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 20 }} />;
  if (!payments.length) return <Text style={styles.hint}>No pending payments — all caught up.</Text>;

  return (
    <>
      {payments.map((p) => (
        <Card key={p.id}>
          <Text style={styles.cardTitle}>${Number(p.amount).toFixed(2)} via {p.method}</Text>
          <Text style={styles.hint}>Booking: {p.booking_id}</Text>
          <Text style={styles.hint}>Their reference: {p.payer_reference || '—'}</Text>
          <Pressable style={styles.button} onPress={() => clear(p.id)}>
            <Text style={styles.buttonText}>Mark cleared</Text>
          </Pressable>
        </Card>
      ))}
    </>
  );
}

// -------------------------------------------------------------- Disputes
function Disputes() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolutionById, setResolutionById] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    api.listDisputes().then(setDisputes).catch((e) => Alert.alert('Could not load disputes', e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function resolve(id) {
    const resolution = (resolutionById[id] || '').trim();
    if (!resolution) {
      Alert.alert('Enter a resolution note first');
      return;
    }
    try {
      await api.resolveDispute(id, resolution);
      load();
    } catch (e) {
      Alert.alert('Could not resolve', e.message);
    }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 20 }} />;
  if (!disputes.length) return <Text style={styles.hint}>No disputes on record.</Text>;

  return (
    <>
      {disputes.map((d) => (
        <Card key={d.id} title={`${d.status.toUpperCase()} — booking ${d.booking_id.slice(0, 8)}…`}>
          <Text style={styles.hint}>Reason: {d.reason}</Text>
          {d.status !== 'resolved' ? (
            <>
              <TextInput
                style={styles.input}
                value={resolutionById[d.id] ?? ''}
                onChangeText={(v) => setResolutionById((prev) => ({ ...prev, [d.id]: v }))}
                placeholder="Resolution note"
              />
              <Pressable style={styles.button} onPress={() => resolve(d.id)}>
                <Text style={styles.buttonText}>Mark resolved</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.hint}>Resolution: {d.resolution}</Text>
          )}
        </Card>
      ))}
    </>
  );
}

// ----------------------------------------------------------------- Users
function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.listUsers().then(setUsers).catch((e) => Alert.alert('Could not load users', e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function toggleSuspend(u) {
    const next = !u.is_suspended;
    Alert.alert(next ? 'Suspend user' : 'Unsuspend user', u.full_name || u.phone, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: next ? 'Suspend' : 'Unsuspend',
        style: next ? 'destructive' : 'default',
        onPress: () => api.setUserSuspended(u.id, next).then(load).catch((e) => Alert.alert('Could not update', e.message)),
      },
    ]);
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 20 }} />;

  return (
    <>
      {users.map((u) => (
        <Card key={u.id}>
          <Text style={styles.cardTitle}>{u.full_name || '(no name)'} {u.is_suspended ? '— SUSPENDED' : ''}</Text>
          <Text style={styles.hint}>{u.phone || u.email || 'no contact on file'} · {u.role}</Text>
          <Pressable style={u.is_suspended ? styles.button : styles.destructiveButton} onPress={() => toggleSuspend(u)}>
            <Text style={styles.buttonText}>{u.is_suspended ? 'Unsuspend' : 'Suspend'}</Text>
          </Pressable>
        </Card>
      ))}
    </>
  );
}

// -------------------------------------------------------------- AuditLog
function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listAuditLog().then(setLogs).catch((e) => Alert.alert('Could not load audit log', e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator style={{ marginTop: 20 }} />;
  if (!logs.length) return <Text style={styles.hint}>No admin actions recorded yet.</Text>;

  return (
    <>
      {logs.map((l) => (
        <View key={l.id} style={styles.logRow}>
          <Text style={styles.logLine}>
            {new Date(l.timestamp).toLocaleString()} · {l.target_type} · {l.field_changed}
          </Text>
          {l.old_value || l.new_value ? (
            <Text style={styles.logDetail} numberOfLines={2}>
              {l.old_value ?? '—'} → {l.new_value ?? '—'}
            </Text>
          ) : null}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabBar: { flexGrow: 0, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { paddingVertical: 12, paddingHorizontal: 14 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.skyBlue },
  tabText: { color: colors.inkSoft, fontWeight: '600' },
  tabTextActive: { color: colors.skyBlue },
  body: { flex: 1 },
  card: { backgroundColor: colors.white, borderRadius: 10, padding: 14, marginBottom: 12 },
  cardTitle: { fontWeight: '700', fontSize: 15, color: colors.ink, marginBottom: 6 },
  label: { color: colors.inkSoft, marginBottom: 6, marginTop: 8 },
  hint: { color: colors.inkSoft, fontSize: 13, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.white,
    marginBottom: 8,
  },
  inlineRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  button: { backgroundColor: colors.skyBlue, padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 6 },
  destructiveButton: { backgroundColor: colors.bad, padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: '600' },
  smallButton: { backgroundColor: colors.skyBlue, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  smallButtonText: { color: '#fff', fontWeight: '600' },
  destructiveLink: { color: colors.bad, marginBottom: 8 },
  cityRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  cityName: { color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '47%', backgroundColor: colors.white, borderRadius: 10, padding: 14, alignItems: 'center' },
  tileValue: { fontSize: 24, fontWeight: '700', color: colors.deepNavy },
  tileLabel: { color: colors.inkSoft, marginTop: 4, textAlign: 'center' },
  refreshButton: { width: '100%', padding: 12, alignItems: 'center' },
  refreshButtonText: { color: colors.skyBlue, fontWeight: '600' },
  logRow: { backgroundColor: colors.white, borderRadius: 8, padding: 10, marginBottom: 8 },
  logLine: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  logDetail: { color: colors.inkSoft, fontSize: 12, marginTop: 2 },
});
