import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Pressable, Text } from 'react-native';

import { AuthProvider, useAuth } from './src/AuthContext';
import { colors } from './src/theme';
import AuthScreen from './screens/AuthScreen';
import SearchScreen from './screens/SearchScreen';
import CleanerProfileScreen from './screens/CleanerProfileScreen';
import BookingScreen from './screens/BookingScreen';
import CleanerHomeScreen from './screens/CleanerHomeScreen';
import AdminScreen from './screens/AdminScreen';

const Stack = createNativeStackNavigator();

function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <Pressable onPress={signOut} style={{ marginRight: 12 }}>
      <Text style={{ color: colors.skyBlue, fontWeight: '600' }}>Sign out</Text>
    </Pressable>
  );
}

// A small "Admin" link in the header, shown only when isAdmin is true
// (checked server-side via the is_admin() RPC — see AuthContext). It's just
// navigation convenience; every admin action re-checks is_admin() itself.
function AdminLinkHeaderRight({ navigation }) {
  const { isAdmin, signOut } = useAuth();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {isAdmin && (
        <Pressable onPress={() => navigation.navigate('Admin')} style={{ marginRight: 16 }}>
          <Text style={{ color: colors.deepNavy, fontWeight: '700' }}>Admin</Text>
        </Pressable>
      )}
      <Pressable onPress={signOut} style={{ marginRight: 12 }}>
        <Text style={{ color: colors.skyBlue, fontWeight: '600' }}>Sign out</Text>
      </Pressable>
    </View>
  );
}

// Role-based routing: a 'client' starts on search/booking, a 'cleaner'
// starts on their own dashboard, and 'both' gets the client flow with the
// cleaner dashboard one tap away via the header (kept simple — swap for a
// bottom-tab navigator once there's a proper cleaner-side screen set). The
// Admin screen is reachable from every main screen's header when isAdmin.
function MainApp() {
  const { profile } = useAuth();
  const initialRoute = profile?.role === 'cleaner' ? 'CleanerHome' : 'Search';

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{ headerRight: (props) => <AdminLinkHeaderRight {...props} /> }}
    >
      <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Find a cleaner' }} />
      <Stack.Screen name="CleanerProfile" component={CleanerProfileScreen} options={{ title: 'Cleaner profile' }} />
      <Stack.Screen name="Booking" component={BookingScreen} options={{ title: 'Book' }} />
      <Stack.Screen name="CleanerHome" component={CleanerHomeScreen} options={{ title: 'Your profile' }} />
      <Stack.Screen name="Admin" component={AdminScreen} options={{ title: 'Admin' }} />
    </Stack.Navigator>
  );
}

function SuspendedScreen() {
  const { signOut } = useAuth();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 }}>
        Your account is suspended
      </Text>
      <Text style={{ color: colors.inkSoft, textAlign: 'center', marginBottom: 20 }}>
        Contact support if you think this is a mistake.
      </Text>
      <Pressable onPress={signOut}>
        <Text style={{ color: colors.skyBlue, fontWeight: '600' }}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function Root() {
  const { session, profile, profileLoading } = useAuth();

  // session === undefined -> still checking for an existing session on boot
  if (session === undefined || (session && profileLoading && !profile)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.skyBlue} />
      </View>
    );
  }

  // No session, or a session without a completed `users` row yet (mid
  // sign-up) both land on AuthScreen — it knows which step to show.
  if (!session || !profile) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthScreen} />
      </Stack.Navigator>
    );
  }

  if (profile.is_suspended) {
    return <SuspendedScreen />;
  }

  return <MainApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <Root />
      </NavigationContainer>
    </AuthProvider>
  );
}
