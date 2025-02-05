// C:\LitterWarden\screens\MapScreen.js

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  StatusBar,
  Dimensions,
  Alert,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebaseConfig';
import { BleManager } from 'react-native-ble-plx';
import base64 from 'react-native-base64';

const SERVICE_UUID = "62f3511c-bbaa-416c-af55-d51cddce0e9f";
const CHARACTERISTIC_UUID_TX = "b1a3511c-bbaa-416c-af55-d51cddce0e9f";

const SERVER_URL = 'http://192.168.1.74:5000';
const GOOGLE_MAPS_API_KEY = 'AIzaSyA3fi_S6XwEzXLx5rrbFdktku7Ii8tXW58';

const MapScreen = ({ navigation }) => {
  const { width } = Dimensions.get('window');

  // Marker images for different priorities
  const markerImages = {
    low: require('../assets/low-warning.png'),
    medium: require('../assets/medium-warning.png'),
    high: require('../assets/high-warning.png'),
  };

  // State variables
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [userEmail, setUserEmail] = useState('');

  // BLE manager and connection state
  const bleManager = useRef(new BleManager()).current;
  const [esp32Device, setEsp32Device] = useState(null);
  const [esp32Connected, setEsp32Connected] = useState(false);

  // Refs for location tracking and map view
  const watchIdRef = useRef(null);
  const mapRef = useRef(null);

  // Listen for auth state changes and store email locally.
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        console.log('User is logged in:', user.email);
        setUserEmail(user.email);
        try {
          await AsyncStorage.setItem('userEmail', user.email);
        } catch (error) {
          console.error("Error storing user email:", error);
        }
      } else {
        console.log('No user is logged in');
        setUserEmail('');
        await AsyncStorage.removeItem('userEmail');
      }
    });
    return () => unsubscribe();
  }, []);

  // Request location permission and get current location.
  const initializeLocation = async () => {
    console.log("initializeLocation called");
    setLoading(true);
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        console.log("Permission result:", granted);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', 'Location permission is required.');
          setLoading(false);
          return;
        }
      }
      Geolocation.getCurrentPosition(
        (position) => {
          const currentRegion = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          };
          console.log("Current location:", currentRegion);
          setLocation(currentRegion);
          AsyncStorage.setItem('lastKnownLocation', JSON.stringify(currentRegion));
          setLoading(false);
          if (mapRef.current) {
            mapRef.current.animateToRegion(currentRegion, 1000);
          }
          startTracking();
        },
        (error) => {
          console.error("getCurrentPosition error:", error);
          Alert.alert('Location Error', error.message);
          setLoading(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    } catch (error) {
      console.error("initializeLocation error:", error);
      Alert.alert('Permission Error', error.message);
      setLoading(false);
    }
  };

  // Start continuous location tracking.
  const startTracking = () => {
    if (watchIdRef.current) {
      Geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = Geolocation.watchPosition(
      (position) => {
        const updatedRegion = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        console.log("Updated location:", updatedRegion);
        setLocation(updatedRegion);
        AsyncStorage.setItem('lastKnownLocation', JSON.stringify(updatedRegion));
        if (mapRef.current) {
          mapRef.current.animateToRegion(updatedRegion, 1000);
        }
      },
      (error) => {
        console.error("watchPosition error:", error);
        Alert.alert('Location Error', error.message);
      },
      { enableHighAccuracy: true, distanceFilter: 50, interval: 5000, fastestInterval: 3000 }
    );
  };

  // Re-center the map on the current location.
  const centerMapOnUser = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion(location, 1000);
    }
  };

  // Fetch only the reports created by the signed-in user from MongoDB.
  const fetchReports = async () => {
    if (!userEmail) {
      console.log("User email not available; skipping fetchReports.");
      return;
    }
    try {
      // The endpoint returns only reports for the provided email.
      const response = await fetch(`${SERVER_URL}/reports?email=${encodeURIComponent(userEmail)}`);
      const data = await response.json();
      console.log("Fetched reports:", data);
      setReports(data);
    } catch (error) {
      console.error('Error fetching reports:', error);
    }
  };

  // Automatic BLE scanning and connection.
  const scanForESP32 = () => {
    console.log("[BLE] Starting scan for ESP32 device...");
    bleManager.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {
        console.error("[BLE] Scan error:", error);
        return;
      }
      if (device && device.name && device.name.includes("ESP32")) {
        console.log("[BLE] Found ESP32 device:", device.name, device.id);
        bleManager.stopDeviceScan();
        setEsp32Device(device);
        connectToESP32(device);
      }
    });
  };

  // BLE connection function.
  const connectToESP32 = async (device) => {
    try {
      const connectedDevice = await device.connect();
      console.log("[BLE] Connected to ESP32:", connectedDevice.id);
      await connectedDevice.discoverAllServicesAndCharacteristics();
      setEsp32Connected(true);
      connectedDevice.monitorCharacteristicForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID_TX,
        (error, characteristic) => {
          if (error) {
            console.error("[BLE] Notification error:", error);
            return;
          }
          if (characteristic?.value) {
            const decodedValue = base64.decode(characteristic.value);
            console.log("[BLE] Notification received:", decodedValue);
            if (decodedValue.startsWith("Button:")) {
              const count = parseInt(decodedValue.split(":")[1], 10);
              if (count === 1) {
                handleReport('low');
              } else if (count === 2) {
                handleReport('medium');
              } else if (count === 3) {
                handleReport('high');
              } else {
                console.log("[BLE] Unknown button count:", count);
              }
            }
          }
        }
      );
    } catch (error) {
      console.error("[BLE] Error connecting to ESP32:", error);
      setEsp32Connected(false);
    }
  };

  // Handle a report triggered by a BLE button press.
  // This function retrieves the user's email and current location,
  // then posts the new report to the server.
  const handleReport = async (priority) => {
    let emailToUse = userEmail;
    if (!emailToUse) {
      try {
        emailToUse = await AsyncStorage.getItem('userEmail');
      } catch (error) {
        console.error("Error retrieving user email from storage:", error);
      }
    }
    if (!emailToUse) {
      console.warn("No user email found. Cannot send report.");
      Alert.alert('User Not Recognized', "Please log in again.");
      return;
    }
    let currentLocation = location;
    if (!currentLocation) {
      try {
        const storedLocation = await AsyncStorage.getItem('lastKnownLocation');
        if (storedLocation) {
          currentLocation = JSON.parse(storedLocation);
        }
      } catch (e) {
        console.error("Error retrieving last known location:", e);
      }
    }
    if (!currentLocation) {
      console.warn("Location not available when handling report");
      Alert.alert(
        'Location Not Available',
        "Fetching your current location. Please try again shortly."
      );
      return;
    }
    const { town, county, country } = await getAddressFromCoords(
      currentLocation.latitude,
      currentLocation.longitude
    );
    const newReport = {
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      town,
      county,
      country,
      priority,
      email: emailToUse,
    };
    console.log('Sending report to server:', newReport);
    try {
      const response = await fetch(`${SERVER_URL}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReport),
      });
      if (response.ok) {
        Alert.alert(
          'Report Sent',
          `Litter report (${priority}) in ${town}, ${county}, ${country} saved.`
        );
        // Add the new report to the state only if the POST was successful.
        setReports((prevReports) => [...prevReports, newReport]);
      } else {
        Alert.alert('Error', 'Failed to send report.');
      }
    } catch (error) {
      console.error('Error reporting location:', error);
      Alert.alert('Error', 'Could not connect to the database.');
    }
  };

  // Helper function to get address details from coordinates.
  const getAddressFromCoords = async (latitude, longitude) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      console.log("Google Maps Geocode Response:", JSON.stringify(data, null, 2));
  
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        let bestResult = data.results.find(result =>
          result.address_components.some(comp => 
            comp.types.includes("locality") || comp.types.includes("postal_town")
          )
        ) || data.results[0];
  
        let town = 'Unknown';
        let county = 'Unknown';
        let country = 'Unknown';
  
        bestResult.address_components.forEach((component) => {
          if (component.types.includes("locality") || component.types.includes("postal_town")) {
            town = component.long_name;
          }
          if (component.types.includes("administrative_area_level_2")) {
            county = component.long_name;
          }
          if (component.types.includes("administrative_area_level_1") && county === 'Unknown') {
            county = component.long_name;
          }
          if (component.types.includes("country")) {
            country = component.long_name;
          }
        });
  
        return { town, county, country };
      } else {
        console.error("Geocoding API error or no results:", data.status, data.error_message);
      }
    } catch (error) {
      console.error('Error fetching address from Google Maps:', error);
    }
    return { town: 'Unknown', county: 'Unknown', country: 'Unknown' };
  };

  // useFocusEffect: When the screen gains focus, initialize the location,
  // fetch reports, and scan for the ESP32.
  useFocusEffect(
    useCallback(() => {
      const onFocus = async () => {
        await initializeLocation();
        if (userEmail) {
          fetchReports();
        }
        scanForESP32();
      };
      onFocus();
      return () => {
        if (watchIdRef.current) {
          Geolocation.clearWatch(watchIdRef.current);
        }
        bleManager.stopDeviceScan();
      };
    }, [userEmail])
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={styles.loadingText}>Fetching location...</Text>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={styles.loadingText}>Location not available</Text>
        <TouchableOpacity style={styles.retryButton} onPress={initializeLocation}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Compute marker offsets while filtering reports so that only those with an email
  // matching the logged-in user (case-insensitive) are shown.
  const markersCount = {};
  const markersWithOffset = reports
    .filter(report => 
      report.email && userEmail &&
      report.email.toLowerCase() === userEmail.toLowerCase()
    )
    .map((report) => {
      const key = `${report.latitude}-${report.longitude}`;
      const count = markersCount[key] || 0;
      markersCount[key] = count + 1;
      const offsetLat = report.latitude + count * 0.00005;
      const offsetLng = report.longitude + count * 0.00005;
      return { ...report, offsetLat, offsetLng };
    });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Text style={styles.header}>Litter Reporting</Text>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={location}
          showsUserLocation={true}
          followsUserLocation={true}
          showsMyLocationButton={true}
          scrollEnabled={true}
          zoomEnabled={true}
          showsCompass={true}
          rotateEnabled={false}
        >
          {markersWithOffset.map((report, index) => (
            <Marker
              key={index}
              coordinate={{ latitude: report.offsetLat, longitude: report.offsetLng }}
              title={`Litter Report - ${report.priority}`}
              anchor={{ x: 0.5, y: 0.5 }}
              image={markerImages[report.priority]}
              tracksViewChanges={true}
            />
          ))}
        </MapView>
        {/* Button to re-center the map on your current location */}
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={centerMapOnUser}
        >
          <Text style={styles.refreshButtonText}>Center Map</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.deviceStatusContainer}>
        <Text style={[styles.deviceStatusText, { color: esp32Connected ? '#00FF00' : '#FF0000' }]}>
          {esp32Connected ? 'Device Connected' : 'Device Disconnected! Please reconnect.'}
        </Text>
      </View>

      <View style={styles.extraButtonContainer}>
        <TouchableOpacity
          style={styles.extraButton}
          onPress={() => navigation.navigate('Dashboard', { username: userEmail })}
        >
          <Text style={styles.extraButtonText}>Dashboard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.extraButton}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.extraButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.emailContainer}>
        <Text style={styles.emailText}>{userEmail || 'Guest'}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginVertical: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  loadingText: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: '#1e90ff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  mapContainer: {
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#fff',
    elevation: 5,
    marginBottom: 20,
    marginHorizontal: 10,
    width: Dimensions.get('window').width - 40,
    height: 300,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  refreshButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(30,144,255,0.9)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deviceStatusContainer: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  deviceStatusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  extraButtonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginTop: 15,
  },
  extraButton: {
    paddingVertical: 12,
    paddingHorizontal: 25,
    backgroundColor: '#4b4b4b',
    borderRadius: 25,
    marginHorizontal: 3,
    marginBottom: 8,
  },
  extraButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emailContainer: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  emailText: {
    color: '#fff',
    fontSize: 14,
  },
});

export default MapScreen;
