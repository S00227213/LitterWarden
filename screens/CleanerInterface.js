import React, { useEffect, useState, useCallback, useMemo } from 'react';
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

  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [afterPhoto, setAfterPhoto] = useState(null);
  const [filterSelection, setFilterSelection] = useState('all_pending');


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
        setAllReports([]);
        setCurrentPage(0);
        setError('User not logged in.');
      }
    });
    return () => unsubscribe();
  }, [navigation]);

  const fetchAllReportsForCleaner = useCallback(async () => {
    if (!userEmail) {
        console.log("[CleanerIF] No user email, skipping fetch.");
        setLoading(false);
        setAllReports([]);
        return;
    }
    if (!SERVER_URL) {
      console.error("[CleanerIF] Server URL not configured.");
      setError('Configuration Error: Server URL missing.');
      setLoading(false);
      return;
    }

    console.log("[CleanerIF] Fetching ALL reports (clean & pending)...");
    setLoading(true);
    setError('');
    try {

      const url = `${SERVER_URL}/reports?limit=1000&includeClean=true`;
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
                           .sort((a, b) => {
                             const priorityOrder = { high: 3, medium: 2, low: 1, clean: 0 };
                             const priorityA = a.isClean ? 0 : priorityOrder[a.priority] || 0;
                             const priorityB = b.isClean ? 0 : priorityOrder[b.priority] || 0;

                             if(priorityA !== priorityB) return priorityB - priorityA;

                             return new Date(b.reportedAt) - new Date(a.reportedAt);
                           });

      setAllReports(sortedData);
      setCurrentPage(0);
    } catch (err) {
      console.error("[CleanerIF] Fetch error:", err);
      setError(`Failed to fetch reports: ${err.message}`);
      setAllReports([]);
    } finally {
      setLoading(false);
      console.log("[CleanerIF] Fetch complete.");
    }
  }, [userEmail, SERVER_URL]);

  useFocusEffect(
    React.useCallback(() => {
      console.log("[CleanerIF] Screen focused.");
      if (userEmail) {
          fetchAllReportsForCleaner();
      } else {

          setAllReports([]);
          setCurrentPage(0);
          setLoading(false);
      }
    }, [userEmail, fetchAllReportsForCleaner])
  );

  const handleFilterChange = (selection) => {
    setFilterSelection(selection);
    setCurrentPage(0);
  };

  const filteredReports = useMemo(() => {
      return allReports.filter(report => {
          if (filterSelection === 'clean') return report.isClean;
          if (filterSelection === 'all_pending') return !report.isClean;
          // For high, medium, low filters, also ensure it's not clean
          return !report.isClean && report.priority === filterSelection;
      });
  }, [allReports, filterSelection]);

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

                setAllReports(prevReports => prevReports.map(r =>
                    r._id === selectedReport._id ? { ...r, isClean: true, imageUrl: null, recognizedCategory: 'Cleaned' } : r
                ));

                const currentFilteredLength = filteredReports.filter(r => r._id !== selectedReport._id).length;
                const totalPagesAfter = Math.ceil(currentFilteredLength / itemsPerPage);

                if (currentPage >= totalPagesAfter && totalPagesAfter > 0) {
                    setCurrentPage(totalPagesAfter - 1);
                } else if (currentFilteredLength === 0 && currentPage > 0) {
                    setCurrentPage(currentPage - 1);
                } else if (currentFilteredLength === 0) {
                    setCurrentPage(0);
                }

                handleCloseModal();
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
      setAfterPhoto(response.assets[0]);
    }
  }, []);

  const handleSelectReport = (report) => {
    setSelectedReport(report);
    setAfterPhoto(null);
    setIsModalVisible(true);
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
    setSelectedReport(null);
    setAfterPhoto(null);
    setIsSubmitting(false);
  };


  const currentReports = filteredReports.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );
  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);


  const renderReportItem = ({ item }) => {
    const lat = parseFloat(item.latitude);
    const lon = parseFloat(item.longitude);
    const isValidCoords = !isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    const initialRegion = isValidCoords
        ? { latitude: lat, longitude: lon, latitudeDelta: 0.005, longitudeDelta: 0.005 }
        : null;
    const priorityStyle = item.isClean ? styles.priorityClean : styles[`priority${item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}`];
    const priorityText = item.isClean ? "CLEAN" : item.priority.toUpperCase();

    return (
      <TouchableOpacity style={styles.reportCard} onPress={() => handleSelectReport(item)} activeOpacity={0.7}>

        <View style={styles.cardHeader}>
             <Text style={[styles.priorityText, priorityStyle]} numberOfLines={1}>
                {priorityText}
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


   const renderDetailModal = () => {
    if (!isModalVisible || !selectedReport) return null;

    const lat = parseFloat(selectedReport.latitude);
    const lon = parseFloat(selectedReport.longitude);
    const isValidCoords = !isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    const modalMapRegion = isValidCoords
        ? { latitude: lat, longitude: lon, latitudeDelta: 0.005, longitudeDelta: 0.005 }
        : null;
    const priorityStyle = selectedReport.isClean ? styles.priorityClean : styles[`priority${selectedReport.priority.charAt(0).toUpperCase() + selectedReport.priority.slice(1)}`];
    const statusText = selectedReport.isClean ? "CLEAN" : selectedReport.priority.toUpperCase();

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
                <Text style={styles.modalLabel}>Status: </Text>
                <Text style={[styles.modalValue, priorityStyle]}>{statusText}</Text>
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
               {selectedReport.recognizedCategory && selectedReport.recognizedCategory !== 'Analysis Pending' && selectedReport.recognizedCategory !== 'Analysis Skipped' && !selectedReport.isClean && (
                 <Text style={styles.modalDetailRow}>
                    <Text style={styles.modalLabel}>Detected: </Text>
                    <Text style={styles.modalValue}>{selectedReport.recognizedCategory}</Text>
                 </Text>
               )}

              {selectedReport.imageUrl && !selectedReport.isClean && (
                <View style={styles.evidenceSection}>
                  <Text style={styles.modalLabel}>Original Evidence:</Text>
                  <Image source={{ uri: selectedReport.imageUrl }} style={styles.evidenceImage} resizeMode="contain" />
                </View>
              )}

               {!selectedReport.isClean && (
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
               )}

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
              {!selectedReport.isClean && (
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
              )}
            </View>
          </View>
        </View>
      </Modal>
    );
  };


  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1E1E" />
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Cleanup Tasks</Text>
         <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
         </TouchableOpacity>
      </View>

      <View style={styles.filterBar}>
          <TouchableOpacity
            style={[styles.filterButton, filterSelection === 'all_pending' && styles.filterButtonActive]}
            onPress={() => handleFilterChange('all_pending')}>
            <Text style={[styles.filterButtonText, filterSelection === 'all_pending' && styles.filterButtonTextActive]}>All Pending ({allReports.filter(r=>!r.isClean).length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, styles.filterButtonHigh, filterSelection === 'high' && styles.filterButtonActive]}
            onPress={() => handleFilterChange('high')}>
            <Text style={[styles.filterButtonText, filterSelection === 'high' && styles.filterButtonTextActive]}>High ({allReports.filter(r => r.priority === 'high' && !r.isClean).length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
             style={[styles.filterButton, styles.filterButtonMedium, filterSelection === 'medium' && styles.filterButtonActive]}
            onPress={() => handleFilterChange('medium')}>
            <Text style={[styles.filterButtonText, filterSelection === 'medium' && styles.filterButtonTextActive]}>Medium ({allReports.filter(r => r.priority === 'medium' && !r.isClean).length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, styles.filterButtonLow, filterSelection === 'low' && styles.filterButtonActive]}
            onPress={() => handleFilterChange('low')}>
            <Text style={[styles.filterButtonText, filterSelection === 'low' && styles.filterButtonTextActive]}>Low ({allReports.filter(r => r.priority === 'low' && !r.isClean).length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, styles.filterButtonClean, filterSelection === 'clean' && styles.filterButtonActive]}
            onPress={() => handleFilterChange('clean')}>
            <Text style={[styles.filterButtonText, filterSelection === 'clean' && styles.filterButtonTextActive]}>Clean ({allReports.filter(r=>r.isClean).length})</Text>
          </TouchableOpacity>
      </View>


      <View style={styles.contentArea}>
        {loading ? (
            <ActivityIndicator size="large" color="#1E90FF" style={styles.loader} />
        ) : error ? (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={fetchAllReportsForCleaner} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>Retry Fetch</Text>
                </TouchableOpacity>
            </View>
        ) : filteredReports.length === 0 ? (
            <Text style={styles.noReportsText}>
                No {filterSelection === 'all_pending' ? 'pending' : filterSelection} tasks found.
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


        {!loading && filteredReports.length > 0 && totalPages > 1 && (
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