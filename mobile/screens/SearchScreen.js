import { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { api } from '../src/api/client';
import { geocodeAddress } from '../src/googleMaps';
import { colors } from '../src/theme';

// Two ways to search, same as the web prototype: pick a Region -> City
// (admin-managed, matches how cleaners set their own coverage), or type an
// address and search within a radius (geocoded via Google, then filtered
// client-side by distance in searchCleanersNearby — see src/api/client.js).
export default function SearchScreen({ navigation }) {
  const [mode, setMode] = useState('city'); // 'city' | 'address'

  const [regions, setRegions] = useState([]);
  const [regionId, setRegionId] = useState(null);
  const [city, setCity] = useState(null);

  const [address, setAddress] = useState('');
  const [radiusKm, setRadiusKm] = useState('10');
  const [geocoding, setGeocoding] = useState(false);

  const [cleaners, setCleaners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRegions().then((data) => {
      setRegions(data);
      if (data.length) {
        setRegionId(data[0].id);
        setCity(data[0].cities[0]?.name ?? null);
      }
    });
  }, []);

  useEffect(() => {
    if (mode !== 'city' || !city) return;
    let cancelled = false;
    setLoading(true);
    api
      .searchCleaners({ city })
      .then((data) => !cancelled && setCleaners(data))
      .catch(() => !cancelled && setCleaners([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mode, city]);

  async function searchByAddress() {
    if (!address.trim()) return;
    setGeocoding(true);
    setLoading(true);
    try {
      const { lat, lng } = await geocodeAddress(address);
      const data = await api.searchCleanersNearby({ lat, lng, radiusKm: Number(radiusKm) || 10 });
      setCleaners(data);
    } catch (e) {
      Alert.alert('Search failed', e.message);
      setCleaners([]);
    } finally {
      setGeocoding(false);
      setLoading(false);
    }
  }

  const currentRegion = regions.find((r) => r.id === regionId);
  const currentCityId = currentRegion?.cities.find((c) => c.name === city)?.id ?? null;

  return (
    <View style={styles.container}>
      <View style={styles.modeRow}>
        <Pressable style={[styles.modeTab, mode === 'city' && styles.modeTabActive]} onPress={() => setMode('city')}>
          <Text style={[styles.modeTabText, mode === 'city' && styles.modeTabTextActive]}>By region / city</Text>
        </Pressable>
        <Pressable
          style={[styles.modeTab, mode === 'address' && styles.modeTabActive]}
          onPress={() => setMode('address')}
        >
          <Text style={[styles.modeTabText, mode === 'address' && styles.modeTabTextActive]}>By address</Text>
        </Pressable>
      </View>

      {mode === 'city' ? (
        <>
          <Text style={styles.label}>Region</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={regionId}
              onValueChange={(id) => {
                setRegionId(id);
                const region = regions.find((r) => r.id === id);
                setCity(region?.cities[0]?.name ?? null);
              }}
            >
              {regions.map((r) => (
                <Picker.Item key={r.id} label={r.name} value={r.id} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>City / village</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={city} onValueChange={setCity}>
              {(currentRegion?.cities ?? []).map((c) => (
                <Picker.Item key={c.id} label={c.name} value={c.name} />
              ))}
            </Picker>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>Your address</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="e.g. Achrafieh, Beirut"
          />
          <Text style={styles.label}>Search radius (km)</Text>
          <TextInput style={styles.input} value={radiusKm} onChangeText={setRadiusKm} keyboardType="numeric" />
          <Pressable style={styles.searchButton} onPress={searchByAddress} disabled={geocoding}>
            {geocoding ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchButtonText}>Search</Text>}
          </Pressable>
        </>
      )}

      {loading && <ActivityIndicator style={{ marginTop: 12 }} />}
      <FlatList
        data={cleaners}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('CleanerProfile', { cleanerId: item.id, cityId: currentCityId })}
          >
            <Text style={styles.name}>{item.displayName}</Text>
            <Text style={styles.sub}>
              {item.languages.join(', ')} · ${item.hourlyRate}/hr · ★ {item.ratingAvg.toFixed(1)} ({item.ratingCount})
              {item.distanceKm != null ? ` · ${item.distanceKm.toFixed(1)} km away` : ''}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading && <Text style={styles.sub}>No cleaners found — try a different city or a wider radius.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  modeRow: { flexDirection: 'row', marginBottom: 12, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  modeTab: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.white },
  modeTabActive: { backgroundColor: colors.skyBlue },
  modeTabText: { color: colors.ink, fontWeight: '600' },
  modeTabTextActive: { color: '#fff' },
  label: { color: '#666', marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 8, backgroundColor: '#fff' },
  pickerWrap: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 8, overflow: 'hidden' },
  searchButton: { backgroundColor: colors.skyBlue, padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  searchButtonText: { color: '#fff', fontWeight: '600' },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontWeight: '600', fontSize: 16 },
  sub: { color: '#666', marginTop: 2 },
});
