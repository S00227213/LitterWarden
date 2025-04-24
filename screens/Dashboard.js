import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Alert,
  Modal,
  Linking,
  Platform,
  Image,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { onAuthStateChanged, updateProfile, signOut } from 'firebase/auth'; // Added signOut
import { auth } from '../firebaseConfig'; // Ensure this path is correct
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import {
  REACT_APP_GOOGLE_MAPS_API_KEY,
  REACT_APP_SERVER_URL,
  S3_BUCKET_NAME, // Make sure this is defined in your .env
} from '@env';
import styles from './DashboardScreenStyles'; // Ensure this path is correct

// Convert a file:// URI into a Blob
const uriToBlob = uri =>
  new Promise((resolve, reject) => {
    // Ensure URI is valid
    if (!uri || typeof uri !== 'string') {
      console.error('Invalid URI passed to uriToBlob:', uri);
      return reject(new Error('Invalid URI provided to uriToBlob'));
    }
    console.log('Attempting to convert URI to Blob:', uri); // Debug log
    const xhr = new XMLHttpRequest();
    xhr.onerror = (e) => {
      console.error('XHR Error during Blob conversion:', e); // Log specific error
      reject(new Error('Network request failed during Blob conversion'));
    };
    xhr.onreadystatechange = () => {
      // Optional: Log state changes for debugging
      // console.log('XHR State:', xhr.readyState);
      if (xhr.readyState === 4) {
         // console.log('XHR Status for Blob fetch:', xhr.status); // Log status
         if (xhr.status === 200 || xhr.status === 0) { // Status 0 can occur for local file access
            console.log('Blob conversion successful.');
            resolve(xhr.response);
         } else {
            console.error(`Failed to fetch URI for Blob: Status ${xhr.status}`);
            reject(new Error(`Failed to fetch URI: Status ${xhr.status}`));
         }
      }
    };
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    try {
        xhr.send(null);
    } catch (error) {
        console.error("Error sending XHR request for Blob conversion:", error);
        reject(error);
    }
  });

// Helper function to check Lat/Lng validity
const isValidLatLng = (lat, lon) => {
  const pLat = parseFloat(lat), pLon = parseFloat(lon);
  return !isNaN(pLat) && !isNaN(pLon) && Math.abs(pLat) <= 90 && Math.abs(pLon) <= 180;
};

const Dashboard = ({ navigation }) => {
  const SERVER_URL = REACT_APP_SERVER_URL;
  const BUCKET_NAME = S3_BUCKET_NAME; // Use the imported variable
  const AWS_REGION = process.env.AWS_REGION || 'eu-west-1'; // Get region for URL construction

  if (!SERVER_URL) {
    console.error("REACT_APP_SERVER_URL is not defined in environment variables!");
    // Optionally, show an alert or a different UI state
  }
  if (!BUCKET_NAME) {
    console.error("S3_BUCKET_NAME is not defined in environment variables!");
     // Optionally, show an alert or a different UI state
  }

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [profilePhotoUri, setProfilePhotoUri] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [filterSelection, setFilterSelection] = useState('all');
  const itemsPerPage = 9;

  // 1) Auth listener + load photoURL
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user) {
        console.log("Auth state changed: User logged in", user.email);
        setUserEmail(user.email);
        if (user.photoURL) {
          console.log("User has photoURL:", user.photoURL);
          // Add timestamp to try and bust cache
          const photoUrlWithCacheBust = `${user.photoURL}?t=${Date.now()}`;
          setProfilePhotoUri(photoUrlWithCacheBust);
        } else {
          console.log("User has no photoURL.");
          setProfilePhotoUri(null); // Explicitly set to null if no photoURL
        }
      } else {
        console.log("Auth state changed: User logged out");
        navigation.replace('Login'); // Ensure navigation is available
      }
    });
    return unsubscribe; // Cleanup subscription on unmount
  }, [navigation]);

  // 2) Fetch reports
  const fetchReports = useCallback(async () => {
    if (!userEmail || !SERVER_URL) {
        console.log("Skipping fetchReports: Missing userEmail or SERVER_URL");
        setLoading(false); // Ensure loading stops if we don't fetch
        return;
    }
    console.log("Fetching reports for user:", userEmail);
    setLoading(true);
    try {
      const response = await fetch(
        `${SERVER_URL}/reports?email=${encodeURIComponent(userEmail)}&includeClean=true`
      );
      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }
      const data = await response.json();
      // console.log("Fetched reports data:", data);
      setReports(Array.isArray(data) ? data : []);
      setCurrentPage(0); // Reset page on new data fetch
    } catch (err) {
      console.error('Error fetching reports:', err);
      Alert.alert('Fetch Error', `Could not load reports: ${err.message}`);
      setReports([]); // Clear reports on error
    } finally {
      setLoading(false);
    }
  }, [userEmail, SERVER_URL]);

  // Use useFocusEffect to fetch reports when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (userEmail) {
        fetchReports();
      } else {
        // If userEmail is not yet set (e.g., auth state hasn't resolved), don't start loading
        setLoading(false);
      }
    }, [userEmail, fetchReports])
  );

  // 3) Delete report
  const deleteReport = useCallback(
    (reportId) => {
      if (!SERVER_URL) {
          Alert.alert('Configuration Error', 'Server URL is not configured.');
          return;
      }
      Alert.alert('Confirm Deletion', 'Are you sure you want to delete this report? This action cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            console.log("Attempting to delete report:", reportId);
            setLoading(true); // Indicate activity
            try {
              const response = await fetch(`${SERVER_URL}/report/${reportId}`, { method: 'DELETE' });
              if (!response.ok) {
                throw new Error(`Server responded with status ${response.status}`);
              }
              console.log("Report deleted successfully:", reportId);
              // Update state optimistically or re-fetch
              setReports(currentReports => currentReports.filter(report => report._id !== reportId));
              // Optional: Re-fetch reports if pagination/filtering makes simple removal complex
              // fetchReports();
            } catch (err) {
              console.error('Error deleting report:', err);
              Alert.alert('Deletion Failed', `Could not delete the report: ${err.message}`);
            } finally {
              setLoading(false);
            }
          },
        },
      ]);
    },
    [SERVER_URL/* , fetchReports */] // Add fetchReports if you re-fetch instead of filtering
  );

  // 4) Filter & sort reports
  const filteredAndSorted = useMemo(() => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    let filteredList = [...reports]; // Create a copy to avoid mutating original state

    // Apply filter
    if (filterSelection === 'clean') {
      filteredList = filteredList.filter(r => r.isClean);
    } else if (['high', 'medium', 'low'].includes(filterSelection)) {
      filteredList = filteredList.filter(r => !r.isClean && r.priority === filterSelection);
    } // 'all' filter needs no specific filtering step here

    // Apply sorting
    filteredList.sort((a, b) => {
      // Prioritize non-clean reports over clean ones
      if (!a.isClean && b.isClean) return -1;
      if (a.isClean && !b.isClean) return 1;

      // If both are non-clean, sort by priority (desc) then date (desc)
      if (!a.isClean && !b.isClean) {
        const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        if (priorityDiff !== 0) return priorityDiff;
      }

      // If priorities are equal or both are clean, sort by report date (most recent first)
      return new Date(b.reportedAt) - new Date(a.reportedAt);
    });

    return filteredList;
  }, [reports, filterSelection]);

  // Calculate pagination details based on filtered/sorted list
  const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
  const pageItems = filteredAndSorted.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );

  // 5) Photo upload
  const pickOrTakePhoto = () => {
    Alert.alert('Select Profile Photo', 'Choose an image source:', [
      { text: 'Camera', onPress: () => launchCamera({ mediaType: 'photo', quality: 0.7, maxWidth: 512, maxHeight: 512 }, handleImage) },
      { text: 'Library', onPress: () => launchImageLibrary({ mediaType: 'photo', quality: 0.7, maxWidth: 512, maxHeight: 512 }, handleImage) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleImage = async (response) => {
    if (response.didCancel) {
      console.log('User cancelled image picker');
      return;
    }
    if (response.errorCode) {
      console.error('ImagePicker Error: ', response.errorCode, response.errorMessage);
      Alert.alert('Image Error', response.errorMessage || 'Could not select image.');
      return;
    }
    const asset = response.assets?.[0];
    if (!asset?.uri) {
      console.error('ImagePicker Error: No asset URI found in response', response);
      Alert.alert('Image Error', 'Could not get image URI.');
      return;
    }

    console.log('Image selected:', asset.uri, 'Type:', asset.type, 'Filename:', asset.fileName);
    setUploading(true);

    try {
        if (!SERVER_URL || !BUCKET_NAME) {
            throw new Error("Client-side configuration error: Missing Server URL or Bucket Name.");
        }

        const fileExtension = asset.fileName?.split('.').pop() || 'jpg';
        const safeUserEmail = userEmail.replace(/[^a-zA-Z0-9_-]/g, '_'); // Make email safe for filename
        const uniqueFilename = `${safeUserEmail}_${Date.now()}.${fileExtension}`;
        const fileType = asset.type || 'image/jpeg'; // Provide a default MIME type

        // 5a) Get presigned URL from backend
        console.log(`Requesting presigned URL for: ${uniqueFilename}, Type: ${fileType}`);
        const presignResponse = await fetch(
            `${SERVER_URL}/s3/presign?filename=${encodeURIComponent(uniqueFilename)}&type=${encodeURIComponent(fileType)}`
        );

        if (!presignResponse.ok) {
            const errorBody = await presignResponse.text(); // Read error details
            console.error(`Presign request failed: ${presignResponse.status}`, errorBody);
            throw new Error(`Failed to get upload URL (Status: ${presignResponse.status}). Check server logs.`);
        }

        const { url: presignedUrl } = await presignResponse.json();
        console.log('Received presigned URL:', presignedUrl);
        if (!presignedUrl) {
            throw new Error("Received invalid presigned URL from server.");
        }

        // 5b) Convert image URI to Blob
        const blob = await uriToBlob(asset.uri);
        console.log('Blob created, size:', blob.size);

        // 5c) Upload Blob to S3 using the presigned URL
        console.log('Uploading blob to S3...');
        const uploadResponse = await fetch(presignedUrl, {
            method: 'PUT',
            headers: {
            'Content-Type': fileType,
            // 'x-amz-acl': 'public-read' // <-- REMOVED THIS HEADER
            },
            body: blob,
        });

        if (!uploadResponse.ok) {
            const errorBody = await uploadResponse.text(); // Get error details from S3
            console.error(`S3 Upload failed: ${uploadResponse.status}`, errorBody);
            throw new Error(`Upload failed with status ${uploadResponse.status}. Check S3 permissions and bucket policy.`);
        }

        console.log('S3 Upload successful!');

        // 5d) Construct the public URL (ensure region is correct)
        const publicUrl = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/profile-photos/${uniqueFilename}`;
        console.log('Constructed public URL:', publicUrl);

        // 5e) Update Firebase user profile
        console.log('Updating Firebase profile with new photoURL...');
        await updateProfile(auth.currentUser, { photoURL: publicUrl });
        console.log('Firebase profile updated successfully.');

        // 5f) Update local state to show the new image immediately
        // Add timestamp to force refresh/bypass cache
        setProfilePhotoUri(`${publicUrl}?t=${Date.now()}`);
        setShowProfileModal(false); // Close modal on success

    } catch (err) {
        console.error('Upload process error:', err);
        Alert.alert('Upload Error', `Failed to upload profile picture: ${err.message}`);
    } finally {
        setUploading(false);
    }
  };

  // 6) Open location in Maps app
  const openInGoogleMaps = (lat, lon) => {
    const label = 'Litter Report Location';
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${encodeURIComponent(label)}&ll=${lat},${lon}`,
      android: `geo:${lat},${lon}?q=${lat},${lon}(${encodeURIComponent(label)})`,
    });
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

    Linking.canOpenURL(url)
      .then(supported => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          console.warn("Cannot open native map app, falling back to web URL");
          return Linking.openURL(webUrl);
        }
      })
      .catch(err => {
        console.error('Error opening map URL:', err);
        Alert.alert('Error', 'Could not open map application.');
        // Fallback just in case canOpenURL throws an error itself
        Linking.openURL(webUrl).catch(e => console.error("Fallback web map open failed:", e));
      });
  };

  // 7) Render a single report item
  const renderReport = ({ item }) => {
    const latitude = parseFloat(item.latitude);
    const longitude = parseFloat(item.longitude);
    const hasValidCoords = isValidLatLng(latitude, longitude);
    const mapRegion = hasValidCoords ? {
      latitude: latitude,
      longitude: longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    } : null;

    // Determine priority style
    const priorityStyle = item.isClean
      ? styles.priorityClean
      : styles[`priority${item.priority?.charAt(0).toUpperCase() + item.priority?.slice(1)}`] || styles.priorityLow; // Default style if priority is missing/invalid

    return (
      <View style={styles.reportCard}>
        <View style={styles.reportRow}>
          {/* Text Details */}
          <View style={styles.reportTextContainer}>
            {['Town', 'County', 'Country', 'Email'].map(field => (
              <Text key={field} style={styles.row} numberOfLines={1} ellipsizeMode="tail">
                <Text style={styles.label}>{field}: </Text>
                <Text style={styles.value}>
                  {/* Handle potential null/undefined/error strings */}
                  {item[field.toLowerCase()] && !String(item[field.toLowerCase()]).includes('Error')
                    ? item[field.toLowerCase()]
                    : 'N/A'}
                </Text>
              </Text>
            ))}
            {/* Priority or Cleaned Status */}
            <Text style={styles.row}>
              <Text style={styles.label}>{item.isClean ? 'Status: ' : 'Priority: '}</Text>
              <Text style={[styles.value, priorityStyle]}>
                {item.isClean ? 'Cleaned' : item.priority?.toUpperCase() || 'N/A'}
              </Text>
            </Text>
            {/* Reported Date */}
            <Text style={styles.row}>
              <Text style={styles.label}>Reported: </Text>
              <Text style={styles.value}>
                {item.reportedAt ? new Date(item.reportedAt).toLocaleDateString() : 'N/A'}
              </Text>
            </Text>
          </View>

          {/* Map View */}
          <View style={styles.reportMapContainer}>
            {hasValidCoords && REACT_APP_GOOGLE_MAPS_API_KEY ? (
              <TouchableOpacity
                style={styles.mapTouchable}
                onPress={() => openInGoogleMaps(latitude, longitude)}
                activeOpacity={0.7}>
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.reportMap}
                  region={mapRegion}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  toolbarEnabled={false} // Hide Google logo/buttons
                  liteMode={true} // Use lite mode for static map performance
                >
                  <Marker coordinate={{ latitude, longitude }} pinColor="red" />
                </MapView>
              </TouchableOpacity>
            ) : (
              <View style={styles.noLocationContainer}>
                <Text style={styles.noLocationText}>
                  {REACT_APP_GOOGLE_MAPS_API_KEY ? 'No Location Data' : 'Map Unavailable'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Action Buttons (Delete) */}
        <View style={styles.reportButtons}>
          {!item.isClean && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#FF5252' }]} // Use a distinct delete color
              onPress={() => deleteReport(item._id)}>
              <Text style={styles.actionButtonText}>Delete</Text>
            </TouchableOpacity>
          )}
          {/* Add other buttons like 'Mark as Clean' here if needed */}
        </View>
      </View>
    );
  };

  // 8) Render the Profile Modal
  const renderProfileModal = () => (
    <Modal
      visible={showProfileModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowProfileModal(false)} // Allow closing with back button on Android
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPressOut={() => setShowProfileModal(false)} // Close when tapping outside
      >
        <TouchableOpacity activeOpacity={1} style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
            {/* Prevent closing when tapping inside modal */}
            <Text style={styles.modalHeader}>Your Profile</Text>

            {/* Profile Picture Area */}
            <View style={styles.profilePhotoContainer}>
              {uploading ? (
                <ActivityIndicator size="large" color="#03DAC6" />
              ) : profilePhotoUri ? (
                <Image source={{ uri: profilePhotoUri }} style={styles.profilePhotoLarge} />
              ) : (
                <View style={[styles.profilePhotoLarge, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarPlaceholderText}>
                    {userEmail ? userEmail.charAt(0).toUpperCase() : '?'}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.profileEmail} numberOfLines={1} ellipsizeMode="tail">{userEmail || 'Loading email...'}</Text>

            {/* Buttons */}
            <TouchableOpacity style={styles.modalButton} onPress={pickOrTakePhoto} disabled={uploading}>
              <Text style={styles.modalButtonText}>
                {uploading ? 'Uploading...' : (profilePhotoUri ? 'Change Photo' : 'Add Photo')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.logoutModalButton]}
              onPress={() => {
                signOut(auth)
                  .then(() => {
                    console.log("User signed out successfully.");
                    // Auth listener should handle navigation to Login
                    setShowProfileModal(false); // Close modal after initiating sign out
                  })
                  .catch((error) => {
                    console.error("Sign out error:", error);
                    Alert.alert("Logout Error", "Could not sign out.");
                  });
              }}
            >
              <Text style={styles.modalButtonText}>Logout</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => setShowProfileModal(false)}
            >
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
       </TouchableOpacity>
    </Modal>
  );

  // ----- 9) Main Component Render -----
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1E1E" />

      {/* Top Navbar */}
      <View style={styles.navbar}>
        <Text style={styles.navbarTitle}>Dashboard</Text>
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={() => setShowProfileModal(true)}
          disabled={!userEmail} // Disable if email hasn't loaded yet
        >
          {profilePhotoUri ? (
            <Image source={{ uri: profilePhotoUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarPlaceholderText}>
                {userEmail ? userEmail.charAt(0).toUpperCase() : ''}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Filter Buttons */}
      <View style={styles.filterBar}>
        {['all', 'high', 'medium', 'low', 'clean'].map(key => {
          const label = key.charAt(0).toUpperCase() + key.slice(1);
          // Calculate count based on the *original* reports state for consistency
          const count = useMemo(() => {
            if (key === 'all') return reports.length;
            return reports.filter(r =>
              key === 'clean' ? r.isClean : (!r.isClean && r.priority === key)
            ).length;
          }, [reports, key]); // Recalculate only if reports or key changes

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterButton,
                key !== 'all' && styles[`filterButton${label}`], // Apply specific styles if they exist
                filterSelection === key && styles.filterButtonActive, // Highlight active filter
              ]}
              onPress={() => {
                  setCurrentPage(0); // Reset to first page when changing filter
                  setFilterSelection(key);
              }}
              disabled={loading} // Disable filters while loading
            >
              <Text style={[styles.filterButtonText, filterSelection === key && styles.filterButtonTextActive]}>
                {label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Reports List Area */}
      <View style={styles.listArea}>
        {loading && reports.length === 0 ? ( // Show loader only on initial load or full refresh
          <ActivityIndicator style={styles.loader} size="large" color="#1E90FF" />
        ) : !filteredAndSorted.length ? ( // Check if the *filtered* list is empty
          <Text style={styles.noReportsText}>
            {userEmail ? `No reports match the '${filterSelection}' filter.` : 'Please log in to view reports.'}
          </Text>
        ) : (
          <FlatList
            data={pageItems}
            keyExtractor={item => item._id} // Ensure IDs are unique strings
            renderItem={renderReport}
            contentContainerStyle={styles.reportList}
            initialNumToRender={itemsPerPage} // Render enough for the first screen
            maxToRenderPerBatch={itemsPerPage} // Render batches matching page size
            windowSize={5} // Render items within 5 viewports (adjust based on performance)
            removeClippedSubviews={Platform.OS === 'android'} // Can improve performance on Android, test carefully
            ListEmptyComponent={!loading ? <Text style={styles.noReportsText}>No reports found.</Text> : null}
          />
        )}
      </View>

      {/* Pagination Controls */}
      {!loading && filteredAndSorted.length > itemsPerPage && (
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.pageButton, currentPage === 0 && styles.disabledButton]}
            disabled={currentPage === 0}
            onPress={() => setCurrentPage(p => Math.max(p - 1, 0))}
          >
            <Text style={styles.pageButtonText}>Prev</Text>
          </TouchableOpacity>
          <Text style={styles.pageInfo}>Page {currentPage + 1} of {totalPages}</Text>
          <TouchableOpacity
            style={[styles.pageButton, currentPage >= totalPages - 1 && styles.disabledButton]}
            disabled={currentPage >= totalPages - 1}
            onPress={() => setCurrentPage(p => Math.min(p + 1, totalPages - 1))}
          >
            <Text style={styles.pageButtonText}>Next</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom Navigation Buttons */}
      <View style={styles.bottomButtonContainer}>
        <TouchableOpacity
            style={[styles.reportButton, { backgroundColor: '#03DAC6' }]} // Cleaner Tasks button style
            onPress={() => navigation.navigate('CleanerTasks')} // Ensure 'CleanerTasks' route exists
        >
          <Text style={[styles.reportButtonText, { color: '#121212' }]}>View Cleanup Tasks</Text>
        </TouchableOpacity>
        <TouchableOpacity
            style={styles.reportButton} // Report Litter button style
            onPress={() => navigation.navigate('Map')} // Ensure 'Map' route exists for reporting
        >
          <Text style={styles.reportButtonText}>Report Litter Now</Text>
        </TouchableOpacity>
      </View>

      {/* Profile Modal */}
      {renderProfileModal()}
    </View>
  );
};

export default Dashboard;