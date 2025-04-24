// App.js (or wherever your main NavigationContainer is)

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Toast from 'react-native-toast-message';
import messaging from '@react-native-firebase/messaging'; 
import { auth } from './firebaseConfig';

import HomeScreen from './screens/HomeScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import Dashboard from './screens/Dashboard';
import MapScreen from './screens/MapScreen';
import CleanerInterface from './screens/CleanerInterface';
import LeaderboardScreen from './screens/LeaderboardScreen';

const Stack = createNativeStackNavigator();

function App() {
  useEffect(() => {
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      console.log('Foreground FCM Message Received:', JSON.stringify(remoteMessage));
      if (remoteMessage.data && remoteMessage.data.type === 'REPORT_CLEANED') {
        const currentUser = auth.currentUser;
        if (currentUser) { 
          console.log('Showing "Report Cleaned" toast notification.');
          Toast.show({
            type: 'success', 
            text1: 'Report Cleaned!',
            text2: `Your report near ${remoteMessage.data.reportTown || 'location'} was marked clean.`,
            visibilityTime: 4000, 
            position: 'top', 
          });
        } else {
            console.log("Received clean notification, but no user logged in locally.");
        }
      }

    });
    return unsubscribe; 
  }, []); 


  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Dashboard" component={Dashboard} />
        <Stack.Screen name="Map" component={MapScreen} />
        <Stack.Screen name="CleanerTasks" component={CleanerInterface} />
        <Stack.Screen
          name="Leaderboard"
          component={LeaderboardScreen}
          options={{ title: 'Top Reporters', headerShown: true }}
        />
      </Stack.Navigator>
      <Toast />
    </NavigationContainer>
  );
}

export default App;
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Background FCM Message Handler:', remoteMessage);

});
