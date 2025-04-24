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
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import {
  REACT_APP_GOOGLE_MAPS_API_KEY,
  REACT_APP_SERVER_URL,
} from '@env';
import styles from './DashboardScreenStyles';

if (!REACT_APP_GOOGLE_MAPS_API_KEY) {
  console.warn('[Dashboard] Google Maps API key missing.');
}
if (!REACT_APP_SERVER_URL) {
  console.warn('[Dashboard] Server URL missing.');
}

// Simple lat/lng validation
const isValidLatLng = (lat, lon) => {
  const pLat = parseFloat(lat);
  const pLon = parseFloat(lon);
  return (
    !Number.isNaN(pLat) &&
    !Number.isNaN(pLon) &&
    Math.abs(pLat) <= 90 &&
    Math.abs(pLon) <= 180
  );
};

const Dashboard = ({ navigation }) => {
  const SERVER_URL = REACT_APP_SERVER_URL;

  // Reports state
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // User/profile state
  const [userEmail, setUserEmail] = useState('');
  const [profilePhotoUri, setProfilePhotoUri] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Pagination & filter
  const [currentPage, setCurrentPage] = useState(0);
  const [filterSelection, setFilterSelection] = useState('all');
  const itemsPerPage = 9;

  // Profile modal
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Open native maps
  const openInGoogleMaps = (lat, lon) => {
    const label = 'Litter Report';
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?q=${encodeURIComponent(label)}&ll=${lat},${lon}`
        : `geo:0,0?q=${lat},${lon}(${encodeURIComponent(label)})`;

    Linking.canOpenURL(url)
      .then((supported) =>
        supported
          ? Linking.openURL(url)
          : Linking.openURL(
              `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
            )
      )
      .catch(() => Alert.alert('Error', 'Could not open map.'));
  };

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setUserEmail(user.email);
      else {
        setUserEmail('');
        setReports([]);
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Fetch reports
  const fetchReports = useCallback(async () => {
    if (!userEmail) {
      setReports([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(
        `${SERVER_URL}/reports?email=${encodeURIComponent(
          userEmail
        )}&includeClean=true`
      );
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const data = await resp.json();
      setReports(Array.isArray(data) ? data : []);
      setCurrentPage(0);
    } catch (err) {
      Alert.alert('Fetch Error', err.message);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useFocusEffect(
    useCallback(() => {
      if (userEmail) fetchReports();
      else setLoading(false);
    }, [userEmail, fetchReports])
  );

  // Delete report
  const deleteReport = useCallback(
    (id) => {
      Alert.alert('Delete Report?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const resp = await fetch(`${SERVER_URL}/report/${id}`, {
                method: 'DELETE',
              });
              if (!resp.ok) throw new Error(`Status ${resp.status}`);
              setReports((r) => r.filter((x) => x._id !== id));
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

  // Filter & sort
  const filteredAndSorted = useMemo(() => {
    const order = { high: 3, medium: 2, low: 1 };
    let list = [...reports];
    if (filterSelection === 'clean') list = list.filter((r) => r.isClean);
    else if (['high', 'medium', 'low'].includes(filterSelection))
      list = list.filter((r) => !r.isClean && r.priority === filterSelection);
    list.sort((a, b) => {
      if (!a.isClean && b.isClean) return -1;
      if (a.isClean && !b.isClean) return 1;
      if (!a.isClean && !b.isClean)
        return (order[b.priority] || 0) - (order[a.priority] || 0);
      return new Date(b.reportedAt) - new Date(a.reportedAt);
    });
    return list;
  }, [reports, filterSelection]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
  const pageItems = filteredAndSorted.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );

  const handleFilter = (sel) => {
    setFilterSelection(sel);
    setCurrentPage(0);
  };

  // Pick or take photo, then presign + upload
  const pickOrTakePhoto = () => {
    Alert.alert('Select Photo', 'Choose source', [
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

  // Handle image-picker response
  const handleImage = async (res) => {
    if (res.didCancel) return;
    if (res.errorCode) return Alert.alert('Error', res.errorMessage);
    const asset = res.assets && res.assets[0];
    if (!asset?.uri) return;

    setUploading(true);
    try {
      // Fetch blob
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      // Generate a safe filename
      const ext = (asset.fileName || 'photo.jpg').split('.').pop();
      const safeName = `${userEmail.replace(/[@.]/g, '_')}_${Date.now()}.${ext}`;

      // 1) Get presigned URL
      const presignResp = await fetch(
        `${SERVER_URL}/s3/presign?filename=${encodeURIComponent(safeName)}&type=${encodeURIComponent(blob.type)}`
      );
      if (!presignResp.ok)
        throw new Error(`Presign failed: ${presignResp.status}`);
      const { url: presignedUrl } = await presignResp.json();

      // 2) PUT to S3
      const putResp = await fetch(presignedUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': blob.type },
      });
      if (!putResp.ok)
        throw new Error(`Upload failed: ${putResp.status}`);

      // 3) Derive public URL (strip query params)
      const publicUrl = presignedUrl.split('?')[0];
      setProfilePhotoUri(publicUrl);
    } catch (err) {
      console.error(err);
      Alert.alert('Upload Error', err.message);
    } finally {
      setUploading(false);
    }
  };

  // Render a single report
  const renderReport = ({ item }) => {
    const lat = parseFloat(item.latitude);
    const lon = parseFloat(item.longitude);
    const valid = isValidLatLng(lat, lon);
    const region = valid
      ? { latitude: lat, longitude: lon, latitudeDelta: 0.01, longitudeDelta: 0.01 }
      : null;
    const prioStyle = item.isClean
      ? styles.priorityClean
      : styles[`priority${item.priority[0].toUpperCase() + item.priority.slice(1)}`];

    return (
      <View style={styles.reportCard}>
        <View style={styles.reportRow}>
          <View style={styles.reportTextContainer}>
            {['Town', 'County', 'Country', 'Email'].map((f) => (
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
              <Text style={styles.value}>{new Date(item.reportedAt).toLocaleDateString()}</Text>
            </Text>
          </View>
          <View style={styles.reportMapContainer}>
            {valid && REACT_APP_GOOGLE_MAPS_API_KEY ? (
              <TouchableOpacity style={styles.mapTouchable} onPress={() => openInGoogleMaps(lat, lon)} activeOpacity={0.7}>
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
                <Text style={styles.noLocationText}>{valid ? 'Map N/A' : 'No location'}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.reportButtons}>
          {!item.isClean && (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#FF5252' }]} onPress={() => deleteReport(item._id)}>
              <Text style={styles.actionButtonText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Profile modal
  const renderProfileModal = () =>
    showProfileModal && (
      <Modal visible transparent animationType="slide" onRequestClose={() => setShowProfileModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalHeader}>Your Profile</Text>
            {uploading ? (
              <ActivityIndicator size="large" color="#03DAC6" style={{ marginVertical: 20 }} />
            ) : profilePhotoUri ? (
              <Image source={{ uri: profilePhotoUri }} style={styles.profilePhotoLarge} />
            ) : (
              <View style={[styles.profilePhotoLarge, styles.avatarPlaceholder]}>
                <Text style={styles.avatarPlaceholderText}>{userEmail.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.profileEmail}>{userEmail}</Text>
            <TouchableOpacity style={styles.modalButton} onPress={pickOrTakePhoto}>
              <Text style={styles.modalButtonText}>{profilePhotoUri ? 'Change Photo' : 'Add Photo'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.logoutModalButton]} onPress={() => { auth.signOut(); setShowProfileModal(false); }}>
              <Text style={styles.modalButtonText}>Logout</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setShowProfileModal(false)}>
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1E1E" />

      {/* Navbar */}
      <View style={styles.navbar}>
        <Text style={styles.navbarTitle}>Dashboard</Text>
        <TouchableOpacity style={styles.avatarContainer} onPress={() => setShowProfileModal(true)}>
          {profilePhotoUri ? (
            <Image source={{ uri: profilePhotoUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarPlaceholderText}>{userEmail.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Filter Bar */}
      <View style={styles.filterBar}>
        <TouchableOpacity style={[styles.filterButton, filterSelection === 'all' && styles.filterButtonActive]} onPress={() => handleFilter('all')}>
          <Text style={[styles.filterButtonText, filterSelection === 'all' && styles.filterButtonTextActive]}>All ({reports.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterButton, styles.filterButtonHigh, filterSelection === 'high' && styles.filterButtonActive]} onPress={() => handleFilter('high')}>
          <Text style={[styles.filterButtonText, filterSelection === 'high' && styles.filterButtonTextActive]}>High ({reports.filter(r => !r.isClean && r.priority === 'high').length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterButton, styles.filterButtonMedium, filterSelection === 'medium' && styles.filterButtonActive]} onPress={() => handleFilter('medium')}>
          <Text style={[styles.filterButtonText, filterSelection === 'medium' && styles.filterButtonTextActive]}>Medium ({reports.filter(r => !r.isClean && r.priority === 'medium').length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterButton, styles.filterButtonLow, filterSelection === 'low' && styles.filterButtonActive]} onPress={() => handleFilter('low')}>
          <Text style={[styles.filterButtonText, filterSelection === 'low' && styles.filterButtonTextActive]}>Low ({reports.filter(r => !r.isClean && r.priority === 'low').length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.filterButton, styles.filterButtonClean, filterSelection === 'clean' && styles.filterButtonActive]} onPress={() => handleFilter('clean')}>
          <Text style={[styles.filterButtonText, filterSelection === 'clean' && styles.filterButtonTextActive]}>Clean ({reports.filter(r => r.isClean).length})</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.listArea}>
        {loading && !reports.length ? (
          <ActivityIndicator style={styles.loader} size="large" color="#1E90FF" />
        ) : !loading && !filteredAndSorted.length ? (
          <Text style={styles.noReportsText}>{userEmail ? `No reports for '${filterSelection}'.` : 'Please log in.'}</Text>
        ) : (
          <FlatList
            data={pageItems}
            keyExtractor={(i) => i._id}
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
      {!loading && filteredAndSorted.length > itemsPerPage && totalPages > 1 && (
        <View style={styles.pagination}>
          <TouchableOpacity style={[styles.pageButton, currentPage === 0 && styles.disabledButton]} disabled={currentPage === 0} onPress={() => setCurrentPage(p => Math.max(p - 1, 0))}>
            <Text style={styles.pageButtonText}>Prev</Text>
          </TouchableOpacity>
          <Text style={styles.pageInfo}>Page {currentPage + 1} of {totalPages}</Text>
          <TouchableOpacity style={[styles.pageButton, currentPage >= totalPages - 1 && styles.disabledButton]} disabled={currentPage >= totalPages - 1} onPress={() => setCurrentPage(p => Math.min(p + 1, totalPages - 1))}>
            <Text style={styles.pageButtonText}>Next</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom actions */}
      <View style={styles.bottomButtonContainer}>
        <TouchableOpacity style={[styles.reportButton, { backgroundColor: '#03DAC6' }]} onPress={() => navigation.navigate('CleanerTasks')}>
          <Text style={[styles.reportButtonText, { color: '#121212' }]}>View Cleanup Tasks</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.reportButton} onPress={() => navigation.navigate('Map')}>
          <Text style={styles.reportButtonText}>Report Litter Now</Text>
        </TouchableOpacity>
      </View>

      {/* Profile modal */}
      {renderProfileModal()}
    </View>
  );
};

export default Dashboard;
