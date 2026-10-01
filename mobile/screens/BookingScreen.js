import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { api } from '../src/api/client';
import { useAuth } from '../src/AuthContext';
import { colors } from '../src/theme';

// MVP payment flow: Whish only, sent to the platform's own Whish-registered
// number, confirmed manually by an admin — there's no Whish merchant API to
// automate this yet (see admin_mark_payment_cleared in the DB). The client
// sends the transfer themselves in the Whish app, types back whatever
// reference/confirmation it gave them, and the booking sits as "pending
// payment verification" until an admin checks and clears it.
const LABOR_RATE = 0.2; // keep in sync with platform_config.commission_rate_labor, or better: fetch it

export default function BookingScreen({ route }) {
  const { user } = useAuth();
  const { cleaner, cityId } = route.params;
  const [pricingType, setPricingType] = useState('hourly');
  const [duration, setDuration] = useState(String(cleaner.minBookingHours || 2));
  const [whish, setWhish] = useState(null);
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    api
      .getWhishReceiveInfo()
      .then(setWhish)
      .catch(() => setWhish(null));
  }, []);

  const dur = Number(duration) || 0;
  const base = pricingType === 'hourly' ? cleaner.hourlyRate * dur : cleaner.dailyRate * dur;
  const commission = base * LABOR_RATE;
  const total = base + commission;

  async function confirm() {
    if (!reference.trim()) {
      Alert.alert('Enter your Whish reference', 'After sending the transfer, Whish shows a confirmation — enter it here so we can match your payment.');
      return;
    }
    setSubmitting(true);
    try {
      const booking = await api.createBooking({
        clientId: user.id,
        cleanerId: cleaner.id,
        pricingType,
        duration: dur,
        cityId,
        serviceType: cleaner.serviceType,
        bookingMode: 'request_accept',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + dur * 3600 * 1000).toISOString(),
        paymentMethod: 'whish',
        supplyItemIds: [],
      });
      await api.submitWhishPayment({ bookingId: booking.id, payerId: user.id, amount: total, reference: reference.trim() });
      setSubmitted(true);
    } catch (e) {
      Alert.alert('Something went wrong', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Payment submitted</Text>
        <Text style={styles.sub}>
          We're verifying your Whish transfer — this usually takes a short while. Your cleaner will be
          notified once it's confirmed.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Duration ({pricingType === 'hourly' ? 'hours' : 'days'})</Text>
      <TextInput style={styles.input} value={duration} onChangeText={setDuration} keyboardType="numeric" />

      <Text style={styles.line}>Labor: ${base.toFixed(2)}</Text>
      <Text style={styles.line}>Service fee (20%): ${commission.toFixed(2)}</Text>
      <Text style={styles.total}>Total: ${total.toFixed(2)}</Text>

      <View style={styles.whishBox}>
        <Text style={styles.whishTitle}>Pay with Whish</Text>
        {whish?.number ? (
          <>
            <Text style={styles.whishLine}>
              Open Whish and send <Text style={styles.bold}>${total.toFixed(2)}</Text> to:
            </Text>
            <Text style={styles.whishNumber}>{whish.number}</Text>
            {whish.name ? <Text style={styles.whishLine}>{whish.name}</Text> : null}
          </>
        ) : (
          <Text style={styles.whishLine}>Loading payment details…</Text>
        )}
        <Text style={styles.label}>Whish confirmation / reference</Text>
        <TextInput
          style={styles.input}
          value={reference}
          onChangeText={setReference}
          placeholder="e.g. the code Whish shows after sending"
        />
      </View>

      <Pressable style={styles.button} onPress={confirm} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>I've sent the payment</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  sub: { color: colors.inkSoft, lineHeight: 20 },
  label: { color: '#666', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 8, backgroundColor: '#fff' },
  line: { fontSize: 15, marginBottom: 4 },
  total: { fontSize: 18, fontWeight: '700', marginTop: 8, marginBottom: 20 },
  whishBox: { backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 14, marginBottom: 16 },
  whishTitle: { fontWeight: '700', fontSize: 16, color: colors.ink, marginBottom: 6 },
  whishLine: { color: colors.inkSoft, marginBottom: 2 },
  whishNumber: { fontSize: 18, fontWeight: '700', color: colors.deepNavy, marginVertical: 4 },
  bold: { fontWeight: '700' },
  button: { backgroundColor: '#1F94F3', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
