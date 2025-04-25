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
import { onAuthStateChanged, updateProfile } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import {
  REACT_APP_GOOGLE_MAPS_API_KEY,
  REACT_APP_SERVER_URL,
  S3_BUCKET_NAME,
} from '@env';
import styles from './DashboardScreenStyles';

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

// Utility: Validate lat/lng
const isValidLatLng = (lat, lon) => {
  const pLat = parseFloat(lat), pLon = parseFloat(lon);
  return !isNaN(pLat) && !isNaN(pLon) && Math.abs(pLat) <= 90 && Math.abs(pLon) <= 180;
};

const Dashboard = ({ navigation }) => {
  const SERVER_URL = REACT_APP_SERVER_URL;
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
    const unsub = onAuthStateChanged(auth, user => {
      if (user) {
        setUserEmail(user.email);
        if (user.photoURL) {
          setProfilePhotoUri(`${user.photoURL}?t=${Date.now()}`); // bust cache
        }
      } else {
        navigation.replace('Login');
      }
    });
    return unsub;
  }, [navigation]);

  // 2) Fetch reports
  const fetchReports = useCallback(async () => {
    if (!userEmail) return;
    setLoading(true);
    try {
      const resp = await fetch(
        `${SERVER_URL}/reports?email=${encodeURIComponent(userEmail)}&includeClean=true`
      );
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const data = await resp.json();
      setReports(Array.isArray(data) ? data : []);
      setCurrentPage(0);
    } catch (err) {
      Alert.alert('Fetch Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [userEmail, SERVER_URL]);

  useFocusEffect(
    useCallback(() => {
      if (userEmail) fetchReports();
      else setLoading(false);
    }, [userEmail, fetchReports])
  );

  // 3) Delete a report
  const deleteReport = useCallback(
    reportId => {
      Alert.alert('Delete Report?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const resp = await fetch(`${SERVER_URL}/report/${reportId}`, { method: 'DELETE' });
              if (!resp.ok) throw new Error(`Status ${resp.status}`);
              setReports(r => r.filter(x => x._id !== reportId));
            } catch (err) {
              Alert.alert('Error', err.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]);
    },
    [SERVER_URL]
  );

  // 4) Filter & sort reports
  const filteredAndSorted = useMemo(() => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    let list = [...reports];

    if (filterSelection === 'clean') {
      list = list.filter(r => r.isClean);
    } else if (['high', 'medium', 'low'].includes(filterSelection)) {
      list = list.filter(r => !r.isClean && r.priority === filterSelection);
    }

    list.sort((a, b) => {
      if (!a.isClean && b.isClean) return -1;
      if (a.isClean && !b.isClean) return 1;
      if (!a.isClean && !b.isClean) {
        return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
      }
      return new Date(b.reportedAt) - new Date(a.reportedAt);
    });

    return list;
  }, [reports, filterSelection]);

  const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
  const pageItems = filteredAndSorted.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );

  // 5) Profile photo upload
  const pickOrTakePhoto = () => {
    Alert.alert('Select Profile Photo', 'Choose image source:', [
      {
        text: 'Camera',
        onPress: () =>
          launchCamera(
            { mediaType: 'photo', quality: 0.7, maxWidth: 512, maxHeight: 512 },
            handleImage
          ),
      },
      {
        text: 'Library',
        onPress: () =>
          launchImageLibrary(
            { mediaType: 'photo', quality: 0.7, maxWidth: 512, maxHeight: 512 },
            handleImage
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleImage = async response => {
    if (response.didCancel) return;
    if (response.errorMessage) return Alert.alert('Image Error', response.errorMessage);
    const asset = response.assets?.[0];
    if (!asset?.uri) return;

    setUploading(true);
    try {
      const ext = asset.fileName?.split('.').pop() || 'jpg';
      const safeEmail = userEmail.replace(/[@.]/g, '_');
      const filename = `${safeEmail}_${Date.now()}.${ext}`;

      // a) Get presigned URL
      const presignRes = await fetch(
        `${SERVER_URL}/s3/presign?filename=${encodeURIComponent(filename)}&type=${encodeURIComponent(
          asset.type
        )}`
      );
      if (!presignRes.ok) throw new Error(`Presign failed ${presignRes.status}`);
      const { url: presignedUrl } = await presignRes.json();

      // b) Upload blob
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

      // c) Update Firebase profile
      const publicUrl = `https://${S3_BUCKET_NAME}.s3.eu-west-1.amazonaws.com/${filename}`;
      await updateProfile(auth.currentUser, { photoURL: publicUrl });

      // d) Show instantly
      setProfilePhotoUri(`${publicUrl}?t=${Date.now()}`);
      setShowProfileModal(false);
    } catch (err) {
      Alert.alert('Upload Error', err.message);
    } finally {
      setUploading(false);
    }
  };

  // 6) Open native maps
  const openInGoogleMaps = (lat, lon) => {
    const label = 'Litter Report';
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?q=${encodeURIComponent(label)}&ll=${lat},${lon}`
        : `geo:0,0?q=${lat},${lon}(${encodeURIComponent(label)})`;

    Linking.canOpenURL(url)
      .then(supported =>
        supported
          ? Linking.openURL(url)
          : Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`)
      )
      .catch(() => Alert.alert('Error', 'Could not open map.'));
  };

  // 7) Render a single report card
  const renderReport = ({ item }) => {
    const lat = parseFloat(item.latitude);
    const lon = parseFloat(item.longitude);
    const valid = isValidLatLng(lat, lon);
    const region =
      valid && { latitude: lat, longitude: lon, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    const prioStyle = item.isClean
      ? styles.priorityClean
      : styles[`priority${item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}`];

    return (
      <View style={styles.reportCard}>
        <View style={styles.reportRow}>
          <View style={styles.reportTextContainer}>
            {['Town', 'County', 'Country', 'Email'].map(f => (
              <Text key={f} style={styles.row} numberOfLines={1} ellipsizeMode="tail">
                <Text style={styles.label}>{f}: </Text>
                <Text style={styles.value}>
                  {item[f.toLowerCase()]?.includes('Error') ? 'N/A' : item[f.toLowerCase()]}
                </Text>
              </Text>
            ))}
            {!item.isClean ? (
              <Text style={styles.row}>
                <Text style={styles.label}>Priority: </Text>
                <Text style={[styles.value, prioStyle]}>{item.priority.toUpperCase()}</Text>
              </Text>
            ) : (
              <Text style={styles.row}>
                <Text style={[styles.label, styles.priorityClean]}>Status: </Text>
                <Text style={[styles.value, styles.priorityClean]}>Cleaned</Text>
              </Text>
            )}
            <Text style={styles.row}>
              <Text style={styles.label}>Reported: </Text>
              <Text style={styles.value}>
                {new Date(item.reportedAt).toLocaleDateString()}
              </Text>
            </Text>
          </View>
          <View style={styles.reportMapContainer}>
            {valid && REACT_APP_GOOGLE_MAPS_API_KEY ? (
              <TouchableOpacity
                style={styles.mapTouchable}
                onPress={() => openInGoogleMaps(lat, lon)}
                activeOpacity={0.7}
              >
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.reportMap}
                  region={region}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  toolbarEnabled={false}
                  liteMode
                >
                  <Marker coordinate={{ latitude: lat, longitude: lon }} pinColor="red" />
                </MapView>
              </TouchableOpacity>
            ) : (
              <View style={styles.noLocationContainer}>
                <Text style={styles.noLocationText}>
                  {valid ? 'Map N/A' : 'No location'}
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

  // 8) Profile modal
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
            <Image source={{ uri: profilePhotoUri }} style={styles.profilePhotoLarge} />
          ) : (
            <View style={[styles.profilePhotoLarge, styles.avatarPlaceholder]}>
              <Text style={styles.avatarPlaceholderText}>
                {userEmail.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.profileEmail}>{userEmail}</Text>
          <TouchableOpacity style={styles.modalButton} onPress={pickOrTakePhoto}>
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
            <Text style={styles.modalButtonText}>Logout</Text>
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

  // 9) Main render
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1E1E" />

      {/* Navbar with Back Arrow */}
      <View style={styles.navbar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.navbarTitle}>Dashboard</Text>
        <TouchableOpacity
          style={styles.avatarContainer}
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
        {['all','high','medium','low','clean'].map(key => {
          const label = key.charAt(0).toUpperCase() + key.slice(1);
          const count =
            key === 'all'
              ? reports.length
              : reports.filter(r =>
                  key === 'clean'
                    ? r.isClean
                    : (!r.isClean && r.priority === key)
                ).length;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterButton,
                key !== 'all' && styles[`filterButton${label}`],
                filterSelection === key && styles.filterButtonActive
              ]}
              onPress={() => setFilterSelection(key)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  filterSelection === key && styles.filterButtonTextActive
                ]}
              >
                {label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List or Loader */}
      <View style={styles.listArea}>
        {loading && !reports.length ? (
          <ActivityIndicator style={styles.loader} size="large" color="#1E90FF" />
        ) : !filteredAndSorted.length ? (
          <Text style={styles.noReportsText}>
            {userEmail ? `No reports for '${filterSelection}'` : 'Please log in.'}
          </Text>
        ) : (
          <FlatList
            data={pageItems}
            keyExtractor={item => item._id}
            renderItem={renderReport}
            contentContainerStyle={styles.reportList}
            initialNumToRender={itemsPerPage}
            maxToRenderPerBatch={itemsPerPage}
            windowSize={5}
            removeClippedSubviews={false}
          />
        )}
      </View>

      {/* Pagination */}
      {!loading && filteredAndSorted.length > itemsPerPage && (
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.pageButton, currentPage === 0 && styles.disabledButton]}
            disabled={currentPage === 0}
            onPress={() => setCurrentPage(p => Math.max(p - 1, 0))}
          >
            <Text style={styles.pageButtonText}>Prev</Text>
          </TouchableOpacity>
          <Text style={styles.pageInfo}>
            Page {currentPage + 1} of {totalPages}
          </Text>
          <TouchableOpacity
            style={[
              styles.pageButton,
              currentPage >= totalPages - 1 && styles.disabledButton
            ]}
            disabled={currentPage >= totalPages - 1}
            onPress={() => setCurrentPage(p => Math.min(p + 1, totalPages - 1))}
          >
            <Text style={styles.pageButtonText}>Next</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom Buttons */}
      <View style={styles.bottomButtonContainer}>
        <TouchableOpacity
          style={[styles.reportButton, styles.leaderboardButton]}
          onPress={() => navigation.navigate('Leaderboard')}
        >
          <Text style={[styles.reportButtonText, { color: '#121212' }]}>
            👑 Leaderboard
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.reportButton, { backgroundColor: '#03DAC6' }]}
          onPress={() => navigation.navigate('CleanerTasks')}
        >
          <Text style={[styles.reportButtonText, { color: '#121212' }]}>
            View Cleanup Tasks
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.reportButton}
          onPress={() => navigation.navigate('Map')}
        >
          <Text style={styles.reportButtonText}>Report Litter Now</Text>
        </TouchableOpacity>
      </View>

      {renderProfileModal()}
    </View>
  );
};

export default Dashboard;
