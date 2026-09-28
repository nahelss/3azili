import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import SearchScreen from './screens/SearchScreen';
import CleanerProfileScreen from './screens/CleanerProfileScreen';
import BookingScreen from './screens/BookingScreen';
import CleanerHomeScreen from './screens/CleanerHomeScreen';

const Stack = createNativeStackNavigator();

// This stack covers the client-side flow plus the cleaner home screen.
// Split into separate navigators (client / cleaner / admin-web) once you
// add real auth and role-based routing — for now they're just screens in
// one stack so you can click through the whole thing.
export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator initialRouteName="Search">
        <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Find a cleaner' }} />
        <Stack.Screen name="CleanerProfile" component={CleanerProfileScreen} options={{ title: 'Cleaner profile' }} />
        <Stack.Screen name="Booking" component={BookingScreen} options={{ title: 'Book' }} />
        <Stack.Screen name="CleanerHome" component={CleanerHomeScreen} options={{ title: 'Your profile' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
