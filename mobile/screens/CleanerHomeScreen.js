import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { api } from '../src/api/client';
import { useAuth } from '../src/AuthContext';

// Cleaner-facing coverage picker: mirrors the web prototype's "Cleaner app"
// tab. A cleaner can cover one or more regions, and within each region
// choose specific cities/villages. Selections are saved via
// cleaner_coverage_cities (replace-all semantics — see updateCoverage in
// src/api/client.js).
//
// TODO beyond coverage: rate editing, availability toggle, incoming request
// accept/decline list, and the busy/free calendar from the web prototype.
export default function CleanerHomeScreen() {
  const { user, profile } = useAuth();
  const [regions, setRegions] = useState([]);
  const [selectedCityIds, setSelectedCityIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getRegions()
      .then(setRegions)
      .catch(() => Alert.alert('Could not load regions', 'Check that the backend is running.'))
      .finally(() => setLoading(false));
  }, []);

  function toggleCity(cityId) {
    setSelectedCityIds((prev) => {
      const next = new Set(prev);
      if (next.has(cityId)) next.delete(cityId);
      else next.add(cityId);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api.updateCoverage(user.id, Array.from(selectedCityIds));
      Alert.alert('Saved', 'Your coverage area has been updated.');
    } catch (e) {
      Alert.alert('Something went wrong', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{profile?.full_name ? `Hi, ${profile.full_name}` : 'Coverage area'}</Text>
      <Text style={styles.sub}>Choose the regions and cities/villages you're willing to work in.</Text>

      {regions.map((region) => (
        <View key={region.id} style={styles.regionBlock}>
          <Text style={styles.regionName}>{region.name}</Text>
          <View style={styles.chipRow}>
            {region.cities.map((city) => {
              const active = selectedCityIds.has(city.id);
              return (
                <Pressable
                  key={city.id}
                  onPress={() => toggleCity(city.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{city.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <Pressable style={styles.button} onPress={save} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save coverage area'}</Text>
      </Pressable>

      <Text style={styles.todo}>
        TODO: rate editing, availability toggle, incoming request accept/decline list, and the
        busy/free calendar — query cleaner_profiles / bookings / cleaner_calendar_blocks directly,
        same pattern as everything else in src/api/client.js.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  sub: { color: '#666', marginBottom: 16 },
  regionBlock: { marginBottom: 16 },
  regionName: { fontWeight: '600', fontSize: 15, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: '#1F94F3', borderColor: '#1F94F3' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  button: { backgroundColor: '#1F94F3', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  todo: { color: '#999', fontSize: 12, marginTop: 20, marginBottom: 30 },
});
