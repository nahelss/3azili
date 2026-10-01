import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { api } from '../src/api/client';
import { useAuth } from '../src/AuthContext';
import { colors } from '../src/theme';
import { geocodeAddress } from '../src/googleMaps';

// Steps: phone -> WhatsApp code -> (first time only) name + role + address
// + optional email. Supabase Auth handles the phone/OTP part; the `users`
// row (role/full-name/address/email) is created separately in
// completeSignup, once, right after the very first successful verify for a
// phone number. Address is geocoded via Google (googleMaps.js) so it's
// stored as lat/lng too, not just free text — that's what proximity search
// (searchCleanersNearby) and the cleaner's own coverage matching rely on.
//
// Signing in again later is just phone + WhatsApp code, same as the first
// time — Supabase's session persists on-device (see supabaseClient.js:
// persistSession + autoRefreshToken), so a person only re-enters a code if
// they signed out, reinstalled, or switched devices, not on every open.
//
// The optional email is an account-recovery path: once it's attached and
// the confirmation link is clicked (attachEmail in src/api/client.js), the
// same account can sign in with an emailed code instead of WhatsApp — for
// someone who's lost their phone number. That's the "recover with email"
// link below.
export default function AuthScreen() {
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState('phone'); // phone | code | profile | emailRecover | emailCode
  const [phone, setPhone] = useState('+961');
  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('client');
  const [address, setAddress] = useState('');
  const [geocoded, setGeocoded] = useState(null); // { formattedAddress, lat, lng } once verified
  const [geocoding, setGeocoding] = useState(false);
  const [email, setEmail] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function verifyAddress() {
    setGeocoding(true);
    try {
      const result = await geocodeAddress(address);
      setGeocoded(result);
    } catch (e) {
      Alert.alert('Could not find that address', e.message);
      setGeocoded(null);
    } finally {
      setGeocoding(false);
    }
  }

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
      await api.completeSignup({
        userId: user.id,
        phone: phone.trim(),
        fullName: fullName.trim(),
        role,
        address: geocoded?.formattedAddress ?? (address.trim() || null),
        addressLat: geocoded?.lat ?? null,
        addressLng: geocoded?.lng ?? null,
      });
      if (email.trim()) {
        try {
          await api.attachEmail(email.trim());
        } catch (e) {
          // Don't block sign-up over the email step — it's optional, and
          // the person can still use the app with just phone/WhatsApp.
          Alert.alert(
            'Signed up, but email could not be attached',
            `${e.message}\n\nYou can try adding it again later.`
          );
        }
      }
      await refreshProfile();
    } catch (e) {
      Alert.alert('Could not finish sign-up', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendEmailRecoveryCode() {
    if (!recoveryEmail.trim()) return;
    setBusy(true);
    try {
      await api.requestEmailOtp(recoveryEmail.trim());
      setStep('emailCode');
    } catch (e) {
      Alert.alert('Could not send code', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmailRecoveryCode() {
    if (emailCode.trim().length < 4) return;
    setBusy(true);
    try {
      await api.verifyEmailOtp({ email: recoveryEmail.trim(), token: emailCode.trim() });
      // If this email was properly attached+confirmed to an existing
      // account, onAuthStateChange picks up that same account's session —
      // AuthContext.profile will already be populated and App.js routes
      // straight to the main app, no 'profile' step needed.
    } catch (e) {
      Alert.alert('Invalid code', e.message);
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

        <Text style={styles.label}>Your address</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={(t) => {
            setAddress(t);
            setGeocoded(null); // any edit invalidates the last verified pin
          }}
          placeholder="Street, building, city — e.g. Hamra, Beirut"
        />
        <Pressable style={styles.secondaryButton} onPress={verifyAddress} disabled={geocoding || !address.trim()}>
          {geocoding ? (
            <ActivityIndicator color={colors.skyBlue} />
          ) : (
            <Text style={styles.secondaryButtonText}>Find on map</Text>
          )}
        </Pressable>
        {geocoded ? (
          <Text style={styles.geocodedNote}>✓ {geocoded.formattedAddress}</Text>
        ) : (
          <Text style={styles.geocodedHint}>
            Optional, but recommended — this is how nearby cleaners find you (or how clients find you, if
            you're a cleaner).
          </Text>
        )}

        <Text style={styles.label}>Email (optional)</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text style={styles.geocodedHint}>
          Lets you sign in another way if you ever lose access to this phone number — we'll send a
          confirmation link to check it's really yours.
        </Text>

        <Pressable style={styles.button} onPress={finishProfile} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Finish sign-up</Text>}
        </Pressable>
      </View>
    );
  }

  if (step === 'emailCode') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Enter the code</Text>
        <Text style={styles.sub}>We emailed a code to {recoveryEmail}.</Text>
        <TextInput
          style={styles.input}
          value={emailCode}
          onChangeText={setEmailCode}
          keyboardType="number-pad"
          placeholder="123456"
          maxLength={6}
        />
        <Pressable style={styles.button} onPress={verifyEmailRecoveryCode} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
        </Pressable>
        <Pressable onPress={() => setStep('emailRecover')}>
          <Text style={styles.linkText}>Use a different email</Text>
        </Pressable>
      </View>
    );
  }

  if (step === 'emailRecover') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Recover with email</Text>
        <Text style={styles.sub}>
          Enter the email you attached to your account — we'll send a sign-in code there instead of
          WhatsApp. This only works if that email was already confirmed on your account.
        </Text>
        <TextInput
          style={styles.input}
          value={recoveryEmail}
          onChangeText={setRecoveryEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Pressable style={styles.button} onPress={sendEmailRecoveryCode} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send email code</Text>}
        </Pressable>
        <Pressable onPress={() => setStep('phone')}>
          <Text style={styles.linkText}>Back to phone sign-in</Text>
        </Pressable>
      </View>
    );
  }

  if (step === 'code') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Enter the code</Text>
        <Text style={styles.sub}>We sent a WhatsApp message with a code to {phone}.</Text>
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
      <Text style={styles.sub}>Enter your phone number — we'll send a WhatsApp code to sign in or sign up.</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="+961 71 234 567"
      />
      <Pressable style={styles.button} onPress={sendCode} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send WhatsApp code</Text>}
      </Pressable>
      <Pressable onPress={() => setStep('emailRecover')}>
        <Text style={styles.linkText}>Lost your phone? Recover with email</Text>
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
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.skyBlue,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginBottom: 6,
  },
  secondaryButtonText: { color: colors.skyBlue, fontWeight: '600' },
  geocodedNote: { color: colors.leafDeep, marginBottom: 8, fontSize: 13 },
  geocodedHint: { color: colors.inkSoft, marginBottom: 8, fontSize: 12 },
  button: { backgroundColor: colors.skyBlue, padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  buttonText: { color: '#fff', fontWeight: '600' },
  linkText: { color: colors.skyBlue, textAlign: 'center', marginTop: 16 },
});
