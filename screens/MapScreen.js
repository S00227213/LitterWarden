import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Toast from 'react-native-toast-message';
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
import { REACT_APP_SERVER_URL } from '@env';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, signOut } from '../firebaseConfig';
import { BleManager } from 'react-native-ble-plx';
import base64 from 'react-native-base64';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { storage } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  REACT_APP_AZURE_CV_KEY,
  REACT_APP_AZURE_CV_ENDPOINT,
  REACT_APP_GOOGLE_MAPS_API_KEY,
} from '@env';

import styles from './MapScreenStyles';

import Sound from 'react-native-sound';
Sound.setCategory('Playback');
const successSound = new Sound('success.mp3', Sound.MAIN_BUNDLE, (err) => {
  if (err) console.error('Failed to load success sound', err);
});


const SERVICE_UUID = '62f3511c-bbaa-416c-af55-d51cddce0e9f';
const CHARACTERISTIC_UUID_TX = 'b1a3511c-bbaa-416c-af55-d51cddce0e9f';
const AZURE_CV_KEY = REACT_APP_AZURE_CV_KEY;
const AZURE_CV_ENDPOINT = REACT_APP_AZURE_CV_ENDPOINT;
const GOOGLE_MAPS_API_KEY = REACT_APP_GOOGLE_MAPS_API_KEY;
const SERVER_URL = REACT_APP_SERVER_URL;
const CLUSTER_THRESHOLD = 5;
const CLUSTER_RADIUS_METERS = 150;

console.log("Server URL:", SERVER_URL);
if (!SERVER_URL) {
  Alert.alert("Config Error", "SERVER_URL undefined.");
}
console.log("Google Maps API Key:", GOOGLE_MAPS_API_KEY ? "Loaded" : "MISSING!");
if (!GOOGLE_MAPS_API_KEY) {
  console.error("Missing API Key!");
  Alert.alert("Config Error", "Google Maps API Key missing. Check .env.");
}


function haversineDistance(coords1, coords2) {
  const R = 6371e3;
  const φ1 = coords1.latitude * Math.PI / 180;
  const φ2 = coords2.latitude * Math.PI / 180;
  const Δφ = (coords2.latitude - coords1.latitude) * Math.PI / 180;
  const Δλ = (coords2.longitude - coords1.longitude) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

  const MapScreen = ({ navigation }) => {
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
  const [expandedClusterId, setExpandedClusterId] = useState(null);
    const markerImages = useMemo(() => ({
      low: require('../assets/low-warning.png'),
      medium: require('../assets/medium-warning.png'),
      high: require('../assets/high-warning.png'),
      clean: require('../assets/clean.png'),
    }), []);
    const { width } = Dimensions.get('window');
    const [myReports, setMyReports] = useState([]);
    const [newReportLocation, setNewReportLocation] = useState(null);

    useEffect(() => {
      if (!userEmail) return;
      fetch(`${SERVER_URL}/reports?email=${encodeURIComponent(userEmail)}&includeClean=true`)
        .then(r => r.json())
        .then(data => setMyReports(data))
        .catch(console.error);
    }, [userEmail]);
    const [location, setLocation] = useState(null);
    const [loading, setLoading] = useState(true);


  const bleManager = useRef(new BleManager()).current;
  const [esp32Device, setEsp32Device] = useState(null);
  const [esp32Connected, setEsp32Connected] = useState(false);
  const watchIdRef = useRef(null);
  const mapRef = useRef(null);
  const animatedScale = useRef(new Animated.Value(0.9)).current;
  const animatedOpacity = useRef(new Animated.Value(0)).current;


  const userMarkers = useMemo(() => {
    if (!userEmail) return [];

    return reports
      .filter(report => report.email && report.email.toLowerCase() === userEmail.toLowerCase())
      .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));
  }, [reports, userEmail]);


  const processedMarkers = useMemo(() => {
    const markers = [...userMarkers];
    const clusters = [];
    const singles = [];
    let clusterIdCounter = 0;

    const processedIndices = new Set();

    for (let i = 0; i < markers.length; i++) {
      if (processedIndices.has(i)) continue;

      const currentPoint = markers[i];
      const clusterGroup = [i];
      processedIndices.add(i);


      for (let j = i + 1; j < markers.length; j++) {
        if (processedIndices.has(j)) continue;

        const neighborPoint = markers[j];
        const distance = haversineDistance(
          { latitude: currentPoint.latitude, longitude: currentPoint.longitude },
          { latitude: neighborPoint.latitude, longitude: neighborPoint.longitude }
        );

        if (distance <= CLUSTER_RADIUS_METERS) {
          clusterGroup.push(j);

        }
      }


      if (clusterGroup.length >= CLUSTER_THRESHOLD) {

        const actualClusterMarkers = [];
        let sumLat = 0;
        let sumLng = 0;
        clusterGroup.forEach(index => {
            processedIndices.add(index);
            actualClusterMarkers.push(markers[index]);
            sumLat += markers[index].latitude;
            sumLng += markers[index].longitude;
        });


        if (actualClusterMarkers.length >= CLUSTER_THRESHOLD) {
            clusters.push({
              id: `cluster-${clusterIdCounter++}`,
              center: {
                latitude: sumLat / actualClusterMarkers.length,
                longitude: sumLng / actualClusterMarkers.length,
              },
              count: actualClusterMarkers.length,
              markers: actualClusterMarkers,
            });
        } else {

             clusterGroup.forEach(index => {

                 if (!singles.some(s => s._id === markers[index]._id) && !clusters.some(c => c.markers.some(m => m._id === markers[index]._id)) ) {
                      singles.push(markers[index]);
                 }
             });
        }
      } else {

        singles.push(currentPoint);

      }
    }


    const finalSingles = singles.filter(s => !clusters.some(c => c.markers.some(m => m._id === s._id)));

    return { clusters, singles: finalSingles };
  }, [userMarkers]);



  const handleClusterPress = useCallback((clusterId) => {

    const cluster = processedMarkers.clusters.find(c => c.id === clusterId);
    if (!cluster) return;

    if (expandedClusterId === clusterId) {

      setExpandedClusterId(null);
    } else {

      setExpandedClusterId(clusterId);

      if (mapRef.current && cluster.markers.length > 0) {
        mapRef.current.fitToCoordinates(
          cluster.markers.map(m => ({ latitude: m.latitude, longitude: m.longitude })),
          {
            edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
            animated: true,
          }
        );
      }
    }
  }, [processedMarkers.clusters, expandedClusterId]);


  const handleMarkerPress = useCallback((report) => {
    const markerIndex = userMarkers.findIndex((um) => um._id === report._id);
    if (markerIndex !== -1) {
      setSelectedReport(report);
      setSelectedMarkerIndex(markerIndex);
      setShowPreviewModal(true);
      setExpandedClusterId(null);
    } else {
      console.warn("Marker not found in original userMarkers list.");

       const reportFromState = reports.find(r => r._id === report._id);
       if(reportFromState) {
           setSelectedReport(reportFromState);
           setSelectedMarkerIndex(-1);
           setShowPreviewModal(true);
           setExpandedClusterId(null);
       } else {
           console.error("Report details could not be found.");
       }
    }
  }, [userMarkers, reports]);



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
        setExpandedClusterId(null);
      }
    });
    return () => unsubscribe();
  }, []);


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


  useEffect(() => {
    initializeLocation();
    scanForESP32();
    return () => {
      console.log("Cleanup: BLE & Geolocation.");
      bleManager.destroy();
      if (watchIdRef.current) Geolocation.clearWatch(watchIdRef.current);
    };

  }, [bleManager]);


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
        Alert.alert('Permission Denied', 'Location permission is required to use the map features.');
        setLoading(false);
        setLastError('Location permission denied.');

        const storedLocation = await AsyncStorage.getItem('lastKnownLocation');
        if (storedLocation) {
            setLocation(JSON.parse(storedLocation));
            console.log("Loaded last known location due to permission denial.");
        }
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
        async (error) => {
          console.error('Geolocation getCurrentPosition Error:', error);
          Alert.alert('Location Error', `Could not get current location: ${error.message}`);
          setLastError(`Location error: ${error.message}`);
          setLoading(false);

          const storedLocation = await AsyncStorage.getItem('lastKnownLocation');
          if (storedLocation) {
              setLocation(JSON.parse(storedLocation));
              console.log("Loaded last known location due to fetch error.");
          }
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
      );
    } catch (error) {
      console.error('Location Initialization Error:', error);
      Alert.alert('Permission Error', `Failed to request location permission: ${error.message}`);
      setLastError(`Permission error: ${error.message}`);
      setLoading(false);
    }
  }, [startTracking]);


  const startTracking = useCallback(() => {

    if (watchIdRef.current !== null) {
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      console.log("Cleared previous location watcher.");
    }

    console.log("Starting location tracking...");
    watchIdRef.current = Geolocation.watchPosition(
      (position) => {

        setLocation(prevLocation => ({
          ...prevLocation,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }));


      },
      (error) => {
        console.warn('Location Watch Error:', error.message);


      },

      { enableHighAccuracy: true, distanceFilter: 10, interval: 10000, fastestInterval: 5000 }
    );
  }, []);


  const centerMapOnUser = useCallback(() => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
         latitude: location.latitude,
         longitude: location.longitude,
         latitudeDelta: 0.005,
         longitudeDelta: 0.005,
        }, 1000);
    } else if (!location) {
      Alert.alert("Location Needed", "Trying to find your location...", [{ text: "OK" }]);
      initializeLocation();
    }
  }, [location, initializeLocation]);


  const scanForESP32 = useCallback(() => {

     if (esp32Connected || esp32Device) {
         console.log(`Scan skipped: ${esp32Connected ? 'Already connected' : 'Device pending connection'}`);
         return;
     }

    console.log("Scanning for ESP32...");
    setLastError('');
    bleManager.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {

        if (![601, 2, 5].includes(error.errorCode)) {
          console.error("BLE Scan Error:", error.errorCode, error.message);
          setLastError(`BLE Scan Error: ${error.message}`);
        }


        return;
      }


      if (device && device.name && device.name.includes('ESP32') && !esp32Device) {
        console.log(`Found ESP32: ${device.name} (${device.id})`);
        bleManager.stopDeviceScan();
        console.log("Stopped BLE scan.");
        setEsp32Device(device);
        connectToESP32(device);
      }
    });
  }, [bleManager, esp32Device, esp32Connected, connectToESP32]);


  const connectToESP32 = useCallback(async (device) => {
    if (!device) {
      console.log("Connect attempt skipped: No device provided.");
      return;
    }
    console.log(`Attempting to connect to ${device.name}...`);
    setLastError('');
    let disconnectSubscription = null;

    try {

      const isConnected = await device.isConnected();
      if (isConnected) {
        console.log(`${device.name} is already connected.`);
        setEsp32Connected(true);
        monitorCharacteristic(device);
        return;
      }


      disconnectSubscription = device.onDisconnected((error, disconnectedDevice) => {
        console.warn(`Device ${disconnectedDevice?.name ?? device.name} disconnected. Reason: ${error ? error.message : 'Connection terminated'}`);
        setEsp32Connected(false);
        setEsp32Device(null);
        setLastError("Device disconnected. Scanning again...");
        disconnectSubscription?.remove();

        setTimeout(scanForESP32, 3000);
      });


      const connectedDevice = await device.connect({ timeout: 15000 });
      console.log(`Connected to ${connectedDevice.name}. Discovering services...`);


      await connectedDevice.discoverAllServicesAndCharacteristics();
      console.log("Services and characteristics discovered.");

      setEsp32Connected(true);
      setLastError('');


      monitorCharacteristic(connectedDevice);

    } catch (error) {
      console.error(`Connection to ${device.name} failed:`, error);
      setLastError(`Connect failed: ${error.message}. Retrying scan...`);
      setEsp32Connected(false);
      setEsp32Device(null);
      disconnectSubscription?.remove();

      setTimeout(scanForESP32, 5000);
    }
  }, [bleManager, scanForESP32, monitorCharacteristic]);


  const monitorCharacteristic = useCallback((device) => {
    console.log(`Starting to monitor characteristic ${CHARACTERISTIC_UUID_TX} on ${device.name}`);
    let monitoringSubscription = null;

    monitoringSubscription = device.monitorCharacteristicForService(
      SERVICE_UUID, CHARACTERISTIC_UUID_TX,
      (error, characteristic) => {
        if (error) {
          console.error(`Error monitoring characteristic ${CHARACTERISTIC_UUID_TX}:`, error.errorCode, error.message);
          setLastError(`Monitor Error: ${error.message}`);

          if (error.errorCode === 201 || error.errorCode === 205 || error.message.toLowerCase().includes("disconnect")) {

             console.log("Monitoring stopped due to disconnection or error.");
             setEsp32Connected(false);

          } else {

             setEsp32Connected(false);
          }



          return;
        }


        if (characteristic?.value) {
          try {
            const decodedValue = base64.decode(characteristic.value);
            console.log("Received BLE Data:", decodedValue);


            if (decodedValue.startsWith('Button:')) {
              const count = parseInt(decodedValue.split(':')[1], 10);
              if (!isNaN(count)) {
                console.log(`Button pressed ${count} time(s).`);
                if (count === 1) handleReport('low');
                else if (count === 2) handleReport('medium');
                else if (count === 3) handleReport('high');
              } else {
                console.warn("Could not parse button count from:", decodedValue);
              }
            } else {
              console.log("Received non-button data:", decodedValue);

            }
          } catch (decodeError) {
            console.error("Error decoding base64 BLE data:", decodeError);
            setLastError("Error reading device data.");
          }
        }
      }
    );



  }, [handleReport]);


  const getAddressFromCoords = useCallback(async (latitude, longitude) => {
    if (!GOOGLE_MAPS_API_KEY) {
      console.error("Google Maps API Key is missing for geocoding!");
      setLastError("Geocoding Error: API Key missing.");

      return { town: 'API Key Error', county: 'API Key Error', country: 'API Key Error' };
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.results?.[0]) {
        const components = data.results[0].address_components;
        let town = null, county = null, country = null;


        components.forEach((component) => {
          const types = component.types;
          if (types.includes('locality')) town = component.long_name;
          else if (types.includes('postal_town') && !town) town = component.long_name;
          if (types.includes('administrative_area_level_2')) county = component.long_name;
          else if (types.includes('administrative_area_level_1') && !county) county = component.long_name;
          if (types.includes('country')) country = component.long_name;
        });


        return {
          town: town || 'Unknown',
          county: county || 'Unknown',
          country: country || 'Unknown',
        };

      } else {

        console.warn(`Geocoding failed: ${data.status}`, data.error_message || '');
        let errorReason = `Geocoding Error: ${data.status}`;
        if (data.status === 'REQUEST_DENIED' || data.error_message?.includes('API key')) {
          errorReason = "Geocoding Error: Check API key/billing.";
          setLastError(errorReason);
        } else if (data.status === 'ZERO_RESULTS') {
            errorReason = 'Geocoding: No address found.';

        } else {
            setLastError(errorReason);
        }
        return { town: 'Lookup Failed', county: 'Lookup Failed', country: 'Lookup Failed' };
      }
    } catch (error) {

      console.error("Geocoding network error:", error);
      setLastError(`Geocoding Network Error: ${error.message}`);
      return { town: 'Network Error', county: 'Network Error', country: 'Network Error' };
    }
  }, []);


  const handleReport = useCallback(async (priority) => {
    if (!userEmail) {
      Alert.alert('Login Required', 'You must be logged in to submit a report.');
      setLastError('User not logged in.');
      return;
    }
    if (!SERVER_URL) {
      Alert.alert('Configuration Error', 'The server URL is not configured.');
      setLastError('Server URL missing.');
      return;
    }


    let currentLocationToReport = location;
    if (!currentLocationToReport) {
      try {
        const storedLocationJson = await AsyncStorage.getItem('lastKnownLocation');
        if (storedLocationJson) {
          currentLocationToReport = JSON.parse(storedLocationJson);
          console.log("Using last known location for report:", currentLocationToReport);
        }
      } catch (e) {
        console.error("Error reading last known location from storage:", e);
      }
    }


    if (!currentLocationToReport || typeof currentLocationToReport.latitude !== 'number' || typeof currentLocationToReport.longitude !== 'number') {
      Alert.alert('Location Unavailable', 'Cannot determine your current location to submit the report. Please ensure location services are enabled and try again.');
      setLastError('Location unavailable for reporting.');
      return;
    }


    setLastError('');


    console.log(`Preparing '${priority}' priority report at ${currentLocationToReport.latitude.toFixed(5)}, ${currentLocationToReport.longitude.toFixed(5)}`);


    const { town, county, country } = await getAddressFromCoords(currentLocationToReport.latitude, currentLocationToReport.longitude);


    const reportData = {
      latitude: currentLocationToReport.latitude,
      longitude: currentLocationToReport.longitude,
      priority: priority,
      email: userEmail,
      town: town,
      county: county,
      country: country,

    };

    try {
      console.log("Sending report data:", JSON.stringify(reportData));
      const response = await fetch(`${SERVER_URL}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(reportData),
      });

      const responseData = await response.json();

      if (response.ok && responseData.report) {

        if (successSound) {
            successSound.stop(() => {
                successSound.play((success) => {
                    if (success) { console.log('Played success.mp3'); }
                    else { console.warn('Sound playback failed:', successSound.getError()); }
                });
            });
        } else { console.warn("successSound object not available."); }

        const priorityFormatted = priority.charAt(0).toUpperCase() + priority.slice(1);
        Toast.show({
          type: 'success',
          text1: 'Litter Report Submitted',
          text2: `Priority: ${priorityFormatted}`,
          position: 'bottom',
          visibilityTime: 3000
        });

        setReports((prevReports) => [responseData.report, ...prevReports]);

      } else {
        const errorMessage = responseData.error || `Server error ${response.status}`;
        console.error('Error submitting report:', errorMessage);
        Toast.show({
            type: 'error',
            text1: 'Error Sending Report',
            text2: `Failed: ${errorMessage}`,
            position: 'bottom',
            visibilityTime: 4000
        });
        setLastError(`Report submission failed: ${errorMessage}`);
      }

    } catch (error) {
      console.error("Report Submission Catch Error:", error);
      Toast.show({
          type: 'error',
          text1: 'Submission Failed',
          text2: error.message || 'Could not connect to server.',
          position: 'bottom',
          visibilityTime: 4000
      });
      setLastError(`Report failed: ${error.message}`);
    } finally {
      setShowPriorityModal(false);
    }
  }, [userEmail, location, getAddressFromCoords, fetchReports]);


  const handleManualReport = useCallback(async () => {
    let locationAvailable = !!location;


    if (!locationAvailable) {
      try {
        const storedLocationJson = await AsyncStorage.getItem('lastKnownLocation');
        if (storedLocationJson) {
          const storedLocation = JSON.parse(storedLocationJson);
          if (typeof storedLocation.latitude === 'number' && typeof storedLocation.longitude === 'number') {
            locationAvailable = true;

          }
        }
      } catch (e) {
        console.error("Error checking stored location for manual report:", e);
      }
    }


    if (!locationAvailable) {
      Alert.alert(
        "Location Needed",
        "We need your location to create a report. Trying to get it now...",
        [
          { text: "OK" },
          { text: "Retry Location", onPress: initializeLocation },
        ]
      );
      setLastError('Location needed for manual report.');
      initializeLocation();
      return;
    }


    setShowPriorityModal(true);
    setExpandedClusterId(null);

  }, [location, initializeLocation]);


  const pickImage = useCallback(() => {
    console.log("Opening image picker...");
    const options = {
        mediaType: 'photo',
        quality: 0.7,
        maxWidth: 1024,
        maxHeight: 1024,
        saveToPhotos: false,
    };

    Alert.alert(
      "Select Photo Source",
      "Choose where to get the photo evidence from:",
      [
        { text: "Take Photo (Camera)", onPress: () => launchCamera(options, handleImagePickerResponse) },
        { text: "Choose from Library", onPress: () => launchImageLibrary(options, handleImagePickerResponse) },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true }
    );
  }, [handleImagePickerResponse]);


  const handleImagePickerResponse = useCallback((response) => {
    if (response.didCancel) {
      console.log('User cancelled image picker');
      return;
    }
    if (response.errorCode) {
      console.error('ImagePicker Error: ', response.errorCode, response.errorMessage);
      Alert.alert("Image Picker Error", `Could not select image: ${response.errorMessage}`);
      return;
    }

    if (response.assets && response.assets.length > 0 && response.assets[0].uri) {
      const selectedAsset = response.assets[0];
      console.log("Image selected:", selectedAsset.uri);
      setPhotoEvidence(selectedAsset);
    } else {
        console.warn("Image picker response did not contain a valid asset.", response);
        Alert.alert("Image Error", "Could not get a valid image file.");
    }
  }, []);

  const submitPhotoEvidence = useCallback(async () => {
    if (!photoEvidence || !photoEvidence.uri) {
      Alert.alert("Error", "No photo has been selected to submit.");
      return;
    }
    if (!selectedReport || !selectedReport._id) {
      Alert.alert("Error", "No report is currently selected.");
      return;
    }
    if (!SERVER_URL) {
        Alert.alert("Configuration Error", "SERVER_URL is not defined in the app.");
        setLastError("Frontend Config Error: SERVER_URL missing.");
        return;
    }

    setIsUploading(true);
    setLastError('');
    console.log(`Starting photo evidence submission for report ${selectedReport._id}`);

    try {

      console.log("Fetching image blob from:", photoEvidence.uri);
      const response = await fetch(photoEvidence.uri);
      if (!response.ok) throw new Error(`Failed to fetch local image file: Status ${response.status}`);
      const blob = await response.blob();
      console.log("Image blob fetched. Size:", blob.size, "Type:", blob.type);

      const extension = photoEvidence.fileName?.split('.').pop()?.toLowerCase() || 'jpg';
      const fileType = blob.type && blob.type.startsWith('image/') ? blob.type : (photoEvidence.type || 'image/jpeg');
      const filename = `reports/${selectedReport._id}_${Date.now()}.${extension}`;
      console.log(`Prepared filename: ${filename}, type: ${fileType}`);


      const presignUrlEndpoint = `${SERVER_URL}/s3/presign?filename=${encodeURIComponent(filename)}&type=${encodeURIComponent(fileType)}`;
      console.log("Requesting presigned URL from:", presignUrlEndpoint);
      const presignRes = await fetch(presignUrlEndpoint);

      if (!presignRes.ok) {
        const errorText = await presignRes.text();
        console.error("Fetching Presigned URL FAILED! Status:", presignRes.status, "Response:", errorText);
        let detailedError = `Failed to get S3 presigned URL (Status ${presignRes.status}). Check server logs.`;

        try {
            const jsonError = JSON.parse(errorText);
            if (jsonError.error) detailedError = `Server Error: ${jsonError.error}`;
        } catch (e) {}
        throw new Error(detailedError);
      }

      const presignData = await presignRes.json();
      const { url: presignedUploadUrl } = presignData;
      if (!presignedUploadUrl) throw new Error("Server did not provide a presigned URL.");
      console.log("Got presigned URL.");


      console.log("Uploading image blob to S3...");
      const uploadRes = await fetch(presignedUploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': fileType } });

      if (!uploadRes.ok) {
        const uploadErrorText = await uploadRes.text();
        console.error("S3 Upload FAILED! Status:", uploadRes.status, "Response:", uploadErrorText);
        throw new Error(`Upload to S3 failed (Status ${uploadRes.status}). Check S3 CORS/Permissions.`);
      }
      console.log("S3 Upload successful.");


      const imageUrl = presignedUploadUrl.split('?')[0];
      console.log("Derived S3 Image URL:", imageUrl);


      const updateEndpoint = `${SERVER_URL}/report/image/${selectedReport._id}`;
      console.log("Updating report via PATCH:", updateEndpoint);
      const responseUpdate = await fetch(updateEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ imageUrl: imageUrl }),
      });

      const responseData = await responseUpdate.json();

      if (responseUpdate.ok && responseData.report) {
        console.log("Backend update successful:", responseData.report);
        Alert.alert("Success", "Photo evidence uploaded and saved successfully!");
        const updatedReport = responseData.report;

        setReports(prevReports => prevReports.map(r => (r._id === updatedReport._id ? updatedReport : r)));
        setSelectedReport(updatedReport);
        setPhotoEvidence(null);
      } else {
        const errorMessage = responseData.error || `Backend update failed (Status ${responseUpdate.status})`;
        console.error("Backend update failed:", errorMessage, responseData);
        Alert.alert("Partial Success", `Image uploaded, but failed to update record: ${errorMessage}.`);
      }

    } catch (error) {
      console.error("Photo Evidence Submission FAILED:", error);
      Alert.alert("Upload Failed", `An error occurred: ${error.message}`);
      setLastError(`Upload error: ${error.message}`);
    } finally {
      setIsUploading(false);
      console.log("Photo evidence submission process finished.");
    }
  }, [photoEvidence, selectedReport, SERVER_URL, setReports, setSelectedReport, setPhotoEvidence, setIsUploading, setLastError]);


  const handleRemoveImage = useCallback(async () => {
    if (!selectedReport?._id) {
      Alert.alert("Error", "No report selected.");
      return;
    }
    if (!selectedReport.imageUrl) {
      Alert.alert("No Image", "There is no photo evidence attached to this report to remove.");
      return;
    }
    if (!SERVER_URL) {
      Alert.alert("Configuration Error", "Server URL is not configured.");
      setLastError("Server URL missing.");
      return;
    }


    Alert.alert(
      "Confirm Deletion",
      "Are you sure you want to remove the photo evidence for this report? This will also delete it from storage.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove Photo",
          style: "destructive",
          onPress: async () => {
            console.log(`Requesting image removal for report ID: ${selectedReport._id}`);
            setIsDeletingImage(true);
            setLastError('');

            try {

              const response = await fetch(`${SERVER_URL}/report/image/${selectedReport._id}`, {
                method: 'DELETE',
                headers: { 'Accept': 'application/json' },
              });

              const responseData = await response.json();

              if (response.ok && responseData.report) {

                Alert.alert("Success", "Photo evidence has been removed.");
                const updatedReport = responseData.report;

                setReports(prevReports => prevReports.map(r => (r._id === updatedReport._id ? updatedReport : r)));
                setSelectedReport(updatedReport);
                setPhotoEvidence(null);
              } else {

                const errorMessage = responseData.error || `Removal failed (Status ${response.status})`;
                console.error("Image removal error:", errorMessage, responseData);
                Alert.alert("Removal Failed", `Could not remove photo: ${errorMessage}`);
                setLastError(`Image removal failed: ${errorMessage}`);
              }
            } catch (error) {

              console.error("Network error during image removal:", error);
              Alert.alert("Removal Failed", `A network error occurred: ${error.message}`);
              setLastError(`Network error: ${error.message}`);
            } finally {
              setIsDeletingImage(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, [selectedReport, SERVER_URL]);


  const markReportClean = useCallback(async () => {
    if (!selectedReport?._id) {
      Alert.alert("Error", "No report is currently selected.");
      return;
    }
    if (!SERVER_URL) {
      Alert.alert("Configuration Error", "Server URL is not configured.");
      return;
    }

    console.log(`Marking report ${selectedReport._id} as clean.`);
    setIsUploading(true);
    setLastError('');

    try {

      const response = await fetch(`${SERVER_URL}/report/clean`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ reportId: selectedReport._id }),
      });

      const responseData = await response.json();

      if (response.ok) {

        Alert.alert("Success", "Report has been marked as cleaned.");
        const cleanedReportId = selectedReport._id;
        const currentIndex = userMarkers.findIndex(r => r._id === cleanedReportId);

        setReports(prevReports => prevReports.filter(report => report._id !== cleanedReportId));

        const remainingUserMarkers = userMarkers.filter(report => report._id !== cleanedReportId);
        setPhotoEvidence(null);

        if (remainingUserMarkers.length === 0) {
          setShowPreviewModal(false);
          setSelectedReport(null);
          setSelectedMarkerIndex(null);
        } else {
          const newIndex = Math.min(Math.max(0, currentIndex -1), remainingUserMarkers.length - 1);
          setSelectedMarkerIndex(newIndex);
          setSelectedReport(remainingUserMarkers[newIndex]);
        }
      } else {

        const errorMessage = responseData.error || `Failed to mark clean (Status ${response.status})`;
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error("Error marking report as clean:", error);
      Alert.alert("Update Failed", `Could not mark report as clean: ${error.message}`);
      setLastError(`Failed to mark clean: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  }, [selectedReport, userMarkers, SERVER_URL]);


  const goToPreviousMarker = useCallback(() => {
    if (!userMarkers || userMarkers.length <= 1 || selectedMarkerIndex === null || selectedMarkerIndex <= 0) {

        return;
    }
    const newIndex = selectedMarkerIndex - 1;
    setSelectedMarkerIndex(newIndex);
    setSelectedReport(userMarkers[newIndex]);

    setPhotoEvidence(null);
    setIsUploading(false);
    setIsDeletingImage(false);
  }, [userMarkers, selectedMarkerIndex]);

  const goToNextMarker = useCallback(() => {
    if (!userMarkers || userMarkers.length <= 1 || selectedMarkerIndex === null || selectedMarkerIndex >= userMarkers.length - 1) {

        return;
    }
    const newIndex = selectedMarkerIndex + 1;
    setSelectedMarkerIndex(newIndex);
    setSelectedReport(userMarkers[newIndex]);

    setPhotoEvidence(null);
    setIsUploading(false);
    setIsDeletingImage(false);
  }, [userMarkers, selectedMarkerIndex]);


  const handleLogout = useCallback(() => {
    console.log("Attempting logout...");
    signOut(auth)
      .then(() => {
        console.log("User signed out successfully.");

        setUserEmail('');
        setReports([]);
        setSelectedReport(null);
        setSelectedMarkerIndex(null);
        setPhotoEvidence(null);
        setEsp32Device(null);
        setEsp32Connected(false);
        setLastError('');
        setExpandedClusterId(null);
        AsyncStorage.removeItem('userEmail');

        navigation.reset({ index: 0, routes: [{ name: 'Home' }], });
      })
      .catch((error) => {
        console.error('Logout Error:', error);
        Alert.alert("Logout Failed", `An error occurred during sign out: ${error.message}`);
      });
  }, [navigation, auth]);




  if (loading && !location) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={styles.loadingText}>Initializing Map & Location...</Text>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }


  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={styles.errorText}>Location Not Available</Text>
        <Text style={styles.modalText}>LitterWarden requires location access.</Text>
        <Text style={styles.modalText}>Please ensure services are enabled & permissions granted in settings.</Text>
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
          onPress={(e) => {

              if (e.nativeEvent.action !== 'marker-press') {
                  setExpandedClusterId(null);
              }
          }}

        >

          {processedMarkers.singles.map((report) => (
            <Marker
              key={`single-${report._id}`}
              coordinate={{ latitude: report.latitude, longitude: report.longitude }}
              image={markerImages[report.priority?.toLowerCase()] || markerImages.low}
              anchor={{ x: 0.5, y: 1 }}
              onPress={() => handleMarkerPress(report)}
              stopPropagation={true}
            />
          ))}


          {processedMarkers.clusters.map((cluster) =>

            expandedClusterId === cluster.id ? (
              cluster.markers.map((report) => (
                <Marker
                  key={`expanded-${report._id}`}
                  coordinate={{ latitude: report.latitude, longitude: report.longitude }}
                  image={markerImages[report.priority?.toLowerCase()] || markerImages.low}
                  anchor={{ x: 0.5, y: 1 }}
                  onPress={() => handleMarkerPress(report)}
                  stopPropagation={true}
                  zIndex={10}
                />
              ))
            ) : (

              <Marker
                key={cluster.id}
                coordinate={cluster.center}
                onPress={() => handleClusterPress(cluster.id)}
                stopPropagation={true}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={5}
              >

                <View style={styles.clusterContainer}>
                  <Text style={styles.clusterText}>{cluster.count}</Text>
                </View>
              </Marker>
            )
          )}
        </MapView>


        <TouchableOpacity style={styles.refreshButton} onPress={centerMapOnUser}>
          <Text style={styles.refreshButtonText}>Center</Text>
        </TouchableOpacity>
      </View>


      <View style={styles.bottomSectionContainer}>

      <View style={styles.deviceStatusContainer}>
  <Text style={[styles.deviceStatusText, { color: esp32Connected ? '#4CAF50' : '#f44336' }]}>
    {esp32Connected
      ? 'Device Connected'
      : esp32Device
        ? 'Device Disconnected!'
        : 'Searching for Device...'}
  </Text>

  { !esp32Connected && (
    <TouchableOpacity
      onPress={scanForESP32}
      style={styles.scanButton}
      disabled={!!esp32Device && !esp32Connected}
    >
      <Text style={styles.scanButtonText}>Scan</Text>
    </TouchableOpacity>
  )}
</View>


        <View style={styles.extraButtonContainer}>
  <TouchableOpacity
    style={[styles.extraButton, styles.dashboardButton]}
    onPress={() => navigation.navigate('Dashboard', { username: userEmail })}
  >
    <Text style={styles.extraButtonText}>Dashboard</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[styles.extraButton, styles.reportButton]}
    onPress={handleManualReport}
  >
    <Text style={styles.extraButtonText}>Report</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[styles.extraButton, styles.myReportsButton]}
    onPress={() => {
      if (userMarkers && userMarkers.length > 0) {
        setSelectedMarkerIndex(0);
        setSelectedReport(userMarkers[0]);
        setShowPreviewModal(true);
        setExpandedClusterId(null);
      } else {
        Alert.alert('No Reports', 'You have no active litter reports.');
        fetchReports();
      }
    }}
  >
    <Text style={styles.extraButtonText}>My Reports ({userMarkers.length})</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[styles.extraButton, styles.logoutButton]}
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
              <Text style={styles.priorityModalHeader}>Select Report Priority</Text>
              <TouchableOpacity style={[styles.priorityButton, styles.lowPriority]} onPress={() => handleReport('low')}>
                <Text style={styles.priorityButtonText}>Low Priority</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.priorityButton, styles.mediumPriority]} onPress={() => handleReport('medium')}>
                <Text style={styles.priorityButtonText}>Medium Priority</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.priorityButton, styles.highPriority]} onPress={() => handleReport('high')}>
                <Text style={styles.priorityButtonText}>High Priority</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.priorityButton, styles.cancelButton]} onPress={() => setShowPriorityModal(false)}>
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
              style={[
                styles.modalContainer,
                { transform: [{ scale: animatedScale }], opacity: animatedOpacity }
              ]}
            >

              <TouchableOpacity
                style={styles.modalTopCloseButton}
                onPress={() => setShowPreviewModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                disabled={isUploading || isDeletingImage}
              >
                <Text style={styles.modalTopCloseButtonText}>×</Text>
              </TouchableOpacity>


              <Text style={styles.modalHeader}>Report Details</Text>

              <ScrollView
                style={{ width: '100%', flexShrink: 1 }}
                contentContainerStyle={{ alignItems: 'center', paddingBottom: 10 }}
                showsVerticalScrollIndicator={true}
              >

                {userMarkers.length > 1 && selectedMarkerIndex !== null && (
                  <Text style={styles.paginationText}>
                    Report {selectedMarkerIndex + 1} of {userMarkers.length}
                  </Text>
                )}


                <Text style={styles.modalText}>
                  Priority:{' '}
                  <Text style={[ styles.modalTextHighlight, styles[`priorityText${selectedReport.priority.charAt(0).toUpperCase() + selectedReport.priority.slice(1)}`], ]}>
                    {selectedReport.priority.toUpperCase()}
                  </Text>
                </Text>
                <Text style={styles.modalText} selectable={true}>
                  Location:{' '}
                  <Text style={styles.modalTextHighlight}>
                    {(selectedReport.town && !['Unknown', 'API Key Error', 'Lookup Failed', 'Network Error'].includes(selectedReport.town)) ? `${selectedReport.town}, ` : ''}
                    {(selectedReport.county && !['Unknown', 'API Key Error', 'Lookup Failed', 'Network Error'].includes(selectedReport.county)) ? `${selectedReport.county}` : (!selectedReport.town || ['Unknown', 'API Key Error', 'Lookup Failed', 'Network Error'].includes(selectedReport.town)) ? `(${selectedReport.latitude.toFixed(4)}, ${selectedReport.longitude.toFixed(4)})` : ''}
                    {(selectedReport.country && !['Unknown', 'API Key Error', 'Lookup Failed', 'Network Error'].includes(selectedReport.country)) ? `, ${selectedReport.country}` : ''}
                    {(selectedReport.town === 'API Key Error' || selectedReport.town === 'Lookup Failed' || selectedReport.town === 'Network Error') ? ` (${selectedReport.town})` : ''}
                  </Text>
                </Text>
                 <Text style={styles.modalText}>
                  Coords:{' '}
                  <Text style={styles.modalTextHighlight}>
                    {selectedReport.latitude.toFixed(5)}, {selectedReport.longitude.toFixed(5)}
                  </Text>
                </Text>
                 {selectedReport.recognizedCategory && (
                    <Text style={styles.modalText}>
                    Status:{' '}
                    <Text style={styles.modalTextHighlight}>
                        {selectedReport.recognizedCategory}
                    </Text>
                    </Text>
                )}
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
                      <Text style={styles.noPhotoText}>No Photo Evidence</Text>
                    </View>
                  )}


                  {!selectedReport.imageUrl && !photoEvidence && (
                    <TouchableOpacity style={styles.evidenceButton} onPress={pickImage} disabled={isUploading || isDeletingImage}>
                      <Text style={styles.evidenceButtonText}>Add Photo Evidence</Text>
                    </TouchableOpacity>
                  )}

                  {selectedReport.imageUrl && !photoEvidence && (
                    <TouchableOpacity
                      style={[styles.modalButton, styles.removeButton, { marginTop: 5 }, isDeletingImage && { opacity: 0.5 }]}
                      onPress={handleRemoveImage}
                      disabled={isDeletingImage || isUploading}
                    >
                      {isDeletingImage ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalButtonText}>Remove Photo</Text>}
                    </TouchableOpacity>
                  )}

                  {photoEvidence && (
                    <View style={styles.photoActionContainer}>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.submitButton, { flex: 1, marginHorizontal: 5 }, (isUploading || isDeletingImage) && { opacity: 0.5 }]}
                        onPress={submitPhotoEvidence}
                        disabled={isUploading || isDeletingImage}
                      >
                        {isUploading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalButtonText}>Submit Photo</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.changeButton, { flex: 1, marginHorizontal: 5 }, (isUploading || isDeletingImage) && { opacity: 0.5 }]}
                        onPress={pickImage}
                        disabled={isUploading || isDeletingImage}
                      >
                        <Text style={styles.modalButtonText}>Change Photo</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </ScrollView>


              <View style={styles.modalFooterContainer}>
                 <View style={styles.modalNavContainer}>

                    <TouchableOpacity
                        style={[styles.navButton, (selectedMarkerIndex === null || selectedMarkerIndex === 0 || userMarkers.length <= 1) && styles.navButtonDisabled]}
                        onPress={goToPreviousMarker}
                        disabled={selectedMarkerIndex === null || selectedMarkerIndex === 0 || userMarkers.length <= 1}
                    >
                        <Text style={styles.navButtonText}>Prev</Text>
                    </TouchableOpacity>


                    <TouchableOpacity
                        style={[styles.cleanButton, (isUploading || isDeletingImage) && { opacity: 0.5 }]}
                        onPress={markReportClean}
                        disabled={isUploading || isDeletingImage}
                    >
                        {isUploading || isDeletingImage ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalButtonText}>Mark Cleaned</Text>}
                    </TouchableOpacity>


                    <TouchableOpacity
                        style={[styles.navButton, (selectedMarkerIndex === null || selectedMarkerIndex >= userMarkers.length - 1 || userMarkers.length <= 1) && styles.navButtonDisabled]}
                        onPress={goToNextMarker}
                        disabled={selectedMarkerIndex === null || selectedMarkerIndex >= userMarkers.length - 1 || userMarkers.length <= 1}
                    >
                        <Text style={styles.navButtonText}>Next</Text>
                    </TouchableOpacity>
                 </View>


              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </View>
  );
};

export default MapScreen;