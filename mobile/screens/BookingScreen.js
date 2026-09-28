import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { api } from '../src/api/client';

// NOTE: this recomputes price client-side for display only. The backend is
// the source of truth (see backend/src/routes/bookings.js) — always trust
// its response over this local calculation before charging anyone.
const LABOR_RATE = 0.2; // keep in sync with PlatformConfig, or better: fetch it

export default function BookingScreen({ route }) {
  const { cleaner, cityId } = route.params;
  const [pricingType, setPricingType] = useState('HOURLY');
  const [duration, setDuration] = useState(String(cleaner.minBookingHours || 2));
  const [paymentMethod, setPaymentMethod] = useState('CASH');

  const dur = Number(duration) || 0;
  const base = pricingType === 'HOURLY' ? cleaner.hourlyRate * dur : cleaner.dailyRate * dur;
  const commission = base * LABOR_RATE;
  const total = base + commission;

  async function confirm() {
    try {
      await api.createBooking({
        clientId: 'demo-client-id', // replace once auth is wired up
        cleanerId: cleaner.id,
        pricingType,
        duration: dur,
        cityId,
        serviceType: cleaner.serviceType,
        bookingMode: 'REQUEST_ACCEPT',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + dur * 3600 * 1000).toISOString(),
        paymentMethod,
        supplyItemIds: [],
      });
      Alert.alert('Booking requested', 'The cleaner will confirm shortly.');
    } catch (e) {
      Alert.alert('Something went wrong', e.message);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Duration ({pricingType === 'HOURLY' ? 'hours' : 'days'})</Text>
      <TextInput style={styles.input} value={duration} onChangeText={setDuration} keyboardType="numeric" />

      <Text style={styles.line}>Labor: ${base.toFixed(2)}</Text>
      <Text style={styles.line}>Service fee (20%): ${commission.toFixed(2)}</Text>
      <Text style={styles.total}>Total: ${total.toFixed(2)}</Text>

      <Pressable style={styles.button} onPress={confirm}>
        <Text style={styles.buttonText}>Confirm booking</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { color: '#666', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 16 },
  line: { fontSize: 15, marginBottom: 4 },
  total: { fontSize: 18, fontWeight: '700', marginTop: 8, marginBottom: 20 },
  button: { backgroundColor: '#1F94F3', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
