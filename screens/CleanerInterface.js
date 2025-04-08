import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Modal,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { REACT_APP_SERVER_URL, REACT_APP_GOOGLE_MAPS_API_KEY } from '@env';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import styles from './CleanerInterfaceStyles';

if (!REACT_APP_GOOGLE_MAPS_API_KEY) {
  console.warn("Cleaner Interface: Google Maps API key missing.");
}
if (!REACT_APP_SERVER_URL) {
  console.warn("Cleaner Interface: Server URL missing.");
}

const CleanerInterface = () => {
  const navigation = useNavigation();
  const SERVER_URL = REACT_APP_SERVER_URL;

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [afterPhoto, setAfterPhoto] = useState(null);


  const itemsPerPage = 9;
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("[CleanerIF] Authenticated:", user.email);
        setUserEmail(user.email);
      } else {
        console.log("[CleanerIF] No user. Redirecting.");
        setUserEmail('');
        setReports([]);
        setCurrentPage(0);
        setError('User not logged in.');
        // Optional: Redirect to login if needed
        // navigation.navigate('Login');
      }
    });
    return () => unsubscribe();
  }, [navigation]);

  const fetchPendingReports = useCallback(async () => {
    if (!userEmail) {
        console.log("[CleanerIF] No user email, skipping fetch.");
        setLoading(false);
        setReports([]);
        return;
    }
    if (!SERVER_URL) {
      console.error("[CleanerIF] Server URL not configured.");
      setError('Configuration Error: Server URL missing.');
      setLoading(false);
      return;
    }

    console.log("[CleanerIF] Fetching pending reports...");
    setLoading(true);
    setError('');
    try {
      const url = `${SERVER_URL}/reports?includeClean=false&limit=500`; // Fetch all pending reports
      console.log("[CleanerIF] Fetch URL:", url);
      const response = await fetch(url);
      console.log("[CleanerIF] HTTP status:", response.status);

      if (!response.ok) {
         const errorBody = await response.text();
         let detail = errorBody;
         try { detail = JSON.parse(errorBody).error || errorBody; } catch(e){}
         throw new Error(`HTTP error ${response.status}: ${detail.substring(0, 150)}`);
      }

      const data = await response.json();
      const sortedData = (Array.isArray(data) ? data : [])
                           .filter(report => !report.isClean) // Double ensure clean reports are filtered
                           .sort((a, b) => {
                             const priorityOrder = { high: 3, medium: 2, low: 1 };
                             // Sort by priority first (descending)
                             if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                               return priorityOrder[b.priority] - priorityOrder[a.priority];
                             }
                             // Then sort by date (most recent first)
                             return new Date(b.reportedAt) - new Date(a.reportedAt);
                           });

      setReports(sortedData);
      setCurrentPage(0); // Reset to first page after fetching
    } catch (err) {
      console.error("[CleanerIF] Fetch error:", err);
      setError(`Failed to fetch reports: ${err.message}`);
      setReports([]); // Clear reports on error
    } finally {
      setLoading(false);
      console.log("[CleanerIF] Fetch complete.");
    }
  }, [userEmail, SERVER_URL]); // Dependency on userEmail and SERVER_URL

  useFocusEffect(
    React.useCallback(() => {
      console.log("[CleanerIF] Screen focused.");
      if (userEmail) {
          fetchPendingReports(); // Fetch reports when screen comes into focus and user is logged in
      } else {
          // Clear state if user logs out while navigating away and back
          setReports([]);
          setCurrentPage(0);
          setLoading(false);
      }
    }, [userEmail, fetchPendingReports]) // Re-run if userEmail or fetch function changes
  );

  const handleMarkClean = async () => {
    if (!selectedReport || !selectedReport._id) {
      Alert.alert("Error", "No report selected.");
      return;
    }
    if (!SERVER_URL) {
      Alert.alert('Configuration Error', 'Server URL not configured.');
      return;
    }

    if (afterPhoto) {
        // Placeholder: In a real scenario, upload afterPhoto to S3 here *before* marking clean.
        // This would involve getting a presigned URL, uploading, then potentially passing
        // the new URL to the /report/clean endpoint if the backend needs it.
        // For now, we just proceed with marking clean.
        console.log("[CleanerIF] 'After' photo exists, but upload is not implemented. Proceeding to mark clean.");
    }

    Alert.alert(
      "Confirm Cleanup",
      `Mark report at ${selectedReport.town || 'location'} as clean?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark Clean",
          onPress: async () => {
            setIsSubmitting(true);
            setError('');
            try {
              const url = `${SERVER_URL}/report/clean`;
              console.log("[CleanerIF] Marking clean URL:", url, " ID:", selectedReport._id);
              const response = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ reportId: selectedReport._id }),
              });

              if (response.ok) {
                Alert.alert('Success', 'Report marked as clean.');

                // Update state optimistically or based on response
                setReports(prevReports => {
                    const updated = prevReports.filter(r => r._id !== selectedReport._id);
                    // Adjust current page if the last item on it was removed
                    const totalPagesAfter = Math.ceil(updated.length / itemsPerPage);
                    if (currentPage >= totalPagesAfter && totalPagesAfter > 0) {
                        setCurrentPage(totalPagesAfter - 1);
                    } else if (updated.length === 0) {
                        setCurrentPage(0);
                    }
                    return updated;
                });
                handleCloseModal(); // Close modal on success
              } else {
                const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
                console.error("[CleanerIF] Mark clean failed:", response.status, errorData);
                throw new Error(errorData.error || `Server error ${response.status}`);
              }
            } catch (err) {
              console.error("[CleanerIF] Mark clean error:", err);
              setError(`Error marking clean: ${err.message}`);
              Alert.alert('Error', `Could not mark report as clean. ${err.message}`);
            } finally {
              setIsSubmitting(false);
            }
          },
          style: "default",
        },
      ]
    );
  };

   const pickAfterImage = useCallback(() => {
    const options = { mediaType: 'photo', quality: 0.7, maxWidth: 1024, maxHeight: 1024, saveToPhotos: false };
    Alert.alert(
      "Select 'After' Photo Source",
      "Take or select a photo of the cleaned area.",
      [
        { text: "Camera", onPress: () => launchCamera(options, handleImagePickerResponse) },
        { text: "Library", onPress: () => launchImageLibrary(options, handleImagePickerResponse) },
        { text: "Cancel", style: "cancel" },
      ]
    );
  }, [handleImagePickerResponse]);

  const handleImagePickerResponse = useCallback((response) => {
    if (response.didCancel) {
      console.log('User cancelled image picker');
    } else if (response.errorCode) {
      console.error('ImagePicker Error: ', response.errorMessage);
      Alert.alert("Image Error", response.errorMessage);
    } else if (response.assets && response.assets.length > 0) {
      console.log("After photo selected:", response.assets[0].uri);
      setAfterPhoto(response.assets[0]); // Store the full asset object
    }
  }, []);

  const handleSelectReport = (report) => {
    setSelectedReport(report);
    setAfterPhoto(null); // Reset after photo when selecting a new report
    setIsModalVisible(true);
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
    setSelectedReport(null);
    setAfterPhoto(null);
    setIsSubmitting(false); // Reset submitting state
  };


  // Calculate reports for the current page
  const currentReports = reports.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );
  const totalPages = Math.ceil(reports.length / itemsPerPage);


  // Component to render each report card
  const renderReportItem = ({ item }) => {
    const lat = parseFloat(item.latitude);
    const lon = parseFloat(item.longitude);
    const isValidCoords = !isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    const initialRegion = isValidCoords
        ? { latitude: lat, longitude: lon, latitudeDelta: 0.005, longitudeDelta: 0.005 }
        : null;
    const priorityStyle = styles[`priority${item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}`];


    return (
      <TouchableOpacity style={styles.reportCard} onPress={() => handleSelectReport(item)} activeOpacity={0.7}>

        <View style={styles.cardHeader}>
             <Text style={[styles.priorityText, priorityStyle]} numberOfLines={1}>
                {item.priority.toUpperCase()}
             </Text>
             <Text style={styles.dateText}>
                {new Date(item.reportedAt).toLocaleDateString()}
             </Text>
        </View>

        <View style={styles.cardBody}>

            <View style={styles.textContainer}>
                 <Text style={styles.locationText} numberOfLines={1} ellipsizeMode="tail">
                    {item.town && !item.town.includes('Error') && item.town !== 'Unknown' ? item.town : 'Location'}
                    {item.county && !item.county.includes('Error') && item.county !== 'Unknown' ? `, ${item.county.substring(0,10)}..` : ''}
                 </Text>
                 <Text style={styles.coordsText} numberOfLines={1}>
                    ({item.latitude.toFixed(2)}, {item.longitude.toFixed(2)})
                 </Text>
                 <Text style={styles.reporterText} numberOfLines={1} ellipsizeMode="tail">By: {item.email}</Text>
            </View>

           {isValidCoords && REACT_APP_GOOGLE_MAPS_API_KEY ? (
             <View style={styles.mapContainer}>
               <MapView
                 provider={PROVIDER_GOOGLE}
                 style={styles.miniMap}
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
             </View>
           ) : (
             <View style={[styles.mapContainer, styles.noMapContainer]}>
                <Text style={styles.noMapText}>Map N/A</Text>
            </View>
           )}
        </View>


      </TouchableOpacity>
    );
  };

  // Component to render the details modal
   const renderDetailModal = () => {
    if (!isModalVisible || !selectedReport) return null;

    const lat = parseFloat(selectedReport.latitude);
    const lon = parseFloat(selectedReport.longitude);
    const isValidCoords = !isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    const modalMapRegion = isValidCoords
        ? { latitude: lat, longitude: lon, latitudeDelta: 0.005, longitudeDelta: 0.005 }
        : null;
    const priorityStyle = styles[`priority${selectedReport.priority.charAt(0).toUpperCase() + selectedReport.priority.slice(1)}`];

    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ScrollView contentContainerStyle={styles.modalScrollView}>
              <Text style={styles.modalTitle}>Cleanup Task Details</Text>

              {error ? <Text style={styles.modalErrorText}>{error}</Text> : null}

              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Priority: </Text>
                <Text style={[styles.modalValue, priorityStyle]}>{selectedReport.priority.toUpperCase()}</Text>
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Location: </Text>
                <Text style={styles.modalValue}>
                    {selectedReport.town && !selectedReport.town.includes('Error') ? selectedReport.town : 'Unknown Town'}
                    {selectedReport.county && !selectedReport.county.includes('Error') ? `, ${selectedReport.county}` : ''}
                    {selectedReport.country && !selectedReport.country.includes('Error') ? `, ${selectedReport.country}` : ''}
                </Text>
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Coordinates: </Text>
                <Text style={styles.modalValue}>{lat.toFixed(5)}, {lon.toFixed(5)}</Text>
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Reported By: </Text>
                <Text style={styles.modalValue}>{selectedReport.email}</Text>
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Reported At: </Text>
                <Text style={styles.modalValue}>{new Date(selectedReport.reportedAt).toLocaleString()}</Text>
              </Text>
               {selectedReport.recognizedCategory && selectedReport.recognizedCategory !== 'Analysis Pending' && selectedReport.recognizedCategory !== 'Analysis Skipped' && (
                 <Text style={styles.modalDetailRow}>
                    <Text style={styles.modalLabel}>Detected: </Text>
                    <Text style={styles.modalValue}>{selectedReport.recognizedCategory}</Text>
                 </Text>
               )}

              {selectedReport.imageUrl && (
                <View style={styles.evidenceSection}>
                  <Text style={styles.modalLabel}>Original Evidence:</Text>
                  <Image source={{ uri: selectedReport.imageUrl }} style={styles.evidenceImage} resizeMode="contain" />
                </View>
              )}

               <View style={styles.evidenceSection}>
                 <Text style={styles.modalLabel}>Photo After Cleanup (Optional):</Text>
                 {afterPhoto ? (
                    <>
                     <Image source={{ uri: afterPhoto.uri }} style={styles.evidenceImage} resizeMode="contain" />
                     <TouchableOpacity
                        style={[styles.modalButton, styles.changePhotoButton]}
                        onPress={pickAfterImage}
                        disabled={isSubmitting}
                      >
                         <Text style={styles.modalButtonText}>Change Photo</Text>
                     </TouchableOpacity>
                    </>
                 ) : (
                    <TouchableOpacity
                        style={[styles.modalButton, styles.addPhotoButton]}
                        onPress={pickAfterImage}
                        disabled={isSubmitting}
                      >
                         <Text style={styles.modalButtonText}>Add 'After' Photo</Text>
                     </TouchableOpacity>
                 )}
               </View>

              {isValidCoords && REACT_APP_GOOGLE_MAPS_API_KEY ? (
                <View style={styles.modalMapContainer}>
                  <MapView
                    provider={PROVIDER_GOOGLE}
                    style={styles.modalMap}
                    initialRegion={modalMapRegion}
                    scrollEnabled={true}
                    zoomEnabled={true}
                    pitchEnabled={false}
                    rotateEnabled={false}
                  >
                    <Marker coordinate={{ latitude: lat, longitude: lon }} title="Report Location" />
                  </MapView>
                </View>
              ) : (
                <Text style={styles.modalDetailRow}>Map view unavailable.</Text>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleCloseModal}
                disabled={isSubmitting}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, isSubmitting && styles.disabledButton]}
                onPress={handleMarkClean}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalButtonText}>Mark as Clean</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // Main component render
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1E1E" />
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Pending Cleanup Tasks</Text>
         <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
         </TouchableOpacity>
      </View>


      <View style={styles.contentArea}>
        {loading ? (
            <ActivityIndicator size="large" color="#1E90FF" style={styles.loader} />
        ) : error ? (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={fetchPendingReports} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>Retry Fetch</Text>
                </TouchableOpacity>
            </View>
        ) : reports.length === 0 ? (
            <Text style={styles.noReportsText}>
            No pending cleanup tasks found.
            </Text>
        ) : (

            <FlatList
                data={currentReports}
                keyExtractor={(item) => item._id.toString()}
                renderItem={renderReportItem}
                numColumns={3}
                contentContainerStyle={styles.listContainer}
                columnWrapperStyle={styles.listColumnWrapper}

                initialNumToRender={itemsPerPage}
                maxToRenderPerBatch={itemsPerPage}
                windowSize={5}
                removeClippedSubviews={true}


            />
        )}


        {!loading && reports.length > 0 && totalPages > 1 && (
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

      {renderDetailModal()}
    </View>
  );
};

export default CleanerInterface;