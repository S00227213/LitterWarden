import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator, 
  StatusBar,
  Dimensions,
  Modal,
  Alert
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig'; // Adjust your path as needed

const Dashboard = ({ navigation }) => {
  const SERVER_URL = 'http://192.168.1.74:5000'; // Replace with your backend server's IP if needed
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [selectedReport, setSelectedReport] = useState(null); // For viewing marker

  // Pagination state
  const itemsPerPage = 12;
  const [currentPage, setCurrentPage] = useState(0);

  // Listen for authentication state changes to get the user email
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("[Dashboard] Authenticated user:", user.email);
        setUserEmail(user.email);
      } else {
        console.log("[Dashboard] No user is authenticated");
        setUserEmail('');
      }
    });
    return () => unsubscribe();
  }, []);

  // Log when userEmail is updated
  useEffect(() => {
    console.log("[Dashboard] Current userEmail:", userEmail);
  }, [userEmail]);

  // Function to fetch reports for the signed-in user's email.
  const fetchUserReports = async () => {
    if (!userEmail) {
      console.log("[Dashboard] fetchUserReports skipped because userEmail is empty.");
      setLoading(false);
      return;
    }
    console.log("[Dashboard] Starting fetchUserReports for email:", userEmail);
    try {
      const url = `${SERVER_URL}/reports?email=${encodeURIComponent(userEmail)}`;
      console.log("[Dashboard] Fetch URL:", url);
      const response = await fetch(url);
      console.log("[Dashboard] HTTP response status:", response.status);
      const data = await response.json();
      console.log("[Dashboard] Fetched reports data:", data);
      setReports(data);
      setCurrentPage(0); // Reset to first page on new fetch
    } catch (error) {
      console.error("[Dashboard] Error fetching reports:", error);
      Alert.alert('Error', 'Unable to fetch reports.');
    } finally {
      setLoading(false);
      console.log("[Dashboard] Finished fetching reports. Loading set to false.");
    }
  };

  // Function to delete a report
  const deleteReport = async (reportId) => {
    try {
      const url = `${SERVER_URL}/report/${reportId}`;
      console.log("[Dashboard] Delete URL:", url);
      const response = await fetch(url, { method: 'DELETE' });
      if (response.ok) {
        console.log("[Dashboard] Report deleted successfully:", reportId);
        setReports(prev => prev.filter(report => report._id !== reportId));
      } else {
        Alert.alert('Error', 'Failed to delete report.');
      }
    } catch (error) {
      console.error("[Dashboard] Error deleting report:", error);
      Alert.alert('Error', 'Could not delete report.');
    }
  };

  // Re-fetch reports every time the Dashboard screen is focused
  useFocusEffect(
    React.useCallback(() => {
      console.log("[Dashboard] useFocusEffect triggered: Dashboard focused.");
      setLoading(true);
      fetchUserReports();
    }, [userEmail])
  );

  // Compute the reports to show on the current page
  const currentReports = reports.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);
  const totalPages = Math.ceil(reports.length / itemsPerPage);

  // Render each report item in a grid cell
  const renderReport = ({ item }) => {
    console.log("[Dashboard] Rendering report item with _id:", item._id);
    return (
      <View style={styles.reportCard}>
        <View style={styles.reportTextContainer}>
          <Text style={styles.row}>
            <Text style={styles.label}>Town: </Text>
            <Text style={styles.value}>{item.town}</Text>
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>County: </Text>
            <Text style={styles.value}>{item.county}</Text>
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Country: </Text>
            <Text style={styles.value}>{item.country}</Text>
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Email: </Text>
            <Text style={styles.value}>{item.email}</Text>
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Priority: </Text>
            <Text style={styles.value}>{item.priority}</Text>
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Location: </Text>
            <Text style={styles.value}>
              {item.latitude}, {item.longitude}
            </Text>
          </Text>
          <Text style={styles.row}>
            <Text style={styles.label}>Reported at: </Text>
            <Text style={styles.value}>{new Date(item.reportedAt).toLocaleString()}</Text>
          </Text>
        </View>
        <View style={styles.reportButtons}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setSelectedReport(item)}
          >
            <Text style={styles.actionButtonText}>View Marker</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#FF5252' }]}
            onPress={() => deleteReport(item._id)}
          >
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1E1E" />

      {/* Top Section */}
      <View style={styles.topSection}>
        {/* Navbar */}
        <View style={styles.navbar}>
          <Text style={styles.navbarTitle}>Dashboard</Text>
          <View style={styles.navbarRight}>
            <Text style={styles.username}>{userEmail || 'Guest'}</Text>
            <TouchableOpacity 
              style={styles.logoutButton} 
              onPress={() => {
                console.log("[Dashboard] Logout pressed. Navigating to HomeScreen.");
                navigation.navigate('Home');
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
            columnWrapperStyle={{ justifyContent: 'flex-start' }}
          />
        ) : (
          <Text style={styles.noReportsText}>No reports available for this user.</Text>
        )}

        {/* Pagination Navigation */}
        {reports.length > itemsPerPage && (
          <View style={styles.pagination}>
            <TouchableOpacity
              onPress={() => setCurrentPage(prev => Math.max(prev - 1, 0))}
              disabled={currentPage === 0}
              style={[styles.pageButton, currentPage === 0 && styles.disabledButton]}
            >
              <Text style={styles.pageButtonText}>Previous</Text>
            </TouchableOpacity>
            <Text style={styles.pageInfo}>
              Page {currentPage + 1} of {totalPages}
            </Text>
            <TouchableOpacity
              onPress={() => setCurrentPage(prev => Math.min(prev + 1, totalPages - 1))}
              disabled={currentPage >= totalPages - 1}
              style={[styles.pageButton, currentPage >= totalPages - 1 && styles.disabledButton]}
            >
              <Text style={styles.pageButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Bottom Section - Report Litter Now Button */}
      <TouchableOpacity
        style={styles.reportButton}
        onPress={() => navigation.navigate('Map')}
      >
        <Text style={styles.reportButtonText}>Report Litter Now</Text>
      </TouchableOpacity>

      {/* Modal to Display Map Marker */}
      {selectedReport && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={true}
          onRequestClose={() => setSelectedReport(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalHeader}>Location Marker</Text>
              <MapView
                provider={PROVIDER_GOOGLE}
                style={styles.modalMap}
                initialRegion={{
                  latitude: selectedReport.latitude,
                  longitude: selectedReport.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
              >
                <Marker
                  coordinate={{
                    latitude: selectedReport.latitude,
                    longitude: selectedReport.longitude,
                  }}
                />
              </MapView>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setSelectedReport(null)}
              >
                <Text style={styles.closeModalButtonText}>Close Map</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    padding: 20,
    justifyContent: 'space-between',
  },
  topSection: {
    flex: 1,
  },
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  navbarTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  navbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  username: {
    fontSize: 16,
    fontWeight: '700',
    color: '#B388FF',
    marginRight: 10,
  },
  logoutButton: {
    backgroundColor: '#4B4B4B',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
    color: '#FFFFFF',
  },
  reportList: {
    paddingBottom: 20,
  },
  reportCard: {
    backgroundColor: '#1E1E1E',
    margin: 5,
    padding: 10,
    borderRadius: 10,
    width: (width * 0.9 - 10) / 3,
  },
  reportTextContainer: {
    marginBottom: 10,
  },
  row: {
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B388FF',
  },
  value: {
    fontSize: 12,
    color: '#E0E0E0',
  },
  reportButtons: {
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  actionButton: {
    backgroundColor: '#4B4B4B',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 15,
    marginTop: 4,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    textAlign: 'center',
  },
  loader: {
    marginTop: 20,
  },
  noReportsText: {
    fontSize: 16,
    color: '#E0E0E0',
    textAlign: 'center',
    marginTop: 20,
  },
  reportButton: {
    backgroundColor: '#FFEB3B',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    alignSelf: 'center',
    width: width * 0.6,
    marginBottom: 10,
  },
  reportButtonText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
  },
  pageButton: {
    backgroundColor: '#1E90FF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginHorizontal: 10,
  },
  pageButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  disabledButton: {
    backgroundColor: '#555',
  },
  pageInfo: {
    fontSize: 14,
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    width: width * 0.8,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  modalHeader: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  modalMap: {
    width: '100%',
    height: 150,
    borderRadius: 10,
  },
  closeModalButton: {
    backgroundColor: '#4B4B4B',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    marginTop: 10,
  },
  closeModalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});

export default Dashboard;
