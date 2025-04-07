import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Modal,
  Alert,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { REACT_APP_GOOGLE_MAPS_API_KEY, REACT_APP_SERVER_URL } from '@env';
import styles from './DashboardScreenStyles';

if (!REACT_APP_GOOGLE_MAPS_API_KEY) {
  console.warn("API key missing.");
}
if (!REACT_APP_SERVER_URL) {
  console.warn("Server URL missing.");
}


const Dashboard = ({ navigation }) => {
  const SERVER_URL =
    REACT_APP_SERVER_URL || 'https://f547-86-40-74-78.ngrok-free.app';

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const itemsPerPage = 9;
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("[Dashboard] Authenticated:", user.email);
        setUserEmail(user.email);
      } else {
        console.log("[Dashboard] No user.");
        setUserEmail('');
        setReports([]);
        setCurrentPage(0);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    console.log("[Dashboard] User email:", userEmail);
  }, [userEmail]);

  const fetchUserReports = async () => {
    if (!userEmail) {
      console.log("[Dashboard] No userEmail; skipping fetch.");
      setLoading(false);
      setReports([]);
      return;
    }
    if (!SERVER_URL || SERVER_URL === 'https://backup-default-url.example.com') {
      console.error("[Dashboard] Server URL not configured.");
      Alert.alert('Configuration Error', 'Server URL not configured.');
      setLoading(false);
      return;
    }
    console.log("[Dashboard] Fetching reports for:", userEmail);
    setLoading(true);
    try {
      const url = `${SERVER_URL}/reports?email=${encodeURIComponent(userEmail)}&includeClean=true`;
      console.log("[Dashboard] Fetch URL:", url);
      const response = await fetch(url);
      console.log("[Dashboard] HTTP status:", response.status);
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const data = await response.json();
      const sortedData = (Array.isArray(data) ? data : []).sort(
        (a, b) => new Date(b.reportedAt) - new Date(a.reportedAt)
      );
      setReports(sortedData);
      setCurrentPage(0);
    } catch (error) {
      console.error("[Dashboard] Fetch error:", error);
      Alert.alert('Error', `Unable to fetch your reports. ${error.message}`);
      setReports([]);
    } finally {
      setLoading(false);
      console.log("[Dashboard] Fetch complete.");
    }
  };

  const deleteReport = async (reportId) => {
    if (!SERVER_URL || SERVER_URL === 'https://backup-default-url.example.com') {
      console.error("[Dashboard] Delete failed: Server URL not configured.");
      Alert.alert('Configuration Error', 'Server URL not configured.');
      return;
    }
    Alert.alert(
      "Delete Report",
      "Are you sure you want to permanently delete this report?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: async () => {
            setLoading(true);
            try {
              const url = `${SERVER_URL}/report/${reportId}`;
              console.log("[Dashboard] Delete URL:", url);
              const response = await fetch(url, { method: 'DELETE' });

              if (response.ok) {
                setReports((prev) => {
                  const updated = prev.filter((r) => r._id !== reportId);
                  const total = Math.ceil(updated.length / itemsPerPage);
                  if (currentPage >= total && total > 0) {
                    setCurrentPage(total - 1);
                  } else if (updated.length === 0) {
                    setCurrentPage(0);
                  }
                  return updated;
                });
                Alert.alert('Success', 'Report deleted successfully.');
              } else {
                const errorData = await response.text();
                console.error("[Dashboard] Delete failed:", response.status, errorData);
                Alert.alert('Error', `Delete failed. Status ${response.status}. ${errorData}`);
              }
            } catch (error) {
              console.error("[Dashboard] Delete error:", error);
              Alert.alert('Error', `Could not delete report. ${error.message}`);
            } finally {
              setLoading(false);
            }
          },
          style: "destructive",
        },
      ]
    );
  };

  useFocusEffect(
    React.useCallback(() => {
      console.log("[Dashboard] Focus triggered.");
      if (userEmail) {
        fetchUserReports();
      } else {
        setReports([]);
        setCurrentPage(0);
        setLoading(false);
      }
    }, [userEmail])
  );

  const currentReports = reports.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );
  const totalPages = Math.ceil(reports.length / itemsPerPage);

  const isValidLatLng = (lat, lon) => {
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    return (
      !Number.isNaN(parsedLat) &&
      !Number.isNaN(parsedLon) &&
      Math.abs(parsedLat) <= 90 &&
      Math.abs(parsedLon) <= 180
    );
  };

  const renderReport = ({ item }) => {
    const lat = parseFloat(item.latitude);
    const lon = parseFloat(item.longitude);
    const validCoordinates = isValidLatLng(lat, lon);
    const initialRegion = validCoordinates
      ? { latitude: lat, longitude: lon, latitudeDelta: 0.01, longitudeDelta: 0.01 }
      : null;

    return (
      <View style={styles.reportCard}>
        <View style={styles.reportRow}>
          <View style={styles.reportTextContainer}>
            <Text style={styles.row} numberOfLines={1} ellipsizeMode="tail">
              <Text style={styles.label}>Town: </Text>
              <Text style={styles.value}>
                {item.town && !item.town.includes('Error') ? item.town : 'Unknown'}
              </Text>
            </Text>
            <Text style={styles.row} numberOfLines={1} ellipsizeMode="tail">
              <Text style={styles.label}>County: </Text>
              <Text style={styles.value}>
                {item.county && !item.county.includes('Error') ? item.county : 'Unknown'}
              </Text>
            </Text>
            <Text style={styles.row} numberOfLines={1} ellipsizeMode="tail">
              <Text style={styles.label}>Country: </Text>
              <Text style={styles.value}>
                {item.country && !item.country.includes('Error') ? item.country : 'Unknown'}
              </Text>
            </Text>
            <Text style={styles.row} numberOfLines={1} ellipsizeMode="tail">
              <Text style={styles.label}>Email: </Text>
              <Text style={styles.value}>{item.email}</Text>
            </Text>
            <Text style={styles.row} numberOfLines={1} ellipsizeMode="tail">
              <Text style={styles.label}>Priority: </Text>
              <Text style={styles.value}>{item.priority || 'N/A'}</Text>
            </Text>
             {item.isClean && (
                 <Text style={styles.row} numberOfLines={1} ellipsizeMode="tail">
                   <Text style={[styles.label, { color: '#4CAF50' }]}>Status: </Text>
                   <Text style={[styles.value, { color: '#4CAF50' }]}>Cleaned</Text>
                 </Text>
             )}
            <Text style={styles.row} numberOfLines={1} ellipsizeMode="tail">
              <Text style={styles.label}>Reported: </Text>
              <Text style={styles.value}>
                {new Date(item.reportedAt).toLocaleDateString()}
              </Text>
            </Text>
          </View>
          <View style={styles.reportMapContainer}>
            {validCoordinates && REACT_APP_GOOGLE_MAPS_API_KEY ? (
              <TouchableOpacity
                style={styles.mapTouchable}
                onPress={() => setSelectedReport(item)}
                activeOpacity={0.7}
              >
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.reportMap}
                  initialRegion={initialRegion}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  toolbarEnabled={false}
                  liteMode={true}
                >
                  <Marker coordinate={{ latitude: lat, longitude: lon }} />
                </MapView>
              </TouchableOpacity>
            ) : (
              <View style={styles.noLocationContainer}>
                <Text style={styles.noLocationText}>
                  {!validCoordinates ? 'No location data' : 'Map disabled (API Key)'}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.reportButtons}>
          {!item.isClean && (
             <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#FF5252' }]}
                onPress={() => deleteReport(item._id)}
             >
                <Text style={styles.actionButtonText}>Delete</Text>
             </TouchableOpacity>
           )}
        </View>
      </View>
    );
  };

  const renderModalMap = () => {
    if (!selectedReport) return null;

    const lat = parseFloat(selectedReport.latitude);
    const lon = parseFloat(selectedReport.longitude);
    const validCoordinates = isValidLatLng(lat, lon);

    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={true}
        onRequestClose={() => setSelectedReport(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalHeader}>Report Location</Text>
            {validCoordinates && REACT_APP_GOOGLE_MAPS_API_KEY ? (
              <MapView
                provider={PROVIDER_GOOGLE}
                style={styles.modalMap}
                loadingEnabled={true}
                initialRegion={{
                  latitude: lat,
                  longitude: lon,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
                showsUserLocation={true}
                showsMyLocationButton={true}
              >
                <Marker
                  coordinate={{ latitude: lat, longitude: lon }}
                  title="Reported Location"
                  description={`Coords: ${lat.toFixed(4)}, ${lon.toFixed(4)}`}
                />
              </MapView>
            ) : (
              <Text style={styles.noLocationTextLarge}>
                {!validCoordinates ? 'No valid location data available for this report.' : 'Map disabled due to missing API Key.'}
              </Text>
            )}
            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => setSelectedReport(null)}
            >
              <Text style={styles.closeModalButtonText}>Close Map</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1E1E" />

      <View style={styles.topSection}>
        <View style={styles.navbar}>
          <Text style={styles.navbarTitle}>Dashboard</Text>
          <View style={styles.navbarRight}>
            <Text style={styles.username} numberOfLines={1} ellipsizeMode="tail">
              {userEmail || 'Guest'}
            </Text>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={() => {
                console.log("[Dashboard] Logout pressed.");
                auth.signOut();
              }}
            >
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.header}>Your Location Reports</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#1E90FF" style={styles.loader} />
        ) : reports.length > 0 ? (
          <FlatList
            data={currentReports}
            keyExtractor={(item) => item._id.toString()}
            renderItem={renderReport}
            numColumns={3}
            contentContainerStyle={styles.reportList}
            columnWrapperStyle={styles.listColumnWrapper}
            initialNumToRender={itemsPerPage}
            maxToRenderPerBatch={itemsPerPage}
            windowSize={5}
            removeClippedSubviews={true}
          />
        ) : (
          <Text style={styles.noReportsText}>
            {userEmail ? 'You have not submitted any reports yet.' : 'Please log in to view your reports.'}
          </Text>
        )}

        {totalPages > 1 && (
          <View style={styles.pagination}>
            <TouchableOpacity
              onPress={() => setCurrentPage((prev) => Math.max(prev - 1, 0))}
              disabled={currentPage === 0 || loading}
              style={[
                styles.pageButton,
                (currentPage === 0 || loading) && styles.disabledButton,
              ]}
            >
              <Text style={styles.pageButtonText}>Previous</Text>
            </TouchableOpacity>

            <Text style={styles.pageInfo}>
              Page {currentPage + 1} of {totalPages}
            </Text>

            <TouchableOpacity
              onPress={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages - 1))
              }
              disabled={currentPage >= totalPages - 1 || loading}
              style={[
                styles.pageButton,
                (currentPage >= totalPages - 1 || loading) && styles.disabledButton,
              ]}
            >
              <Text style={styles.pageButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>


       <TouchableOpacity
         style={[styles.reportButton, { marginBottom: 10, backgroundColor: '#03DAC6' }]}
         onPress={() => navigation.navigate('CleanerTasks')}
       >
         <Text style={[styles.reportButtonText, { color: '#121212' }]}>View Cleanup Tasks</Text>
       </TouchableOpacity>


      <TouchableOpacity
        style={styles.reportButton}
        onPress={() => navigation.navigate('Map')}
      >
        <Text style={styles.reportButtonText}>Report Litter Now</Text>
      </TouchableOpacity>

      {renderModalMap()}
    </View>
  );
};

export default Dashboard;