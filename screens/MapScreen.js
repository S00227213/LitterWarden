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
  Modal,
  Image,
  Animated
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from 'react-native-geolocation-service';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, signOut } from '../firebaseConfig';
import { BleManager } from 'react-native-ble-plx';
import base64 from 'react-native-base64';

const SERVICE_UUID = '62f3511c-bbaa-416c-af55-d51cddce0e9f';
const CHARACTERISTIC_UUID_TX = 'b1a3511c-bbaa-416c-af55-d51cddce0e9f';
const SERVER_URL = 'https://57b8-2001-bb6-6e5b-ea00-7166-2b5-e64a-5cbc.ngrok-free.app';
const GOOGLE_MAPS_API_KEY = 'AIzaSyA3fi_S6XwEzXLx5rrbFdktku7Ii8tXW58';

const MapScreen = ({ navigation }) => {
  const { width } = Dimensions.get('window');

  const markerImages = {
    low: require('../assets/low-warning.png'),
    medium: require('../assets/medium-warning.png'),
    high: require('../assets/high-warning.png'),
    clean: require('../assets/clean.png'),
    manual: require('../assets/low-warning.png'),
  };

  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [userEmail, setUserEmail] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedMarkerIndex, setSelectedMarkerIndex] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [photoEvidence, setPhotoEvidence] = useState(null);
  const [lastError, setLastError] = useState('');

  const bleManager = useRef(new BleManager()).current;
  const [esp32Device, setEsp32Device] = useState(null);
  const [esp32Connected, setEsp32Connected] = useState(false);
  const watchIdRef = useRef(null);
  const mapRef = useRef(null);

  const [modalVisible, setModalVisible] = useState(false);
  const animatedScale = useRef(new Animated.Value(0.9)).current;
  const animatedOpacity = useRef(new Animated.Value(0)).current;

  const userMarkers = reports.filter(
    (report) =>
      report.email &&
      userEmail &&
      report.email.toLowerCase() === userEmail.toLowerCase()
  );

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUserEmail(user.email);
        try {
          await AsyncStorage.setItem('userEmail', user.email);
        } catch (error) {
          console.error('Error storing user email:', error);
        }
      } else {
        setUserEmail('');
        await AsyncStorage.removeItem('userEmail');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (showPreviewModal) {
      setModalVisible(true);
      Animated.parallel([
        Animated.timing(animatedScale, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(animatedOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(animatedScale, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(animatedOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => setModalVisible(false));
    }
  }, [showPreviewModal]);

  const initializeLocation = async () => {
    setLoading(true);
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
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
          setLocation(currentRegion);
          AsyncStorage.setItem('lastKnownLocation', JSON.stringify(currentRegion));
          setLoading(false);
          if (mapRef.current) {
            mapRef.current.animateToRegion(currentRegion, 1000);
          }
          startTracking();
        },
        (error) => {
          Alert.alert('Location Error', error.message);
          setLoading(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    } catch (error) {
      Alert.alert('Permission Error', error.message);
      setLoading(false);
    }
  };

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
        setLocation(updatedRegion);
        AsyncStorage.setItem('lastKnownLocation', JSON.stringify(updatedRegion));
        if (mapRef.current) {
          mapRef.current.animateToRegion(updatedRegion, 1000);
        }
      },
      (error) => {
        Alert.alert('Location Error', error.message);
      },
      { enableHighAccuracy: true, distanceFilter: 50, interval: 5000, fastestInterval: 3000 }
    );
  };

  const centerMapOnUser = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion(location, 1000);
    }
  };

  const fetchReports = async () => {
    if (!userEmail) return;
    try {
      const response = await fetch(`${SERVER_URL}/reports?email=${encodeURIComponent(userEmail)}`, {
        method: 'GET',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      setReports(data);
    } catch (error) {
      console.error('Fetch Reports Error:', error);
      setLastError(`Fetch error: ${error.message}`);
    }
  };

  const scanForESP32 = () => {
    bleManager.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {
        console.error('BLE Scan error:', error);
        return;
      }
      if (device && device.name && device.name.includes('ESP32')) {
        bleManager.stopDeviceScan();
        setEsp32Device(device);
        connectToESP32(device);
      }
    });
  };

  const connectToESP32 = async (device) => {
    try {
      const connectedDevice = await device.connect();
      await connectedDevice.discoverAllServicesAndCharacteristics();
      setEsp32Connected(true);
      connectedDevice.monitorCharacteristicForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID_TX,
        (error, characteristic) => {
          if (error) {
            console.error('BLE Notification error:', error);
            return;
          }
          if (characteristic?.value) {
            const decodedValue = base64.decode(characteristic.value);
            if (decodedValue.startsWith('Button:')) {
              const count = parseInt(decodedValue.split(':')[1], 10);
              if (count === 1) handleReport('low');
              else if (count === 2) handleReport('medium');
              else if (count === 3) handleReport('high');
            }
          }
        }
      );
    } catch (error) {
      console.error('Error connecting to ESP32:', error);
      setEsp32Connected(false);
    }
  };

  const handleReport = async (priority) => {
    let emailToUse = userEmail;
    if (!emailToUse) {
      try {
        emailToUse = await AsyncStorage.getItem('userEmail');
      } catch (error) {
        console.error('Error retrieving user email from storage:', error);
      }
    }
    if (!emailToUse) {
      Alert.alert('User Not Recognized', 'Please log in again.');
      return;
    }
    let currentLocation = location;
    if (!currentLocation) {
      try {
        const storedLocation = await AsyncStorage.getItem('lastKnownLocation');
        if (storedLocation) currentLocation = JSON.parse(storedLocation);
      } catch (e) {
        console.error(e);
      }
    }
    if (!currentLocation) {
      Alert.alert(
        'Location Not Available',
        'Fetching your current location. Please try again shortly.'
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
        setReports((prevReports) => [...prevReports, newReport]);
      } else {
        Alert.alert('Error', 'Failed to send report.');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not connect to the database.');
    }
  };

  const getAddressFromCoords = async (latitude, longitude) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const bestResult =
          data.results.find((result) =>
            result.address_components.some(
              (comp) =>
                comp.types.includes('locality') ||
                comp.types.includes('postal_town')
            )
          ) || data.results[0];
        let town = 'Unknown',
          county = 'Unknown',
          country = 'Unknown';
        bestResult.address_components.forEach((component) => {
          if (
            component.types.includes('locality') ||
            component.types.includes('postal_town')
          ) {
            town = component.long_name;
          }
          if (component.types.includes('administrative_area_level_2')) {
            county = component.long_name;
          }
          if (
            component.types.includes('administrative_area_level_1') &&
            county === 'Unknown'
          ) {
            county = component.long_name;
          }
          if (component.types.includes('country')) {
            country = component.long_name;
          }
        });
        return { town, county, country };
      }
    } catch (error) {
      console.error(error);
    }
    return { town: 'Unknown', county: 'Unknown', country: 'Unknown' };
  };

  const handleManualReport = async () => {
    await handleReport('manual');
  };

  useFocusEffect(
    useCallback(() => {
      const onFocus = async () => {
        await initializeLocation();
        if (userEmail) fetchReports();
        scanForESP32();
      };
      onFocus();
      return () => {
        if (watchIdRef.current) Geolocation.clearWatch(watchIdRef.current);
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

  const markersCount = {};
  const markersWithOffset = reports
    .filter(
      (report) =>
        report.email &&
        userEmail &&
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

      {lastError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {lastError}</Text>
        </View>
      ) : null}

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={location}
          showsUserLocation
          showsMyLocationButton
          zoomEnabled
          showsCompass
          rotateEnabled={false}
        >
          {markersWithOffset.map((report, index) => (
            <Marker
              key={index}
              coordinate={{ latitude: report.offsetLat, longitude: report.offsetLng }}
              title={`Litter Report - ${report.priority}`}
              anchor={{ x: 0.5, y: 0.5 }}
              image={markerImages[report.priority]}
            />
          ))}
        </MapView>

        <TouchableOpacity style={styles.refreshButton} onPress={centerMapOnUser}>
          <Text style={styles.refreshButtonText}>Center Map</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.deviceStatusContainer}>
        <Text
          style={[
            styles.deviceStatusText,
            { color: esp32Connected ? '#00FF00' : '#FF0000' },
          ]}
        >
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
          onPress={() => {
            signOut(auth)
              .then(() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] }))
              .catch((error) => console.error('Error signing out: ', error));
          }}
        >
          <Text style={styles.extraButtonText}>Logout</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.extraButton, styles.manualButton]}
          onPress={handleManualReport}
        >
          <Text style={styles.extraButtonText}>Report Manually</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.extraButton}
          onPress={() => {
            if (userMarkers.length > 0) {
              setSelectedMarkerIndex(0);
              setSelectedReport(userMarkers[0]);
              setShowPreviewModal(true);
            } else {
              Alert.alert('No Litter Reports', 'There are no litter reports to preview.');
            }
          }}
        >
          <Text style={styles.extraButtonText}>View Reports</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.emailContainer}>
        <Text style={styles.emailText}>{userEmail || 'Guest'}</Text>
      </View>

      {modalVisible && (
        <Modal transparent animationType="none">
          <View style={styles.modalOverlay}>
            <Animated.View
              style={[
                styles.modalContainer,
                { transform: [{ scale: animatedScale }], opacity: animatedOpacity },
              ]}
            >
              <Text style={styles.modalHeader}>Litter Report Preview</Text>
              {selectedReport && (
                <>
                  <Text style={styles.modalText}>
                    Priority:{' '}
                    <Text style={styles.modalTextHighlight}>{selectedReport.priority}</Text>
                  </Text>
                  <Text style={styles.modalText}>
                    Location:{' '}
                    <Text style={styles.modalTextHighlight}>
                      {selectedReport.latitude.toFixed(4)}, {selectedReport.longitude.toFixed(4)}
                    </Text>
                  </Text>
                  <Text style={styles.modalText}>
                    Recognized:{' '}
                    <Text style={styles.modalTextHighlight}>
                      {selectedReport.evidence ? selectedReport.evidence : 'Not available'}
                    </Text>
                  </Text>

                  {selectedReport.imageUrl && (
                    <View style={styles.imageFrame}>
                      <Image
                        source={{ uri: selectedReport.imageUrl }}
                        style={[styles.evidencePreview, { width: 275, height: 275 }]}
                      />
                    </View>
                  )}

                  {!selectedReport.imageUrl && (
                    <TouchableOpacity
                      style={styles.evidenceButton}
                      onPress={() => {
                        Alert.alert('Not Implemented', 'Photo picking not implemented.');
                      }}
                    >
                      <Text style={styles.evidenceButtonText}>
                        {photoEvidence ? 'Change Photo Evidence' : 'Add Photo Evidence'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {!selectedReport.imageUrl && photoEvidence && (
                    <>
                      <View style={styles.imageFrame}>
                        <Image
                          source={{ uri: photoEvidence.uri }}
                          style={[styles.evidencePreview, { width: 275, height: 275 }]}
                        />
                      </View>
                      <TouchableOpacity
                        style={[styles.modalButton, { backgroundColor: '#4CAF50' }]}
                        onPress={() => {
                          Alert.alert('Not Implemented', 'Submit photo evidence not implemented.');
                        }}
                      >
                        <Text style={styles.modalButtonText}>Submit Photo Evidence</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {selectedReport.imageUrl && (
                    <TouchableOpacity
                      style={[styles.modalButton, styles.removeButton]}
                      onPress={() =>
                        setSelectedReport((prev) => ({ ...prev, imageUrl: null }))
                      }
                    >
                      <Text style={styles.modalButtonText}>Remove Photo Evidence</Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.modalNavContainer}>
                    <TouchableOpacity
                      style={[styles.navButton, { marginRight: 8 }]}
                      onPress={() => {
                        if (selectedMarkerIndex > 0) {
                          const newIndex = selectedMarkerIndex - 1;
                          setSelectedMarkerIndex(newIndex);
                          setSelectedReport(userMarkers[newIndex]);
                          setPhotoEvidence(null);
                        }
                      }}
                    >
                      <Text style={styles.navButtonText}>Previous</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.navButton}
                      onPress={() => {
                        if (userMarkers && selectedMarkerIndex < userMarkers.length - 1) {
                          const newIndex = selectedMarkerIndex + 1;
                          setSelectedMarkerIndex(newIndex);
                          setSelectedReport(userMarkers[newIndex]);
                          setPhotoEvidence(null);
                        }
                      }}
                    >
                      <Text style={styles.navButtonText}>Next</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[styles.modalButton, { marginTop: 10 }]}
                    onPress={async () => {
                      try {
                        const formData = new FormData();
                        if (photoEvidence) {
                          formData.append('photo', {
                            uri: photoEvidence.uri,
                            type: photoEvidence.type,
                            name: photoEvidence.fileName || 'photo.jpg',
                          });
                        }
                        const response = await fetch(
                          `${SERVER_URL}/report/${selectedReport._id}/clear`,
                          {
                            method: 'PUT',
                            headers: { 'Content-Type': 'multipart/form-data' },
                            body: formData,
                          }
                        );
                        if (!response.ok) {
                          const errText = await response.text();
                          Alert.alert(
                            'Error',
                            `Failed to mark litter as clean. Server response:\n${errText}`
                          );
                          return;
                        }
                        Alert.alert(
                          'Litter Cleared',
                          'This litter report has been marked as cleaned.'
                        );
                        setReports((prev) =>
                          prev.filter((r) => r._id !== selectedReport._id)
                        );
                        setShowPreviewModal(false);
                        setSelectedReport(null);
                        setSelectedMarkerIndex(null);
                        setPhotoEvidence(null);
                      } catch (error) {
                        Alert.alert(
                          'Error',
                          `Could not clear litter due to an error:\n${error.message}`
                        );
                      }
                    }}
                  >
                    <Text style={styles.modalButtonText}>Mark as Clean</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#555', marginTop: 10 }]}
                onPress={() => {
                  setShowPreviewModal(false);
                  setSelectedReport(null);
                  setSelectedMarkerIndex(null);
                  setPhotoEvidence(null);
                }}
              >
                <Text style={styles.modalButtonText}>Close</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>
      )}
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
  errorContainer: {
    backgroundColor: 'rgba(255,0,0,0.2)',
    padding: 10,
    marginBottom: 10,
    borderRadius: 8,
  },
  errorText: {
    color: 'red',
    fontSize: 14,
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
    color: '#fff',
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
  manualButton: {
    backgroundColor: '#0077FF',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#2C2C2C',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    alignItems: 'center',
    elevation: 10,
  },
  modalHeader: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
    color: '#EAEAEA',
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    marginBottom: 6,
    textAlign: 'center',
    color: '#B5B5B5',
  },
  modalTextHighlight: {
    color: '#fff',
    fontWeight: '600',
  },
  evidenceButton: {
    backgroundColor: '#0077FF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginVertical: 10,
  },
  evidenceButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  imageFrame: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 12,
    padding: 5,
    backgroundColor: '#1A1A1A',
    marginBottom: 12,
    marginTop: 4,
  },
  evidencePreview: {
    borderRadius: 12,
  },
  modalNavContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
  },
  navButton: {
    backgroundColor: '#0077FF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  navButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  modalButton: {
    backgroundColor: '#0077FF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginVertical: 5,
  },
  removeButton: {
    backgroundColor: '#DD2C00',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  customMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerImage: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
  },
});

export default MapScreen;
