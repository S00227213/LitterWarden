// CleanerInterface.js
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
import { onAuthStateChanged, updateProfile } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import {
  REACT_APP_SERVER_URL,
  REACT_APP_GOOGLE_MAPS_API_KEY,
  S3_BUCKET_NAME,
} from '@env';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import styles from './CleanerInterfaceStyles';

// Utility: Convert file:// URI to Blob
const uriToBlob = uri =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new Error('Network request failed'));
    xhr.responseType = 'blob';
    xhr.onload = () => resolve(xhr.response);
    xhr.open('GET', uri, true);
    xhr.send(null);
  });

const CleanerInterface = () => {
  const navigation = useNavigation();
  const SERVER_URL = REACT_APP_SERVER_URL;

  // Auth & profile
  const [userEmail, setUserEmail] = useState('');
  const [profilePhotoUri, setProfilePhotoUri] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Reports
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [afterPhoto, setAfterPhoto] = useState(null);
  const [filterSelection, setFilterSelection] = useState('all_pending');
  const itemsPerPage = 9;
  const [currentPage, setCurrentPage] = useState(0);

  // 1) Listen for auth state and load profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user) {
        setUserEmail(user.email);
        if (user.photoURL) {
          setProfilePhotoUri(`${user.photoURL}?t=${Date.now()}`);
        }
      } else {
        navigation.replace('Login');
      }
    });
    return () => unsubscribe();
  }, [navigation]);

  // 2) Profile image handler
  const handleProfileImage = async response => {
    if (response.didCancel) return;
    if (response.errorMessage) {
      Alert.alert('Image Error', response.errorMessage);
      return;
    }
    const asset = response.assets?.[0];
    if (!asset?.uri) return;
    setUploading(true);
    try {
      const ext = asset.fileName?.split('.').pop() || 'jpg';
      const safeEmail = userEmail.replace(/[@.]/g, '_');
      const filename = `${safeEmail}_${Date.now()}.${ext}`;
      // a) presign
      const presignRes = await fetch(
        `${SERVER_URL}/s3/presign?filename=${encodeURIComponent(
          filename
        )}&type=${encodeURIComponent(asset.type)}`
      );
      if (!presignRes.ok) throw new Error(`Presign failed ${presignRes.status}`);
      const { url: presignedUrl } = await presignRes.json();
      // b) upload blob
      const blob = await uriToBlob(asset.uri);
      const uploadRes = await fetch(presignedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': asset.type,
          'x-amz-acl': 'public-read',
        },
        body: blob,
      });
      if (!uploadRes.ok) throw new Error(`Upload failed ${uploadRes.status}`);
      // c) update Firebase
      const publicUrl = `https://${S3_BUCKET_NAME}.s3.eu-west-1.amazonaws.com/${filename}`;
      await updateProfile(auth.currentUser, { photoURL: publicUrl });
      // d) update UI
      setProfilePhotoUri(`${publicUrl}?t=${Date.now()}`);
      setShowProfileModal(false);
    } catch (err) {
      Alert.alert('Upload Error', err.message);
    } finally {
      setUploading(false);
    }
  };

  const pickOrTakeProfilePhoto = () => {
    Alert.alert('Select Profile Photo', 'Choose image source:', [
      {
        text: 'Camera',
        onPress: () =>
          launchCamera(
            { mediaType: 'photo', quality: 0.7, maxWidth: 512, maxHeight: 512 },
            handleProfileImage
          ),
      },
      {
        text: 'Library',
        onPress: () =>
          launchImageLibrary(
            { mediaType: 'photo', quality: 0.7, maxWidth: 512, maxHeight: 512 },
            handleProfileImage
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // 3) Fetch reports callback
  const fetchAllReportsForCleaner = useCallback(async () => {
    if (!userEmail) {
      setLoading(false);
      setAllReports([]);
      return;
    }
    if (!SERVER_URL) {
      setError('Configuration Error: Server URL missing.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const url = `${SERVER_URL}/reports?limit=1000&includeClean=true`;
      const response = await fetch(url);
      if (!response.ok) {
        const errorBody = await response.text();
        let detail = errorBody;
        try {
          detail = JSON.parse(errorBody).error || errorBody;
        } catch {}
        throw new Error(
          `HTTP error ${response.status}: ${detail.substring(0, 150)}`
        );
      }
      const data = await response.json();
      const sortedData = (Array.isArray(data) ? data : []).sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1, clean: 0 };
        const pa = a.isClean ? 0 : priorityOrder[a.priority] || 0;
        const pb = b.isClean ? 0 : priorityOrder[b.priority] || 0;
        if (pa !== pb) return pb - pa;
        return new Date(b.reportedAt) - new Date(a.reportedAt);
      });
      setAllReports(sortedData);
      setCurrentPage(0);
    } catch (err) {
      console.error('[CleanerIF] Fetch error:', err);
      setError(`Failed to fetch reports: ${err.message}`);
      setAllReports([]);
    } finally {
      setLoading(false);
    }
  }, [userEmail, SERVER_URL]);

  // 4) Refetch on focus
  useFocusEffect(
    useCallback(() => {
      if (userEmail) fetchAllReportsForCleaner();
      else {
        setAllReports([]);
        setCurrentPage(0);
        setLoading(false);
        setError('User not logged in.');
      }
    }, [userEmail, fetchAllReportsForCleaner])
  );

  // 5) Filters & pagination
  const handleFilterChange = selection => {
    setFilterSelection(selection);
    setCurrentPage(0);
  };

  const filteredReports = useMemo(
    () =>
      allReports.filter(r => {
        if (filterSelection === 'clean') return r.isClean;
        if (filterSelection === 'all_pending') return !r.isClean;
        return !r.isClean && r.priority === filterSelection;
      }),
    [allReports, filterSelection]
  );

  const currentReports = useMemo(
    () =>
      filteredReports.slice(
        currentPage * itemsPerPage,
        (currentPage + 1) * itemsPerPage
      ),
    [filteredReports, currentPage]
  );
  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);

  // 6) Mark clean
  const handleMarkClean = async () => {
    if (!selectedReport || !selectedReport._id) {
      Alert.alert('Error', 'No report selected.');
      return;
    }
    if (!SERVER_URL) {
      Alert.alert('Configuration Error', 'Server URL not configured.');
      return;
    }
    Alert.alert(
      'Confirm Cleanup',
      `Mark report at ${
        selectedReport.town || 'location'
      } as clean?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Clean',
          onPress: async () => {
            setIsSubmitting(true);
            setError('');
            try {
              const url = `${SERVER_URL}/report/clean`;
              const response = await fetch(url, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                },
                body: JSON.stringify({ reportId: selectedReport._id }),
              });
              if (response.ok) {
                Alert.alert('Success', 'Report marked as clean.');
                setAllReports(prev =>
                  prev.map(r =>
                    r._id === selectedReport._id
                      ? {
                          ...r,
                          isClean: true,
                          recognizedCategory: 'Cleaned',
                        }
                      : r
                  )
                );
                const currentFilteredLength = filteredReports.filter(
                  r => r._id !== selectedReport._id
                ).length;
                const totalPagesAfter = Math.ceil(
                  currentFilteredLength / itemsPerPage
                );
                if (currentPage >= totalPagesAfter && totalPagesAfter > 0) {
                  setCurrentPage(totalPagesAfter - 1);
                } else if (
                  currentFilteredLength === 0 &&
                  currentPage > 0
                ) {
                  setCurrentPage(currentPage - 1);
                } else if (currentFilteredLength === 0) {
                  setCurrentPage(0);
                }
                handleCloseModal();
              } else {
                const errorData = await response
                  .json()
                  .catch(() => ({ error: 'Failed to parse error response' }));
                throw new Error(
                  errorData.error || `Server error ${response.status}`
                );
              }
            } catch (err) {
              console.error('[CleanerIF] Mark clean error:', err);
              setError(`Error marking clean: ${err.message}`);
              Alert.alert(
                'Error',
                `Could not mark report as clean. ${err.message}`
              );
            } finally {
              setIsSubmitting(false);
            }
          },
          style: 'default',
        },
      ]
    );
  };

  // 7) Image picker for "after" photo
  const handleImagePickerResponse = useCallback(response => {
    if (response.didCancel) {
      console.log('User cancelled image picker');
    } else if (response.errorCode) {
      console.error('ImagePicker Error: ', response.errorMessage);
      Alert.alert('Image Error', response.errorMessage);
    } else if (response.assets && response.assets.length > 0) {
      setAfterPhoto(response.assets[0]);
    }
  }, []);

  const pickAfterImage = useCallback(() => {
    const options = {
      mediaType: 'photo',
      quality: 0.7,
      maxWidth: 1024,
      maxHeight: 1024,
      saveToPhotos: false,
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
          onPress: () =>
            launchImageLibrary(options, handleImagePickerResponse),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [handleImagePickerResponse]);

  // 8) Select & close detail modal
  const handleSelectReport = report => {
    setSelectedReport(report);
    setAfterPhoto(null);
    setIsModalVisible(true);
    setError('');
  };
  const handleCloseModal = () => {
    setIsModalVisible(false);
    setSelectedReport(null);
    setAfterPhoto(null);
    setIsSubmitting(false);
    setError('');
  };

  // 9) Open in maps
  const openInGoogleMaps = (lat, lon) => {
    const label = 'Litter Report Location';
    let url = '';
    if (isNaN(lat) || isNaN(lon)) {
      Alert.alert('Error', 'Cannot open map link with invalid coordinates.');
      return;
    }
    if (Platform.OS === 'ios') {
      url = `http://maps.apple.com/?q=${encodeURIComponent(
        label
      )}&ll=${lat},${lon}`;
    } else {
      url = `geo:0,0?q=${lat},${lon}(${encodeURIComponent(label)})`;
    }
    Linking.canOpenURL(url)
      .then(supported => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          const webUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
          return Linking.openURL(webUrl);
        }
      })
      .catch(err => {
        console.error('Error opening map link:', err);
        Alert.alert('Error', 'Could not open map application.');
      });
  };

  // 10) Render each report card
  const renderReportItem = ({ item }) => {
    const lat = parseFloat(item.latitude);
    const lon = parseFloat(item.longitude);
    const canAttemptMap = !isNaN(lat) && !isNaN(lon);
    const priorityStyle = item.isClean
      ? styles.priorityClean
      : styles[
          `priority${item.priority.charAt(0).toUpperCase() +
            item.priority.slice(1)}`
        ];
    const priorityText = item.isClean
      ? 'CLEAN'
      : item.priority.toUpperCase();

    return (
      <TouchableOpacity
        style={styles.reportCard}
        onPress={() => handleSelectReport(item)}
        activeOpacity={0.7}
      >
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
            <Text
              style={styles.locationText}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.town &&
              !item.town.includes('Error') &&
              item.town !== 'Unknown'
                ? item.town
                : 'Location'}
              {item.county &&
              !item.county.includes('Error') &&
              item.county !== 'Unknown'
                ? `, ${item.county.substring(0, 10)}..`
                : ''}
            </Text>
            <Text style={styles.coordsText} numberOfLines={1}>
              ({canAttemptMap ? lat.toFixed(2) : 'N/A'},{' '}
              {canAttemptMap ? lon.toFixed(2) : 'N/A'})
            </Text>
            <Text
              style={styles.reporterText}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              By: {item.email || 'Unknown User'}
            </Text>
          </View>
          {canAttemptMap && REACT_APP_GOOGLE_MAPS_API_KEY ? (
            <TouchableOpacity
              style={styles.mapContainer}
              activeOpacity={0.7}
              onPress={() => openInGoogleMaps(lat, lon)}
            >
              <MapView
                key={`mini-${item._id}-${lat}-${lon}`}
                provider={PROVIDER_GOOGLE}
                style={styles.miniMap}
                initialRegion={{
                  latitude: lat,
                  longitude: lon,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                toolbarEnabled={false}
                showsUserLocation={false}
                showsMyLocationButton={false}
              >
                <Marker coordinate={{ latitude: lat, longitude: lon }} />
              </MapView>
            </TouchableOpacity>
          ) : (
            <View style={[styles.mapContainer, styles.noMapContainer]}>
              <Text style={styles.noMapText}>Map N/A</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // 11) Detail modal
  const renderDetailModal = () => {
    if (!isModalVisible || !selectedReport) return null;
    const lat = parseFloat(selectedReport.latitude);
    const lon = parseFloat(selectedReport.longitude);
    const canAttemptMap = !isNaN(lat) && !isNaN(lon);
    const modalMapRegion = canAttemptMap
      ? {
          latitude: lat,
          longitude: lon,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }
      : null;
    const priorityStyle = selectedReport.isClean
      ? styles.priorityClean
      : styles[
          `priority${selectedReport.priority.charAt(0).toUpperCase() +
            selectedReport.priority.slice(1)}`
        ];
    const statusText = selectedReport.isClean
      ? 'CLEAN'
      : selectedReport.priority.toUpperCase();

    return (
      <Modal
        animationType="slide"
        transparent
        visible={isModalVisible}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ScrollView contentContainerStyle={styles.modalScrollView}>
              <Text style={styles.modalTitle}>Cleanup Task Details</Text>
              {error ? (
                <Text style={styles.modalErrorText}>{error}</Text>
              ) : null}
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Status: </Text>
                <Text style={[styles.modalValue, priorityStyle]}>
                  {statusText}
                </Text>
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Location: </Text>
                <Text style={styles.modalValue}>
                  {selectedReport.town &&
                  !selectedReport.town.includes('Error')
                    ? selectedReport.town
                    : 'Unknown Town'}
                  {selectedReport.county &&
                  !selectedReport.county.includes('Error')
                    ? `, ${selectedReport.county}`
                    : ''}
                  {selectedReport.country &&
                  !selectedReport.country.includes('Error')
                    ? `, ${selectedReport.country}`
                    : ''}
                </Text>
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Coordinates: </Text>
                <Text style={styles.modalValue}>
                  {canAttemptMap
                    ? `${lat.toFixed(5)}, ${lon.toFixed(5)}`
                    : 'Invalid Coordinates'}
                </Text>
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Reported By: </Text>
                <Text style={styles.modalValue}>
                  {selectedReport.email || 'Unknown'}
                </Text>
              </Text>
              <Text style={styles.modalDetailRow}>
                <Text style={styles.modalLabel}>Reported At: </Text>
                <Text style={styles.modalValue}>
                  {new Date(selectedReport.reportedAt).toLocaleString()}
                </Text>
              </Text>
              {selectedReport.recognizedCategory &&
                ![
                  'Analysis Pending',
                  'Analysis Skipped',
                ].includes(selectedReport.recognizedCategory) &&
                !selectedReport.isClean && (
                  <Text style={styles.modalDetailRow}>
                    <Text style={styles.modalLabel}>Detected: </Text>
                    <Text style={styles.modalValue}>
                      {selectedReport.recognizedCategory}
                    </Text>
                  </Text>
                )}
              {selectedReport.imageUrl && !selectedReport.isClean && (
                <View style={styles.evidenceSection}>
                  <Text style={styles.modalLabel}>Original Evidence:</Text>
                  <Image
                    source={{ uri: selectedReport.imageUrl }}
                    style={styles.evidenceImage}
                    resizeMode="contain"
                  />
                </View>
              )}
              {!selectedReport.isClean && (
                <View style={styles.evidenceSection}>
                  <Text style={styles.modalLabel}>
                    Photo After Cleanup (Optional):
                  </Text>
                  {afterPhoto ? (
                    <>
                      <Image
                        source={{ uri: afterPhoto.uri }}
                        style={styles.evidenceImage}
                        resizeMode="contain"
                      />
                      <TouchableOpacity
                        style={[
                          styles.modalButton,
                          styles.changePhotoButton,
                        ]}
                        onPress={pickAfterImage}
                        disabled={isSubmitting}
                      >
                        <Text style={styles.modalButtonText}>
                          Change Photo
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={[styles.modalButton, styles.addPhotoButton]}
                      onPress={pickAfterImage}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.modalButtonText}>
                        Add 'After' Photo
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {canAttemptMap && REACT_APP_GOOGLE_MAPS_API_KEY ? (
                <View style={styles.modalMapContainer}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => openInGoogleMaps(lat, lon)}
                  >
                    <MapView
                      key={`modal-${selectedReport._id}-${lat}-${lon}`}
                      provider={PROVIDER_GOOGLE}
                      style={styles.modalMap}
                      initialRegion={modalMapRegion}
                      scrollEnabled
                      zoomEnabled
                      pitchEnabled={false}
                      rotateEnabled={false}
                    >
                      <Marker
                        coordinate={{ latitude: lat, longitude: lon }}
                        title="Report Location"
                      />
                    </MapView>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.modalDetailRow}>
                  Map view unavailable (Invalid Coords or Missing API Key).
                </Text>
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
                  style={[
                    styles.modalButton,
                    styles.confirmButton,
                    isSubmitting && styles.disabledButton,
                  ]}
                  onPress={handleMarkClean}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.modalButtonText}>
                      Mark as Clean
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // 12) Profile modal
  const renderProfileModal = () => (
    <Modal
      visible={showProfileModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowProfileModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalHeader}>Your Profile</Text>
          {uploading ? (
            <ActivityIndicator size="large" color="#03DAC6" />
          ) : profilePhotoUri ? (
            <Image
              source={{ uri: profilePhotoUri }}
              style={styles.profilePhotoLarge}
            />
          ) : (
            <View
              style={[styles.profilePhotoLarge, styles.avatarPlaceholder]}
            >
              <Text style={styles.avatarPlaceholderText}>
                {userEmail.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.profileEmail}>{userEmail}</Text>
          <TouchableOpacity
            style={styles.modalButton}
            onPress={pickOrTakeProfilePhoto}
          >
            <Text style={styles.modalButtonText}>
              {profilePhotoUri ? 'Change Photo' : 'Add Photo'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.logoutModalButton]}
            onPress={() => {
              auth.signOut();
              setShowProfileModal(false);
              navigation.replace('Login');
            }}
          >
            <Text style={styles.modalButtonText}>Sign Out</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.cancelButton]}
            onPress={() => setShowProfileModal(false)}
          >
            <Text style={styles.modalButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // 13) Main render
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1E1E" />

 {/* Header */}
<View style={styles.headerBar}>
  {/* Back button on left */}
  <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
    <Text style={styles.backButtonText}>Back</Text>
  </TouchableOpacity>

  {/* Title centered */}
  <Text style={styles.headerTitle}>Cleanup Tasks</Text>

  {/* Profile avatar on right */}
  <TouchableOpacity
    style={styles.profileButton}
    onPress={() => setShowProfileModal(true)}
  >
    {profilePhotoUri ? (
      <Image source={{ uri: profilePhotoUri }} style={styles.avatar} />
    ) : (
      <View style={[styles.avatar, styles.avatarPlaceholder]}>
        <Text style={styles.avatarPlaceholderText}>
          {userEmail.charAt(0).toUpperCase()}
        </Text>
      </View>
    )}
  </TouchableOpacity>
</View>


      {/* Filters */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filterSelection === 'all_pending' && styles.filterButtonActive,
          ]}
          onPress={() => handleFilterChange('all_pending')}
        >
          <Text
            style={[
              styles.filterButtonText,
              filterSelection === 'all_pending' &&
                styles.filterButtonTextActive,
            ]}
          >
            All Pending ({allReports.filter(r => !r.isClean).length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            styles.filterButtonHigh,
            filterSelection === 'high' && styles.filterButtonActive,
          ]}
          onPress={() => handleFilterChange('high')}
        >
          <Text
            style={[
              styles.filterButtonText,
              filterSelection === 'high' && styles.filterButtonTextActive,
            ]}
          >
            High ({allReports.filter(r => r.priority === 'high' && !r.isClean).length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            styles.filterButtonMedium,
            filterSelection === 'medium' && styles.filterButtonActive,
          ]}
          onPress={() => handleFilterChange('medium')}
        >
          <Text
            style={[
              styles.filterButtonText,
              filterSelection === 'medium' &&
                styles.filterButtonTextActive,
            ]}
          >
            Medium ({allReports.filter(r => r.priority === 'medium' && !r.isClean).length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            styles.filterButtonLow,
            filterSelection === 'low' && styles.filterButtonActive,
          ]}
          onPress={() => handleFilterChange('low')}
        >
          <Text
            style={[
              styles.filterButtonText,
              filterSelection === 'low' && styles.filterButtonTextActive,
            ]}
          >
            Low ({allReports.filter(r => r.priority === 'low' && !r.isClean).length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            styles.filterButtonClean,
            filterSelection === 'clean' && styles.filterButtonActive,
          ]}
          onPress={() => handleFilterChange('clean')}
        >
          <Text
            style={[
              styles.filterButtonText,
              filterSelection === 'clean' && styles.filterButtonTextActive,
            ]}
          >
            Clean ({allReports.filter(r => r.isClean).length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.contentArea}>
        {loading ? (
          <ActivityIndicator
            size="large"
            color="#1E90FF"
            style={styles.loader}
          />
        ) : error && error !== 'User not logged in.' ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={fetchAllReportsForCleaner}
            >
              <Text style={styles.retryButtonText}>Retry Fetch</Text>
            </TouchableOpacity>
          </View>
        ) : !userEmail ? (
          <Text style={styles.noReportsText}>Please log in to view tasks.</Text>
        ) : filteredReports.length === 0 ? (
          <Text style={styles.noReportsText}>
            No{' '}
            {filterSelection === 'all_pending'
              ? 'pending'
              : filterSelection === 'clean'
              ? 'clean'
              : `${filterSelection} priority`}{' '}
            tasks found.
          </Text>
        ) : (
          <FlatList
            data={currentReports}
            keyExtractor={item => item._id.toString()}
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

        {/* Pagination */}
        {!loading && filteredReports.length > 0 && totalPages > 1 && (
          <View style={styles.pagination}>
            <TouchableOpacity
              style={[
                styles.pageButton,
                (currentPage === 0 || loading) && styles.disabledButton,
              ]}
              disabled={currentPage === 0 || loading}
              onPress={() => setCurrentPage(p => Math.max(p - 1, 0))}
            >
              <Text style={styles.pageButtonText}>Previous</Text>
            </TouchableOpacity>
            <Text style={styles.pageInfo}>
              Page {currentPage + 1} of {totalPages}
            </Text>
            <TouchableOpacity
              style={[
                styles.pageButton,
                (currentPage >= totalPages - 1 || loading) &&
                  styles.disabledButton,
              ]}
              disabled={currentPage >= totalPages - 1 || loading}
              onPress={() =>
                setCurrentPage(p => Math.min(p + 1, totalPages - 1))
              }
            >
              <Text style={styles.pageButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {renderDetailModal()}
      {renderProfileModal()}
    </View>
  );
};

export default CleanerInterface;
