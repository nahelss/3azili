import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { api } from '../src/api/client';

export default function CleanerProfileScreen({ route, navigation }) {
  const { cleanerId, cityId } = route.params;
  const [cleaner, setCleaner] = useState(null);

  useEffect(() => {
    api.getCleaner(cleanerId).then(setCleaner).catch(() => {});
  }, [cleanerId]);

  if (!cleaner) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{cleaner.anonymous ? 'Anonymous cleaner' : cleaner.user.fullName}</Text>
      <Text style={styles.sub}>
        ★ {cleaner.ratingAvg.toFixed(1)} ({cleaner.ratingCount}) · {cleaner.serviceType}
      </Text>
      <Text style={styles.sub}>${cleaner.hourlyRate}/hr · ${cleaner.dailyRate}/day</Text>
      <Text style={styles.sub}>Covers: {cleaner.coverageCities.map((c) => c.name).join(', ')}</Text>
      <Pressable
        style={styles.button}
        onPress={() => navigation.navigate('Booking', { cleaner, cityId })}
      >
        <Text style={styles.buttonText}>Book this cleaner</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  name: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  sub: { color: '#666', marginBottom: 4 },
  button: { marginTop: 20, backgroundColor: '#1F94F3', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
