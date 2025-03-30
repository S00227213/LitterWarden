import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Alert,
  Platform,
  PermissionsAndroid,
  Modal,
  Image,
  Animated,
  ScrollView,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, signOut } from '../firebaseConfig';
import { BleManager } from 'react-native-ble-plx';
import base64 from 'react-native-base64';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';

// Env variables 
import {
  REACT_APP_AZURE_CV_KEY,
  REACT_APP_AZURE_CV_ENDPOINT,
  REACT_APP_GOOGLE_MAPS_API_KEY,
} from '@env';

import styles from './MapScreenStyles';

// Constants
const SERVICE_UUID = '62f3511c-bbaa-416c-af55-d51cddce0e9f';
const CHARACTERISTIC_UUID_TX = 'b1a3511c-bbaa-416c-af55-d51cddce0e9f';
const AZURE_CV_KEY = REACT_APP_AZURE_CV_KEY;
const AZURE_CV_ENDPOINT = REACT_APP_AZURE_CV_ENDPOINT;
const GOOGLE_MAPS_API_KEY = REACT_APP_GOOGLE_MAPS_API_KEY;
const SERVER_URL = 'https://3cf3-86-40-74-78.ngrok-free.app';

console.log("Server URL:", SERVER_URL);
if (!SERVER_URL) {
  Alert.alert("Config Error", "SERVER_URL undefined.");
}
console.log("Google Maps API Key:", GOOGLE_MAPS_API_KEY ? "Loaded" : "MISSING!");
if (!GOOGLE_MAPS_API_KEY) {
  console.error("Missing API Key!");
  Alert.alert("Config Error", "Google Maps API Key missing. Check .env.");
}

const MapScreen = ({ navigation }) => {
  const { width } = Dimensions.get('window');

  // Marker images 
  const markerImages = useMemo(() => ({
    low: require('../assets/low-warning.png'),
    medium: require('../assets/medium-warning.png'),
    high: require('../assets/high-warning.png'),
    clean: require('../assets/clean.png'),
  }), []);

  // State variables
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [userEmail, setUserEmail] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedMarkerIndex, setSelectedMarkerIndex] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [photoEvidence, setPhotoEvidence] = useState(null);
  const [lastError, setLastError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingImage, setIsDeletingImage] = useState(false);

  // Refs
  const bleManager = useRef(new BleManager()).current;
  const [esp32Device, setEsp32Device] = useState(null);
  const [esp32Connected, setEsp32Connected] = useState(false);
  const watchIdRef = useRef(null);
  const mapRef = useRef(null);
  const animatedScale = useRef(new Animated.Value(0.9)).current;
  const animatedOpacity = useRef(new Animated.Value(0)).current;

  // Memoized markers for the user
  const userMarkers = useMemo(() => {
    if (!userEmail) return [];
    return reports
      .filter(report => report.email && report.email.toLowerCase() === userEmail.toLowerCase())
      .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));
  }, [reports, userEmail]);

  /* Auth Listener */
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const email = user.email;
        console.log("Logged in:", email);
        setUserEmail(email);
        try { await AsyncStorage.setItem('userEmail', email); } catch (error) { console.error(error); }
      } else {
        console.log("Logged out.");
        setUserEmail('');
        await AsyncStorage.removeItem('userEmail');
        setReports([]);
        setLastError('');
      }
    });
    return () => unsubscribe();
  }, []);

  /* Fetch Reports */
  const fetchReports = useCallback(async () => {
    if (!userEmail) return;
    if (!SERVER_URL) {
      console.error("SERVER_URL missing!");
      setLastError("Server URL error.");
      return;
    }
    setLastError('');
    console.log(`Fetching reports for ${userEmail}...`);
    try {
      const url = `${SERVER_URL}/reports?email=${encodeURIComponent(userEmail)}&includeClean=false`;
      const response = await fetch(url);
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Fetch error: ${response.status}`, errorBody);
        setLastError(errorBody.includes("ERR_NGROK_") ? "Ngrok tunnel offline." : `Server error ${response.status}.`);
        return;
      }
      const data = await response.json();
      console.log(`Fetched ${data.length} reports.`);
      setReports(data);
    } catch (error) {
      console.error('Network error:', error);
      setLastError(`Network error: ${error.message}`);
    }
  }, [userEmail]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  /* Modal Animation */
  useEffect(() => {
    if (showPreviewModal) {
      Animated.parallel([
        Animated.timing(animatedScale, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(animatedOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(animatedScale, { toValue: 0.9, duration: 200, useNativeDriver: true }),
        Animated.timing(animatedOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        if (!showPreviewModal) {
          setSelectedReport(null);
          setSelectedMarkerIndex(null);
          setPhotoEvidence(null);
          setIsUploading(false);
          setIsDeletingImage(false);
        }
      });
    }
  }, [showPreviewModal, animatedScale, animatedOpacity]);

  /* Init Location & BLE, Cleanup */
  useEffect(() => {
    initializeLocation();
    scanForESP32();
    return () => {
      console.log("Cleanup: BLE & Geolocation.");
      bleManager.destroy();
      if (watchIdRef.current) Geolocation.clearWatch(watchIdRef.current);
    };
  }, [bleManager]);

  /* Init Location */
  const initializeLocation = useCallback(async () => {
    setLoading(true);
    setLastError('');
    try {
      let granted = false;
      if (Platform.OS === 'android') {
        granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          { title: "Location Permission", message: "LitterWarden needs access.", buttonPositive: "OK" }
        ) === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const status = await Geolocation.requestAuthorization('whenInUse');
        granted = status === 'granted';
      }
      if (!granted) {
        Alert.alert('Permission Denied', 'Location permission required.');
        setLoading(false);
        setLastError('Permission denied.');
        const storedLocation = await AsyncStorage.getItem('lastKnownLocation');
        if (storedLocation) setLocation(JSON.parse(storedLocation));
        return;
      }
      Geolocation.getCurrentPosition(
        (position) => {
          const currentRegion = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          };
          setLocation(currentRegion);
          AsyncStorage.setItem('lastKnownLocation', JSON.stringify(currentRegion));
          setLoading(false);
          startTracking();
        },
        (error) => {
          console.error('Location Error:', error);
          Alert.alert('Location Error', error.message);
          setLastError(error.message);
          setLoading(false);
          AsyncStorage.getItem('lastKnownLocation').then(storedLocation => {
            if (storedLocation) setLocation(JSON.parse(storedLocation));
          });
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
      );
    } catch (error) {
      console.error('Init Error:', error);
      Alert.alert('Permission Error', error.message);
      setLastError(error.message);
      setLoading(false);
    }
  }, []);

  /* Track User Position */
  const startTracking = useCallback(() => {
    if (watchIdRef.current) Geolocation.clearWatch(watchIdRef.current);
    console.log("Start tracking.");
    watchIdRef.current = Geolocation.watchPosition(
      (position) => {
        const updatedRegion = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: location?.latitudeDelta || 0.01,
          longitudeDelta: location?.longitudeDelta || 0.01,
        };
        setLocation(prev => ({ ...prev, ...updatedRegion }));
        AsyncStorage.setItem('lastKnownLocation', JSON.stringify(updatedRegion));
      },
      (error) => console.warn('Watch Error:', error.message),
      { enableHighAccuracy: true, distanceFilter: 10, interval: 10000, fastestInterval: 5000 }
    );
  }, [location]);

  /* Center Map */
  const centerMapOnUser = useCallback(() => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({ ...location, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 1000);
    } else if (!location) {
      Alert.alert("Location Needed", "Finding your location...");
      initializeLocation();
    }
  }, [location, initializeLocation]);

  /* Scan for ESP32 via BLE */
  const scanForESP32 = useCallback(() => {
    console.log("Scanning for ESP32...");
    setLastError('');
    bleManager.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {
        if (![601, 2].includes(error.errorCode)) {
          console.error("BLE Scan Error:", error);
          setLastError(error.message);
        }
        return;
      }
      if (device && device.name && device.name.includes('ESP32') && !esp32Device) {
        console.log(`Found ESP32: ${device.name}`);
        bleManager.stopDeviceScan();
        setEsp32Device(device);
        connectToESP32(device);
      }
    });
  }, [bleManager, esp32Device, connectToESP32]);

  /* Connect to ESP32 */
  const connectToESP32 = useCallback(async (device) => {
    if (!device) return;
    console.log(`Connecting to ${device.name}...`);
    setLastError('');
    let disconnectSubscription = null;
    try {
      const isConnected = await device.isConnected();
      if (isConnected) {
        console.log(`${device.name} already connected.`);
        setEsp32Connected(true);
        monitorCharacteristic(device);
        return;
      }
      disconnectSubscription = device.onDisconnected((error) => {
        console.warn(`Disconnected: ${error ? error.message : 'Terminated'}`);
        setEsp32Connected(false);
        setEsp32Device(null);
        setLastError("Device disconnected. Scanning again...");
        disconnectSubscription?.remove();
        setTimeout(scanForESP32, 3000);
      });
      const connectedDevice = await device.connect();
      console.log(`Connected to ${connectedDevice.name}. Discovering services...`);
      await connectedDevice.discoverAllServicesAndCharacteristics();
      console.log("Services discovered.");
      setEsp32Connected(true);
      setLastError('');
      monitorCharacteristic(connectedDevice);
    } catch (error) {
      console.error("Connect error:", error);
      setLastError(`Connect failed: ${error.message}. Retrying...`);
      setEsp32Connected(false);
      setEsp32Device(null);
      disconnectSubscription?.remove();
      setTimeout(scanForESP32, 5000);
    }
  }, [bleManager, scanForESP32, monitorCharacteristic]);

  /* Monitor BLE Characteristic */
  const monitorCharacteristic = useCallback((device) => {
    console.log(`Monitor BLE for ${CHARACTERISTIC_UUID_TX}`);
    device.monitorCharacteristicForService(
      SERVICE_UUID, CHARACTERISTIC_UUID_TX,
      (error, characteristic) => {
        if (error) {
          console.error("Monitor Error:", error);
          setLastError(error.message);
          if (error.errorCode === 205 || error.message.includes("disconnect")) {
            // handled by onDisconnected
          } else {
            setEsp32Connected(false);
          }
          return;
        }
        if (characteristic?.value) {
          try {
            const decodedValue = base64.decode(characteristic.value);
            console.log("Data:", decodedValue);
            if (decodedValue.startsWith('Button:')) {
              const count = parseInt(decodedValue.split(':')[1], 10);
              if (!isNaN(count)) {
                if (count === 1) handleReport('low');
                else if (count === 2) handleReport('medium');
                else if (count === 3) handleReport('high');
              } else { console.warn("Parse error:", decodedValue); }
            }
          } catch (decodeError) {
            console.error("Decode error:", decodeError);
            setLastError("Error reading device data.");
          }
        }
      }
    );
  }, [handleReport]);

  /* Geocode Coordinates */
  const getAddressFromCoords = useCallback(async (latitude, longitude) => {
    if (!GOOGLE_MAPS_API_KEY) {
      console.error("Missing API Key!");
      setLastError("Google Maps API Key missing.");
      return { town: 'Config Error', county: 'Config Error', country: 'Config Error' };
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'OK' && data.results?.[0]) {
        let town = 'Unknown', county = 'Unknown', country = 'Unknown';
        data.results[0].address_components.forEach((component) => {
          const types = component.types;
          if (types.includes('locality')) town = component.long_name;
          else if (types.includes('postal_town') && town === 'Unknown') town = component.long_name;
          if (types.includes('administrative_area_level_2')) county = component.long_name;
          else if (types.includes('administrative_area_level_1') && county === 'Unknown') county = component.long_name;
          if (types.includes('country')) country = component.long_name;
        });
        return { town, county, country };
      } else {
        console.warn(`Geocode failed: ${data.status}`, data.error_message || '');
        if (data.status === 'REQUEST_DENIED' || data.error_message?.includes('API key')) {
          setLastError("Geocoding error: API key/billing.");
        } else {
          setLastError(`Geocoding error: ${data.status}`);
        }
        return { town: 'Lookup Failed', county: 'Lookup Failed', country: 'Lookup Failed' };
      }
    } catch (error) {
      console.error("Geocode network error:", error);
      setLastError(`Network error: ${error.message}`);
      return { town: 'Network Error', county: 'Network Error', country: 'Network Error' };
    }
  }, []);

  /* Submit Report */
  const handleReport = useCallback(async (priority) => {
    if (!userEmail) {
      Alert.alert('Error', 'Please log in.');
      setLastError('User not logged in.');
      return;
    }
    if (!SERVER_URL) {
      Alert.alert('Error', 'Server config missing.');
      setLastError('Server URL missing.');
      return;
    }
    let currentLocationToReport = location;
    if (!currentLocationToReport) {
      try {
        const storedLocation = await AsyncStorage.getItem('lastKnownLocation');
        if (storedLocation) currentLocationToReport = JSON.parse(storedLocation);
      } catch (e) { console.error("Error reading location:", e); }
    }
    if (!currentLocationToReport) {
      Alert.alert('Location Not Available', 'Cannot get location.');
      setLastError('Location unavailable.');
      return;
    }
    setLastError('');
    console.log(`Preparing ${priority} report at ${currentLocationToReport.latitude}, ${currentLocationToReport.longitude}`);
    const { town, county, country } = await getAddressFromCoords(currentLocationToReport.latitude, currentLocationToReport.longitude);
    const reportData = {
      latitude: currentLocationToReport.latitude,
      longitude: currentLocationToReport.longitude,
      priority,
      email: userEmail,
      town,
      county,
      country,
    };
    try {
      console.log("Sending report:", reportData);
      const response = await fetch(`${SERVER_URL}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportData),
      });
      const responseData = await response.json();
      if (response.ok && responseData.report) {
        console.log("Report submitted:", responseData);
        Alert.alert('Report Sent', `Litter report (${priority}) submitted.`);
        setReports((prevReports) =>
          [responseData.report, ...prevReports].sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt))
        );
      } else {
        const errorMessage = responseData.error || `Server error ${response.status}`;
        console.error("Server error:", responseData);
        Alert.alert('Error Sending Report', errorMessage);
        setLastError(`Report failed: ${errorMessage}`);
      }
    } catch (error) {
      console.error("Network error:", error);
      Alert.alert('Network Error', `Could not submit report: ${error.message}`);
      setLastError(`Network error: ${error.message}`);
    } finally {
      setShowPriorityModal(false);
    }
  }, [userEmail, location, getAddressFromCoords, fetchReports]);

  /* Manual Report Modal */
  const handleManualReport = useCallback(async () => {
    let currentLocationAvailable = !!location;
    if (!currentLocationAvailable) {
      try {
        const storedLocation = await AsyncStorage.getItem('lastKnownLocation');
        if (storedLocation) currentLocationAvailable = true;
      } catch (e) { }
    }
    if (!currentLocationAvailable) {
      Alert.alert("Location Needed", "Fetching your location...", [
        { text: "OK" },
        { text: "Retry", onPress: initializeLocation },
      ]);
      setLastError('Location needed.');
      initializeLocation();
      return;
    }
    setShowPriorityModal(true);
  }, [location, initializeLocation]);

  /* Image Picker */
  const pickImage = useCallback(() => {
    console.log("Pick image");
    const options = { mediaType: 'photo', quality: 0.7, maxWidth: 1024, maxHeight: 1024 };
    Alert.alert(
      "Select Photo Source",
      "",
      [
        { text: "Camera", onPress: () => launchCamera(options, handleImagePickerResponse) },
        { text: "Library", onPress: () => launchImageLibrary(options, handleImagePickerResponse) },
        { text: "Cancel", style: "cancel" },
      ]
    );
  }, []);

  const handleImagePickerResponse = useCallback((response) => {
    if (response.didCancel) {
      console.log('Cancelled');
    } else if (response.errorCode) {
      console.error('ImagePicker Error: ', response.errorMessage);
      Alert.alert("Image Error", response.errorMessage);
    } else if (response.assets?.[0]) {
      console.log("Image picked:", response.assets[0].uri);
      setPhotoEvidence(response.assets[0]);
    }
  }, []);

  /* Submit Image */
  const submitPhotoEvidence = useCallback(async () => {
    if (!photoEvidence || !selectedReport?._id) {
      Alert.alert("Error", !photoEvidence ? "No photo selected." : "Report missing.");
      return;
    }
    if (!SERVER_URL) {
      Alert.alert("Error", "Server config missing.");
      setLastError("Server URL missing.");
      return;
    }
    console.log(`Submitting photo for report ${selectedReport._id}`);
    setIsUploading(true);
    setLastError('');
    const formData = new FormData();
    formData.append('reportId', selectedReport._id);
    formData.append('image', {
      uri: Platform.OS === 'android'
        ? photoEvidence.uri
        : photoEvidence.uri.replace('file://', ''),
      type: photoEvidence.type || 'image/jpeg',
      name: photoEvidence.fileName || `report_${selectedReport._id}.jpg`,
    });
    try {
      const response = await fetch(`${SERVER_URL}/report/upload`, {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' },
      });
      const responseData = await response.json();
      if (response.ok && responseData.report) {
        Alert.alert("Success", "Photo submitted!");
        const updatedReport = responseData.report;
        setReports(prevReports =>
          prevReports
            .map(r => r._id === updatedReport._id ? updatedReport : r)
            .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt))
        );
        setSelectedReport(updatedReport);
        setPhotoEvidence(null);
      } else {
        const errorMessage = responseData.error || `Upload failed: ${response.status}`;
        console.error("Upload error:", responseData);
        Alert.alert("Upload Failed", errorMessage);
        setLastError(errorMessage);
      }
    } catch (error) {
      console.error("Network error:", error);
      Alert.alert("Upload Failed", `Network error: ${error.message}`);
      setLastError(`Network error: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  }, [photoEvidence, selectedReport, fetchReports]);

  /* Remove Image */
  const handleRemoveImage = useCallback(async () => {
    if (!selectedReport?._id || !selectedReport.imageUrl) {
      Alert.alert("Error", "No image to remove.");
      return;
    }
    if (!SERVER_URL) {
      Alert.alert("Error", "Server config missing.");
      setLastError("Server URL missing.");
      return;
    }
    Alert.alert(
      "Confirm Deletion",
      "Remove photo evidence?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove Image",
          style: "destructive",
          onPress: async () => {
            console.log(`Removing image for ${selectedReport._id}`);
            setIsDeletingImage(true);
            setLastError('');
            try {
              const response = await fetch(`${SERVER_URL}/report/image/${selectedReport._id}`, {
                method: 'DELETE',
                headers: { 'Accept': 'application/json' },
              });
              const responseData = await response.json();
              if (response.ok && responseData.report) {
                Alert.alert("Success", "Photo removed.");
                const updatedReport = responseData.report;
                setReports(prevReports =>
                  prevReports
                    .map(r => r._id === updatedReport._id ? updatedReport : r)
                    .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt))
                );
                setSelectedReport(updatedReport);
                setPhotoEvidence(null);
              } else {
                const errorMessage = responseData.error || `Removal failed: ${response.status}`;
                console.error("Removal error:", responseData);
                Alert.alert("Removal Failed", errorMessage);
                setLastError(`Image removal failed: ${errorMessage}`);
              }
            } catch (error) {
              console.error("Network error:", error);
              Alert.alert("Removal Failed", `Network error: ${error.message}`);
              setLastError(`Network error: ${error.message}`);
            } finally {
              setIsDeletingImage(false);
            }
          },
        },
      ]
    );
  }, [selectedReport, fetchReports]);

  /* Mark Report Clean */
  const markReportClean = useCallback(async () => {
    if (!selectedReport?._id) {
      Alert.alert("Error", "No report selected.");
      return;
    }
    if (!SERVER_URL) {
      Alert.alert("Error", "Server config missing.");
      return;
    }
    console.log(`Marking ${selectedReport._id} as clean.`);
    setIsUploading(true);
    try {
      const response = await fetch(`${SERVER_URL}/report/clean`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: selectedReport._id }),
      });
      const responseData = await response.json();
      if (response.ok) {
        Alert.alert("Success", "Report marked clean.");
        const cleanedReportId = selectedReport._id;
        const currentIndex = userMarkers.findIndex(r => r._id === cleanedReportId);
        const updatedReports = reports.filter(report => report._id !== cleanedReportId);
        setReports(updatedReports);
        const remainingMarkers = updatedReports
          .filter(report => report.email && report.email.toLowerCase() === userEmail.toLowerCase())
          .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));
        setPhotoEvidence(null);
        if (remainingMarkers.length === 0) {
          setShowPreviewModal(false);
        } else {
          const newIndex = Math.min(currentIndex, remainingMarkers.length - 1);
          setSelectedMarkerIndex(newIndex);
          setSelectedReport(remainingMarkers[newIndex]);
        }
      } else {
        throw new Error(responseData.error || `Server error ${response.status}`);
      }
    } catch (error) {
      console.error("Mark clean error:", error);
      Alert.alert("Update Failed", `Could not mark clean: ${error.message}`);
      setLastError(`Failed: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  }, [selectedReport, reports, userEmail, userMarkers, fetchReports]);

  /* Modal Navigation */
  const goToPreviousMarker = useCallback(() => {
    if (userMarkers.length > 0 && selectedMarkerIndex > 0) {
      const newIndex = selectedMarkerIndex - 1;
      setSelectedMarkerIndex(newIndex);
      setSelectedReport(userMarkers[newIndex]);
      setPhotoEvidence(null);
      setIsUploading(false);
      setIsDeletingImage(false);
    }
  }, [userMarkers, selectedMarkerIndex]);

  const goToNextMarker = useCallback(() => {
    if (userMarkers.length > 0 && selectedMarkerIndex !== null && selectedMarkerIndex < userMarkers.length - 1) {
      const newIndex = selectedMarkerIndex + 1;
      setSelectedMarkerIndex(newIndex);
      setSelectedReport(userMarkers[newIndex]);
      setPhotoEvidence(null);
      setIsUploading(false);
      setIsDeletingImage(false);
    }
  }, [userMarkers, selectedMarkerIndex]);

  /* Logout */
  const handleLogout = useCallback(() => {
    signOut(auth)
      .then(() => {
        console.log("Signed out.");
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      })
      .catch((error) => {
        console.error('Logout error: ', error);
        Alert.alert("Logout Error", error.message);
      });
  }, [navigation]);

  /* Render */
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={styles.loadingText}>Initializing...</Text>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={styles.errorText}>Location Not Available</Text>
        <Text style={styles.modalText}>Ensure services enabled & permissions granted.</Text>
        {lastError ? (
          <Text style={[styles.modalText, { marginTop: 5, color: 'orange' }]}>
            Details: {lastError}
          </Text>
        ) : null}
        <TouchableOpacity style={styles.retryButton} onPress={initializeLocation}>
          <Text style={styles.retryButtonText}>Retry Location</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.extraButton, { marginTop: 20, backgroundColor: '#f44336' }]}
          onPress={handleLogout}
        >
          <Text style={styles.extraButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {lastError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText} numberOfLines={2}>
            Error: {lastError}
          </Text>
          <TouchableOpacity onPress={() => setLastError('')} style={styles.errorCloseButton}>
            <Text style={styles.errorCloseButtonText}>×</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={location}
          showsUserLocation={true}
          showsMyLocationButton={false}
          showsCompass={true}
          rotateEnabled={false}
          scrollEnabled={true}
          zoomEnabled={true}
        >
          {userMarkers.map((report) => (
            <Marker
              key={`user-report-${report._id}`}
              coordinate={{ latitude: report.latitude, longitude: report.longitude }}
              image={markerImages[report.priority?.toLowerCase()] || markerImages.low}
              onPress={() => {
                const markerIndex = userMarkers.findIndex((um) => um._id === report._id);
                if (markerIndex !== -1) {
                  setSelectedReport(report);
                  setSelectedMarkerIndex(markerIndex);
                  setShowPreviewModal(true);
                } else {
                  console.warn("Marker not found.");
                }
              }}
            />
          ))}
        </MapView>
        <TouchableOpacity style={styles.refreshButton} onPress={centerMapOnUser}>
          <Text style={styles.refreshButtonText}>Center Map</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSectionContainer}>
        <View style={styles.deviceStatusContainer}>
          <Text style={[styles.deviceStatusText, { color: esp32Connected ? '#4CAF50' : '#f44336' }]}>
            {esp32Connected ? 'Device Connected' : esp32Device ? 'Device Disconnected!' : 'Searching...'}
          </Text>
          {!esp32Connected && (
            <TouchableOpacity
              onPress={scanForESP32}
              style={styles.rescanButton}
              disabled={!!esp32Device && !esp32Connected}
            >
              <Text style={styles.rescanButtonText}>Scan</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.extraButtonContainer}>
          <TouchableOpacity
            style={styles.extraButton}
            onPress={() => navigation.navigate('Dashboard', { username: userEmail })}
          >
            <Text style={styles.extraButtonText}>Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.extraButton} onPress={handleManualReport}>
            <Text style={styles.extraButtonText}>Report</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.extraButton}
            onPress={() => {
              if (userMarkers && userMarkers.length > 0) {
                setSelectedMarkerIndex(0);
                setSelectedReport(userMarkers[0]);
                setShowPreviewModal(true);
              } else {
                Alert.alert('No Reports', 'No active reports.');
                fetchReports();
              }
            }}
          >
            <Text style={styles.extraButtonText}>My Reports ({userMarkers.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.extraButton, { backgroundColor: '#607d8b' }]}
            onPress={handleLogout}
          >
            <Text style={styles.extraButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.emailContainer}>
          <Text style={styles.emailText} numberOfLines={1} ellipsizeMode="tail">
            Logged in as: {userEmail || 'Guest'}
          </Text>
        </View>
      </View>

      {showPriorityModal && (
        <Modal
          transparent
          animationType="fade"
          visible={showPriorityModal}
          onRequestClose={() => setShowPriorityModal(false)}
        >
          <TouchableOpacity
            style={styles.priorityModalOverlay}
            activeOpacity={1}
            onPressOut={() => setShowPriorityModal(false)}
          >
            <View style={styles.priorityModalContainer} onStartShouldSetResponder={() => true}>
              <Text style={styles.priorityModalHeader}>Select Priority</Text>
              <TouchableOpacity
                style={[styles.priorityButton, styles.lowPriority]}
                onPress={() => handleReport('low')}
              >
                <Text style={styles.priorityButtonText}>Low</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.priorityButton, styles.mediumPriority]}
                onPress={() => handleReport('medium')}
              >
                <Text style={styles.priorityButtonText}>Medium</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.priorityButton, styles.highPriority]}
                onPress={() => handleReport('high')}
              >
                <Text style={styles.priorityButtonText}>High</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.priorityButton, styles.cancelButton]}
                onPress={() => setShowPriorityModal(false)}
              >
                <Text style={styles.priorityButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {showPreviewModal && selectedReport && (
        <Modal
          transparent
          animationType="none"
          visible={showPreviewModal}
          onRequestClose={() => setShowPreviewModal(false)}
        >
          <View style={styles.modalOverlay}>
            <Animated.View
              style={[styles.modalContainer, { transform: [{ scale: animatedScale }], opacity: animatedOpacity }]}
            >
              <Text style={styles.modalHeader}>Report Details</Text>
              <ScrollView
                style={{ width: '100%', flexShrink: 1 }}
                contentContainerStyle={{ alignItems: 'center', paddingBottom: 10 }}
                showsVerticalScrollIndicator={true}
              >
                {userMarkers.length > 1 && (
                  <Text style={styles.paginationText}>
                    Report {selectedMarkerIndex + 1} of {userMarkers.length}
                  </Text>
                )}
                <Text style={styles.modalText}>
                  Priority:{' '}
                  <Text
                    style={[
                      styles.modalTextHighlight,
                      styles[`priorityText${selectedReport.priority.charAt(0).toUpperCase() + selectedReport.priority.slice(1)}`],
                    ]}
                  >
                    {selectedReport.priority.toUpperCase()}
                  </Text>
                </Text>
                <Text style={styles.modalText} selectable={true}>
                  Location:{' '}
                  <Text style={styles.modalTextHighlight}>
                    {selectedReport.town &&
                    !['Unknown', 'Config Error', 'Lookup Failed', 'Network Error'].includes(selectedReport.town)
                      ? `${selectedReport.town}, `
                      : ''}
                    {selectedReport.county &&
                    !['Unknown', 'Config Error', 'Lookup Failed', 'Network Error'].includes(selectedReport.county)
                      ? `${selectedReport.county}`
                      : !selectedReport.town ||
                        ['Unknown', 'Config Error', 'Lookup Failed', 'Network Error'].includes(selectedReport.town)
                      ? `(${selectedReport.latitude.toFixed(4)}, ${selectedReport.longitude.toFixed(4)})`
                      : ''}
                    {selectedReport.country &&
                    !['Unknown', 'Config Error', 'Lookup Failed', 'Network Error'].includes(selectedReport.country)
                      ? `, ${selectedReport.country}`
                      : ''}
                    {selectedReport.town === 'Config Error' ||
                    selectedReport.town === 'Lookup Failed' ||
                    selectedReport.town === 'Network Error'
                      ? ` (${selectedReport.town})`
                      : ''}
                  </Text>
                </Text>
                <Text style={styles.modalText}>
                  Coords:{' '}
                  <Text style={styles.modalTextHighlight}>
                    {selectedReport.latitude.toFixed(5)}, {selectedReport.longitude.toFixed(5)}
                  </Text>
                </Text>
                <Text style={styles.modalText}>
                  Status:{' '}
                  <Text style={styles.modalTextHighlight}>
                    {selectedReport.recognizedCategory || 'Pending'}
                  </Text>
                </Text>
                <Text style={styles.modalText}>
                  Reported:{' '}
                  <Text style={styles.modalTextHighlight}>
                    {new Date(selectedReport.reportedAt).toLocaleString()}
                  </Text>
                </Text>
                <View style={styles.evidenceSection}>
                  {photoEvidence ? (
                    <View style={styles.imageFrame}>
                      <Image source={{ uri: photoEvidence.uri }} style={styles.evidencePreview} resizeMode="contain" />
                    </View>
                  ) : selectedReport.imageUrl ? (
                    <View style={styles.imageFrame}>
                      <Image source={{ uri: selectedReport.imageUrl }} style={styles.evidencePreview} resizeMode="contain" />
                    </View>
                  ) : (
                    <View style={styles.noPhotoContainer}>
                      <Text style={styles.noPhotoText}>No Photo</Text>
                    </View>
                  )}
                  {!selectedReport.imageUrl && !photoEvidence && (
                    <TouchableOpacity
                      style={styles.evidenceButton}
                      onPress={pickImage}
                      disabled={isUploading || isDeletingImage}
                    >
                      <Text style={styles.evidenceButtonText}>Add Photo</Text>
                    </TouchableOpacity>
                  )}
                  {selectedReport.imageUrl && !photoEvidence && (
                    <TouchableOpacity
                      style={[styles.modalButton, styles.removeButton, { marginTop: 5 }, isDeletingImage && { opacity: 0.5 }]}
                      onPress={handleRemoveImage}
                      disabled={isDeletingImage || isUploading}
                    >
                      {isDeletingImage ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.modalButtonText}>Remove</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {photoEvidence && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '80%', marginTop: 5 }}>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.submitButton, { flex: 1, marginHorizontal: 5 }, (isUploading || isDeletingImage) && { opacity: 0.5 }]}
                        onPress={submitPhotoEvidence}
                        disabled={isUploading || isDeletingImage}
                      >
                        {isUploading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalButtonText}>Submit</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.changeButton, { flex: 1, marginHorizontal: 5 }, (isUploading || isDeletingImage) && { opacity: 0.5 }]}
                        onPress={pickImage}
                        disabled={isUploading || isDeletingImage}
                      >
                        <Text style={styles.modalButtonText}>Change</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </ScrollView>
              <View style={styles.modalFooterContainer}>
                <View style={styles.modalNavContainer}>
                  <TouchableOpacity
                    style={[styles.navButton, (selectedMarkerIndex === null || selectedMarkerIndex === 0) && styles.navButtonDisabled]}
                    onPress={goToPreviousMarker}
                    disabled={selectedMarkerIndex === null || selectedMarkerIndex === 0}
                  >
                    <Text style={styles.navButtonText}>{'<'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.cleanButton, (isUploading || isDeletingImage) && { opacity: 0.5 }]}
                    onPress={markReportClean}
                    disabled={isUploading || isDeletingImage}
                  >
                    {isUploading || isDeletingImage ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalButtonText}>Mark Clean</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.navButton, (selectedMarkerIndex === null || selectedMarkerIndex >= userMarkers.length - 1) && styles.navButtonDisabled]}
                    onPress={goToNextMarker}
                    disabled={selectedMarkerIndex === null || selectedMarkerIndex >= userMarkers.length - 1}
                  >
                    <Text style={styles.navButtonText}>{'>'}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.closeButton, (isUploading || isDeletingImage) && { opacity: 0.5 }]}
                  onPress={() => setShowPreviewModal(false)}
                  disabled={isUploading || isDeletingImage}
                >
                  <Text style={styles.modalButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </View>
  );
};

export default MapScreen;
