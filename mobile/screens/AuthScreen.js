import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { api } from '../src/api/client';
import { useAuth } from '../src/AuthContext';
import { colors } from '../src/theme';

// Three steps: phone -> OTP code -> (first time only) name + role. Supabase
// Auth handles the phone/OTP part; the `users` row (which carries the app's
// own role/full-name fields) is created separately in completeSignup, once,
// right after the very first successful verify for a phone number.
export default function AuthScreen() {
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState('phone'); // phone | code | profile
  const [phone, setPhone] = useState('+961');
  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('client');
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    if (phone.trim().length < 8) {
      Alert.alert('Enter a valid phone number', 'Include the country code, e.g. +961 71 234 567.');
      return;
    }
    setBusy(true);
    try {
      await api.requestOtp(phone.trim());
      setStep('code');
    } catch (e) {
      Alert.alert('Could not send code', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.trim().length < 4) return;
    setBusy(true);
    try {
      await api.verifyOtp({ phone: phone.trim(), token: code.trim() });
      // onAuthStateChange in AuthContext picks up the new session; if this
      // is a brand-new phone there's no `users` row yet, so ask for it here.
      setStep('profile');
    } catch (e) {
      Alert.alert('Invalid code', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function finishProfile() {
    if (!fullName.trim()) {
      Alert.alert('Your name is required');
      return;
    }
    if (!user) {
      Alert.alert('Something went wrong', 'No signed-in user found — try verifying again.');
      return;
    }
    setBusy(true);
    try {
      await api.completeSignup({ userId: user.id, phone: phone.trim(), fullName: fullName.trim(), role });
      await refreshProfile();
    } catch (e) {
      Alert.alert('Could not finish sign-up', e.message);
    } finally {
      setBusy(false);
    }
  }

  // A returning user who already has a `users` row never sees the 'profile'
  // step — AuthContext.profile becomes non-null right after verify and
  // App.js swaps to the main app automatically.
  if (step === 'profile' || (user && step !== 'phone' && step !== 'code')) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Almost done</Text>
        <Text style={styles.sub}>Tell us a bit about you.</Text>

        <Text style={styles.label}>Full name</Text>
        <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Full name" />

        <Text style={styles.label}>I want to</Text>
        <View style={styles.roleRow}>
          {[
            { key: 'client', label: 'Book cleaning' },
            { key: 'cleaner', label: 'Become a cleaner' },
            { key: 'both', label: 'Both' },
          ].map((r) => (
            <Pressable
              key={r.key}
              onPress={() => setRole(r.key)}
              style={[styles.roleChip, role === r.key && styles.roleChipActive]}
            >
              <Text style={[styles.roleChipText, role === r.key && styles.roleChipTextActive]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.button} onPress={finishProfile} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Finish sign-up</Text>}
        </Pressable>
      </View>
    );
  }

  if (step === 'code') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Enter the code</Text>
        <Text style={styles.sub}>We sent a code to {phone}.</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          placeholder="123456"
          maxLength={6}
        />
        <Pressable style={styles.button} onPress={verify} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
        </Pressable>
        <Pressable onPress={() => setStep('phone')}>
          <Text style={styles.linkText}>Use a different number</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to 3azili</Text>
      <Text style={styles.sub}>Enter your phone number to sign in or sign up.</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="+961 71 234 567"
      />
      <Pressable style={styles.button} onPress={sendCode} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send code</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  sub: { color: colors.inkSoft, marginBottom: 20 },
  label: { color: colors.inkSoft, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.white,
    marginBottom: 8,
  },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  roleChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: colors.white,
  },
  roleChipActive: { backgroundColor: colors.skyBlue, borderColor: colors.skyBlue },
  roleChipText: { color: colors.ink },
  roleChipTextActive: { color: '#fff', fontWeight: '600' },
  button: { backgroundColor: colors.skyBlue, padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  buttonText: { color: '#fff', fontWeight: '600' },
  linkText: { color: colors.skyBlue, textAlign: 'center', marginTop: 16 },
});
