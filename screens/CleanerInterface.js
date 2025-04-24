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
  Linking,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { REACT_APP_SERVER_URL, REACT_APP_GOOGLE_MAPS_API_KEY } from '@env';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import styles from './CleanerInterfaceStyles';

// Warning checks for environment variables
if (!REACT_APP_GOOGLE_MAPS_API_KEY) {
  console.warn('Cleaner Interface: Google Maps API key missing.');
}
if (!REACT_APP_SERVER_URL) {
  console.warn('Cleaner Interface: Server URL missing.');
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

  // Effect for handling authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserEmail(user.email);
      } else {
        // Clear state if user logs out
        setUserEmail('');
        setAllReports([]);
        setCurrentPage(0);
        setError('User not logged in.');
        // Optionally navigate to login screen
        // navigation.navigate('Login');
      }
    });
    return () => unsubscribe(); // Cleanup subscription on unmount
  }, [navigation]);

  // Callback function to fetch reports
  const fetchAllReportsForCleaner = useCallback(async () => {
    if (!userEmail) {
      setLoading(false);
      setAllReports([]);
      return; // Don't fetch if no user is logged in
    }
    if (!SERVER_URL) {
      setError('Configuration Error: Server URL missing.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Fetch all reports, including clean ones
      const url = `${SERVER_URL}/reports?limit=1000&includeClean=true`;
      const response = await fetch(url);

      if (!response.ok) {
        // Try to parse error detail from response body
        const errorBody = await response.text();
        let detail = errorBody;
        try {
          detail = JSON.parse(errorBody).error || errorBody;
        } catch (e) {
          // Ignore parsing error, use raw text
        }
        throw new Error(
          `HTTP error ${response.status}: ${detail.substring(0, 150)}`
        );
      }

      const data = await response.json();

      // Ensure data is an array before sorting
      const sortedData = (Array.isArray(data) ? data : [])
        .sort((a, b) => {
          // Define priority order (higher number = higher priority)
          const priorityOrder = { high: 3, medium: 2, low: 1, clean: 0 };
          // Assign priority value, clean reports get 0
          const priorityA = a.isClean ? 0 : priorityOrder[a.priority] || 0;
          const priorityB = b.isClean ? 0 : priorityOrder[b.priority] || 0;

          // Sort primarily by priority (descending)
          if (priorityA !== priorityB) return priorityB - priorityA;

          // If priorities are equal, sort by report date (most recent first)
          return new Date(b.reportedAt) - new Date(a.reportedAt);
        });

      setAllReports(sortedData);
      setCurrentPage(0); // Reset to first page after fetching/sorting
    } catch (err) {
      console.error('[CleanerIF] Fetch error:', err);
      setError(`Failed to fetch reports: ${err.message}`);
      setAllReports([]); // Clear reports on error
    } finally {
      setLoading(false);
    }
  }, [userEmail, SERVER_URL]); // Dependencies for the callback

  // useFocusEffect to refetch data when the screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (userEmail) {
        fetchAllReportsForCleaner(); // Fetch if user is logged in
      } else {
        // Clear state if no user is logged in when screen focuses
        setAllReports([]);
        setCurrentPage(0);
        setLoading(false);
        setError('User not logged in.');
      }
      // No cleanup needed here as fetchAllReportsForCleaner handles its own state
    }, [userEmail, fetchAllReportsForCleaner]) // Dependencies for useFocusEffect
  );

  // Handler for changing the report filter
  const handleFilterChange = (selection) => {
    setFilterSelection(selection);
    setCurrentPage(0); // Reset pagination when filter changes
  };

  // Memoized calculation of filtered reports based on current selection
  const filteredReports = useMemo(() => {
    return allReports.filter((report) => {
      if (filterSelection === 'clean') return report.isClean;
      if (filterSelection === 'all_pending') return !report.isClean;
      // Filter by specific priority for pending reports
      return !report.isClean && report.priority === filterSelection;
    });
  }, [allReports, filterSelection]); // Recalculate when reports or filter change

  // Handler to mark a selected report as clean
  const handleMarkClean = async () => {
    if (!selectedReport || !selectedReport._id) {
      Alert.alert('Error', 'No report selected.');
      return;
    }
    if (!SERVER_URL) {
      Alert.alert('Configuration Error', 'Server URL not configured.');
      return;
    }

    // Confirmation dialog before marking clean
    Alert.alert(
      'Confirm Cleanup',
      `Mark report at ${selectedReport.town || 'location'} as clean?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Clean',
          onPress: async () => {
            setIsSubmitting(true); // Indicate submission start
            setError(''); // Clear previous errors
            try {
              const url = `${SERVER_URL}/report/clean`;
              const response = await fetch(url, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json', // Good practice to accept JSON
                },
                body: JSON.stringify({ reportId: selectedReport._id }),
              });

              if (response.ok) {
                Alert.alert('Success', 'Report marked as clean.');

                // Update the local state immediately for better UX
                setAllReports((prevReports) =>
                  prevReports.map((r) =>
                    r._id === selectedReport._id
                      ? {
                          ...r,
                          isClean: true,
                          // Keep other relevant fields, update status representation if needed
                          recognizedCategory: 'Cleaned', // Example update
                        }
                      : r
                  )
                );

                // Adjust current page if the last item on the page was removed
                const currentFilteredLength = filteredReports.filter(
                  (r) => r._id !== selectedReport._id
                ).length;
                const totalPagesAfter = Math.ceil(
                  currentFilteredLength / itemsPerPage
                );

                if (currentPage >= totalPagesAfter && totalPagesAfter > 0) {
                  // If current page is now out of bounds, go to last page
                  setCurrentPage(totalPagesAfter - 1);
                } else if (currentFilteredLength === 0 && currentPage > 0) {
                  // If the list becomes empty, go to page 0 or previous if exists
                   setCurrentPage(currentPage - 1);
                } else if (currentFilteredLength === 0) {
                    setCurrentPage(0); // Handle edge case of removing last item overall
                }


                handleCloseModal(); // Close the modal on success
              } else {
                // Try to parse error from server response
                const errorData = await response
                  .json()
                  .catch(() => ({ error: 'Failed to parse error response' }));
                throw new Error(
                  errorData.error || `Server error ${response.status}`
                );
              }
            } catch (err) {
              console.error('[CleanerIF] Mark clean error:', err);
              setError(`Error marking clean: ${err.message}`); // Show error in modal
              Alert.alert(
                'Error',
                `Could not mark report as clean. ${err.message}`
              );
            } finally {
              setIsSubmitting(false); // Indicate submission end
            }
          },
          style: 'default', // Default action button style
        },
      ]
    );
  };

  // Callback for handling image picker response
   const handleImagePickerResponse = useCallback((response) => {
      if (response.didCancel) {
        console.log('User cancelled image picker');
      } else if (response.errorCode) {
        console.error('ImagePicker Error: ', response.errorMessage);
        Alert.alert('Image Error', response.errorMessage);
      } else if (response.assets && response.assets.length > 0) {
        setAfterPhoto(response.assets[0]); // Store the selected image asset
      }
    }, []); // Empty dependency array as it doesn't depend on component state/props

  // Callback to launch image picker (camera or library)
  const pickAfterImage = useCallback(() => {
    const options = {
      mediaType: 'photo',
      quality: 0.7, // Reduce quality for faster uploads
      maxWidth: 1024, // Resize image
      maxHeight: 1024,
      saveToPhotos: false, // Don't save to device library by default
    };
    Alert.alert(
      "Select 'After' Photo Source",
      'Take or select a photo of the cleaned area.',
      [
        {
          text: 'Camera',
          onPress: () => launchCamera(options, handleImagePickerResponse),
        },
        {
          text: 'Library',
          onPress: () => launchImageLibrary(options, handleImagePickerResponse),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [handleImagePickerResponse]); // Dependency on the response handler

  // Handler for selecting a report from the list
  const handleSelectReport = (report) => {
    setSelectedReport(report);
    setAfterPhoto(null); // Reset 'after' photo when opening modal
    setIsModalVisible(true);
    setError(''); // Clear any previous modal errors
  };

  // Handler for closing the detail modal
  const handleCloseModal = () => {
    setIsModalVisible(false);
    setSelectedReport(null); // Clear selected report
    setAfterPhoto(null); // Clear 'after' photo
    setIsSubmitting(false); // Reset submitting state
    setError(''); // Clear modal errors
  };

  // Memoized calculation for the reports to display on the current page
  const currentReports = useMemo(() => {
     return filteredReports.slice(
        currentPage * itemsPerPage,
        (currentPage + 1) * itemsPerPage
     );
  }, [filteredReports, currentPage, itemsPerPage]); // Recalculate when these change

  // Total number of pages for pagination
  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);

  // Function to open coordinates in the native maps application
  const openInGoogleMaps = (lat, lon) => {
    const label = 'Litter Report Location';
    let url = '';

    // Validate coordinates before attempting to create URL
    if (isNaN(lat) || isNaN(lon)) {
      Alert.alert('Error', 'Cannot open map link with invalid coordinates.');
      return;
    }

    // Platform-specific map URL schemes
    if (Platform.OS === 'ios') {
      // Apple Maps URL scheme
      url = `http://maps.apple.com/?q=${encodeURIComponent(
        label
      )}&ll=${lat},${lon}`;
    } else {
      // Android geo intent URI
      url = `geo:0,0?q=${lat},${lon}(${encodeURIComponent(label)})`;
    }

    // Check if the app can handle the URL, otherwise fallback to web maps
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url); // Open in native app
        } else {
          // Fallback to Google Maps web URL
          const webUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
          console.log('Native map app not supported, opening web URL:', webUrl);
          return Linking.openURL(webUrl);
        }
      })
      .catch((err) => {
        console.error('Error opening map link:', err);
        Alert.alert('Error', 'Could not open map application.');
      });
  };

  // Render function for each report item in the FlatList
  const renderReportItem = ({ item }) => {
    // Parse coordinates safely
    const lat = parseFloat(item.latitude);
    const lon = parseFloat(item.longitude);
    const canAttemptMap = !isNaN(lat) && !isNaN(lon); // Check if coordinates are valid numbers

    // Determine style and text based on clean status and priority
    const priorityStyle = item.isClean
      ? styles.priorityClean
      : styles[`priority${item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}`];
    const priorityText = item.isClean ? 'CLEAN' : item.priority.toUpperCase();

    return (
      <TouchableOpacity
        style={styles.reportCard}
        onPress={() => handleSelectReport(item)}
        activeOpacity={0.7} // Visual feedback on press
      >
        {/* Card Header: Priority and Date */}
        <View style={styles.cardHeader}>
          <Text style={[styles.priorityText, priorityStyle]} numberOfLines={1}>
            {priorityText}
          </Text>
          <Text style={styles.dateText}>
            {new Date(item.reportedAt).toLocaleDateString()}
          </Text>
        </View>

        {/* Card Body: Text Info and Mini-Map */}
        <View style={styles.cardBody}>
          {/* Text Details */}
          <View style={styles.textContainer}>
            <Text style={styles.locationText} numberOfLines={1} ellipsizeMode="tail">
              {/* Display Town/County if available and not errored */}
              {item.town && !item.town.includes('Error') && item.town !== 'Unknown'
                ? item.town
                : 'Location'}
              {item.county && !item.county.includes('Error') && item.county !== 'Unknown'
                ? `, ${item.county.substring(0, 10)}..` // Abbreviate county
                : ''}
            </Text>
            <Text style={styles.coordsText} numberOfLines={1}>
              ({canAttemptMap ? lat.toFixed(2) : 'N/A'},{' '}
              {canAttemptMap ? lon.toFixed(2) : 'N/A'})
            </Text>
            <Text style={styles.reporterText} numberOfLines={1} ellipsizeMode="tail">
              By: {item.email || 'Unknown User'}
            </Text>
          </View>

          {/* Mini-Map Preview */}
          {canAttemptMap && REACT_APP_GOOGLE_MAPS_API_KEY ? (
            <TouchableOpacity
              style={styles.mapContainer}
              activeOpacity={0.7}
              onPress={() => {
                if (canAttemptMap) openInGoogleMaps(lat, lon);
              }}
            >
              <MapView
                key={`mini-${item._id}-${lat}-${lon}`} // Unique key for updates
                provider={PROVIDER_GOOGLE}
                style={styles.miniMap}
                initialRegion={{
                  latitude: lat,
                  longitude: lon,
                  latitudeDelta: 0.005, // Zoom level for mini-map
                  longitudeDelta: 0.005,
                }}
                scrollEnabled={false} // Non-interactive mini-map
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                toolbarEnabled={false} // Hide Google Maps buttons
                showsUserLocation={false}
                showsMyLocationButton={false}
              >
                {/* Marker MUST be inside MapView */}
                <Marker coordinate={{ latitude: lat, longitude: lon }} />
              </MapView>
            </TouchableOpacity>
          ) : (
            // Placeholder if map cannot be shown
            <View style={[styles.mapContainer, styles.noMapContainer]}>
              <Text style={styles.noMapText}>Map N/A</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Render function for the detailed report modal
  const renderDetailModal = () => {
    if (!isModalVisible || !selectedReport) return null; // Don't render if not visible or no report

    // Parse coordinates for the selected report
    const lat = parseFloat(selectedReport.latitude);
    const lon = parseFloat(selectedReport.longitude);
    const canAttemptMap = !isNaN(lat) && !isNaN(lon);

    // Define map region only if coordinates are valid
    const modalMapRegion = canAttemptMap
      ? {
          latitude: lat,
          longitude: lon,
          latitudeDelta: 0.005, // Zoom level for modal map
          longitudeDelta: 0.005,
        }
      : null; // No region if coords are bad

    // Determine status style and text for modal
    const priorityStyle = selectedReport.isClean
      ? styles.priorityClean
      : styles[`priority${selectedReport.priority.charAt(0).toUpperCase() + selectedReport.priority.slice(1)}`];
    const statusText = selectedReport.isClean
      ? 'CLEAN'
      : selectedReport.priority.toUpperCase();

    return (
      <Modal
        animationType="slide"
        transparent={true} // Allows overlay style
        visible={isModalVisible}
        onRequestClose={handleCloseModal} // For Android back button
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ScrollView contentContainerStyle={styles.modalScrollView}>
              <Text style={styles.modalTitle}>Cleanup Task Details</Text>

              {/* Display any submission errors */}
              {error ? <Text style={styles.modalErrorText}>{error}</Text> : null}

              {/* Report Details */}
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Status: </Text>
                <Text style={[styles.modalValue, priorityStyle]}>{statusText}</Text>
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Location: </Text>
                <Text style={styles.modalValue}>
                  {/* Combine location details, checking for validity */}
                  {selectedReport.town && !selectedReport.town.includes('Error')
                    ? selectedReport.town
                    : 'Unknown Town'}
                  {selectedReport.county && !selectedReport.county.includes('Error')
                    ? `, ${selectedReport.county}`
                    : ''}
                  {selectedReport.country && !selectedReport.country.includes('Error')
                    ? `, ${selectedReport.country}`
                    : ''}
                </Text>
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Coordinates: </Text>
                <Text style={styles.modalValue}>
                  {canAttemptMap
                    ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` // More precision in modal
                    : 'Invalid Coordinates'}
                </Text>
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Reported By: </Text>
                <Text style={styles.modalValue}>{selectedReport.email || 'Unknown'}</Text>
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Reported At: </Text>
                <Text style={styles.modalValue}>
                  {new Date(selectedReport.reportedAt).toLocaleString()}
                </Text>
              </Text>
              {/* Show recognized category if available and relevant */}
              {selectedReport.recognizedCategory &&
                selectedReport.recognizedCategory !== 'Analysis Pending' &&
                selectedReport.recognizedCategory !== 'Analysis Skipped' &&
                !selectedReport.isClean && (
                  <Text style={styles.modalDetailRow}>
                    <Text style={styles.modalLabel}>Detected: </Text>
                    <Text style={styles.modalValue}>{selectedReport.recognizedCategory}</Text>
                  </Text>
              )}

              {/* Original Evidence Image (if available and not clean) */}
              {selectedReport.imageUrl && !selectedReport.isClean && (
                <View style={styles.evidenceSection}>
                  <Text style={styles.modalLabel}>Original Evidence:</Text>
                  <Image
                    source={{ uri: selectedReport.imageUrl }}
                    style={styles.evidenceImage}
                    resizeMode="contain" // Show full image without cropping
                  />
                </View>
              )}

              {/* Section for adding/viewing 'After' photo (only if not clean) */}
              {!selectedReport.isClean && (
                <View style={styles.evidenceSection}>
                  <Text style={styles.modalLabel}>Photo After Cleanup (Optional):</Text>
                  {afterPhoto ? (
                    <>
                      <Image
                        source={{ uri: afterPhoto.uri }}
                        style={styles.evidenceImage}
                        resizeMode="contain"
                      />
                      <TouchableOpacity
                        style={[styles.modalButton, styles.changePhotoButton]}
                        onPress={pickAfterImage}
                        disabled={isSubmitting} // Disable if marking clean
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

              {/* Modal Map View */}
              {canAttemptMap && REACT_APP_GOOGLE_MAPS_API_KEY ? (
                <View style={styles.modalMapContainer}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      if (canAttemptMap) openInGoogleMaps(lat, lon);
                    }}
                  >
                    <MapView
                      // *** ADDED/UPDATED KEY HERE ***
                      key={`modal-${selectedReport._id}-${lat}-${lon}`}
                      provider={PROVIDER_GOOGLE}
                      style={styles.modalMap}
                      initialRegion={modalMapRegion} // Use calculated region
                      scrollEnabled={true} // Allow interaction in modal map
                      zoomEnabled={true}
                      pitchEnabled={false} // Keep map flat for clarity
                      rotateEnabled={false}
                      showsUserLocation={false} // Don't show user's current location on this map
                      showsMyLocationButton={false}
                    >
                      {/* Marker MUST be inside MapView */}
                      <Marker
                        coordinate={{ latitude: lat, longitude: lon }}
                        title="Report Location"
                      />
                    </MapView>
                  </TouchableOpacity>
                </View>
              ) : (
                // Placeholder if map cannot be shown
                <Text style={styles.modalDetailRow}>
                  Map view unavailable (Invalid Coords or Missing API Key).
                </Text>
              )}
            </ScrollView>

            {/* Modal Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleCloseModal}
                disabled={isSubmitting} // Disable while submitting
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              {/* Show 'Mark Clean' only if the report is not already clean */}
              {!selectedReport.isClean && (
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    styles.confirmButton,
                    isSubmitting && styles.disabledButton, // Style when disabled
                  ]}
                  onPress={handleMarkClean}
                  disabled={isSubmitting} // Disable while submitting
                >
                  {isSubmitting ? (
                    // Show loader while submitting
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

  // Main component render
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1E1E" />
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Cleanup Tasks</Text>
        {/* Simple Back Button */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Bar */}
      <View style={styles.filterBar}>
         {/* Filter Buttons with active state styling and report counts */}
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

      {/* Main Content Area */}
      <View style={styles.contentArea}>
        {loading ? (
          // Show loader while fetching data
          <ActivityIndicator size="large" color="#1E90FF" style={styles.loader} />
        ) : error && error !== 'User not logged in.' ? (
          // Show error message and retry button if fetch failed (excluding 'not logged in')
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchAllReportsForCleaner} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry Fetch</Text>
            </TouchableOpacity>
          </View>
        ) : !userEmail ? (
            // Message if user is not logged in
             <Text style={styles.noReportsText}>Please log in to view tasks.</Text>
        ) : filteredReports.length === 0 ? (
          // Message if no reports match the current filter
          <Text style={styles.noReportsText}>
            No {filterSelection === 'all_pending' ? 'pending' : filterSelection === 'clean' ? 'clean' : `${filterSelection} priority`} tasks found.
          </Text>
        ) : (
          // Display the list of reports if available
          <FlatList
            data={currentReports} // Use paginated data
            keyExtractor={(item) => item._id.toString()} // Unique key for each item
            renderItem={renderReportItem} // Function to render each item
            numColumns={3} // Grid layout
            contentContainerStyle={styles.listContainer}
            columnWrapperStyle={styles.listColumnWrapper} // Style for rows in grid
            // Performance optimizations for long lists
            initialNumToRender={itemsPerPage}
            maxToRenderPerBatch={itemsPerPage}
            windowSize={5} // Render items slightly outside viewport
            removeClippedSubviews={true} // Improve memory usage
          />
        )}

        {/* Pagination Controls (only show if needed) */}
        {!loading && filteredReports.length > 0 && totalPages > 1 && (
          <View style={styles.pagination}>
            <TouchableOpacity
              onPress={() => setCurrentPage((prev) => Math.max(prev - 1, 0))} // Go to previous page
              disabled={currentPage === 0 || loading} // Disable if on first page or loading
              style={[
                styles.pageButton,
                (currentPage === 0 || loading) && styles.disabledButton, // Style when disabled
              ]}
            >
              <Text style={styles.pageButtonText}>Previous</Text>
            </TouchableOpacity>
            {/* Display current page info */}
            <Text style={styles.pageInfo}>
              Page {currentPage + 1} of {totalPages}
            </Text>
            <TouchableOpacity
              onPress={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages - 1)) // Go to next page
              }
              disabled={currentPage >= totalPages - 1 || loading} // Disable if on last page or loading
              style={[
                styles.pageButton,
                (currentPage >= totalPages - 1 || loading) && styles.disabledButton, // Style when disabled
              ]}
            >
              <Text style={styles.pageButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Render the modal (conditionally based on state) */}
      {renderDetailModal()}
    </View>
  );
};

export default CleanerInterface;