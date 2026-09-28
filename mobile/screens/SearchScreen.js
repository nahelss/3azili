import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { api } from '../src/api/client';

// Mirrors the web prototype: locations are grouped Region -> City/Village
// (admin-managed, see backend/src/routes/locations.js + admin.js), rather
// than a flat list or a GPS radius. The client picks a region, then a city
// within it; an exact-location pin is optional and asked for later in the
// booking flow, not here in search.
export default function SearchScreen({ navigation }) {
  const [regions, setRegions] = useState([]);
  const [regionId, setRegionId] = useState(null);
  const [city, setCity] = useState(null);
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
    if (!city) return;
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
  }, [city]);

  const currentRegion = regions.find((r) => r.id === regionId);
  const currentCityId = currentRegion?.cities.find((c) => c.name === city)?.id ?? null;

  return (
    <View style={styles.container}>
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
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={!loading && <Text style={styles.sub}>No cleaners found in this city/village yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { color: '#666', marginBottom: 4, marginTop: 8 },
  pickerWrap: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 8, overflow: 'hidden' },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontWeight: '600', fontSize: 16 },
  sub: { color: '#666', marginTop: 2 },
});
