
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Toast from 'react-native-toast-message'; 
import HomeScreen from './screens/HomeScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import Dashboard from './screens/Dashboard';
import MapScreen from './screens/MapScreen';
import CleanerInterface from './screens/CleanerInterface'; 

const Stack = createNativeStackNavigator();

function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Dashboard" component={Dashboard} />
        <Stack.Screen name="Map" component={MapScreen} />
        <Stack.Screen name="CleanerTasks" component={CleanerInterface} />
      </Stack.Navigator>
      <Toast />
    </NavigationContainer>
  );
}

export default App;