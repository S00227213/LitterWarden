import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import LeaderboardScreen from './screens/LeaderboardScreen';   
import HomeScreen        from './screens/HomeScreen';
import LoginScreen       from './screens/LoginScreen';
import RegisterScreen    from './screens/RegisterScreen';
import MapScreen         from './screens/MapScreen';
import Dashboard         from './screens/Dashboard';
import AdminLoginScreen  from './screens/AdminLoginScreen';
import CleanerInterface  from './screens/CleanerInterface';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Home"     component={HomeScreen} />
        <Stack.Screen name="Login"      component={LoginScreen} />
        <Stack.Screen name="Register"   component={RegisterScreen} />
        <Stack.Screen name="Leaderboard"   component={LeaderboardScreen} />
        <Stack.Screen name="Map"        component={MapScreen} />
        <Stack.Screen name="Dashboard"  component={Dashboard} />
        <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
        <Stack.Screen name="CleanerInterface"
          component={CleanerInterface}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
