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
import { onAuthStateChanged, updateProfile, signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import {
  REACT_APP_GOOGLE_MAPS_API_KEY,
  REACT_APP_SERVER_URL,
  S3_BUCKET_NAME,
  AWS_REGION as ENV_AWS_REGION,
} from '@env';
import styles from './DashboardScreenStyles';


const uriToBlob = uri =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new Error('Network request failed'));
    xhr.responseType = 'blob';
    xhr.onload = () => resolve(xhr.response);
    xhr.open('GET', uri, true);
    xhr.send(null);
  });

const isValidLatLng = (lat, lon) => {
  const pLat = parseFloat(lat), pLon = parseFloat(lon);
  return !isNaN(pLat) && !isNaN(pLon) && Math.abs(pLat)<=90 && Math.abs(pLon)<=180;
};

const Dashboard = ({ navigation }) => {
  const SERVER_URL = REACT_APP_SERVER_URL;
  const BUCKET_NAME = S3_BUCKET_NAME;
  const AWS_REGION = ENV_AWS_REGION || 'eu-west-1';

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [profilePhotoUri, setProfilePhotoUri] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [filterSelection, setFilterSelection] = useState('all');
  const itemsPerPage = 9;


  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) {
        setUserEmail(user.email);
        if (user.photoURL) {
          setProfilePhotoUri(`${user.photoURL}?t=${Date.now()}`);
        } else {
           setProfilePhotoUri(null);
        }
      } else {
        if (navigation) {
            navigation.replace('Login');
        }
      }
    });
    return unsub;
  }, [navigation]);


  const fetchReports = useCallback(async () => {
    if (!userEmail || !SERVER_URL) return;
    setLoading(true);
    try {
      const resp = await fetch(
        `${SERVER_URL}/reports?email=${encodeURIComponent(userEmail)}&includeClean=true`
      );
      if (!resp.ok) throw new Error(`Server responded with status ${resp.status}`);
      const data = await resp.json();
      setReports(Array.isArray(data) ? data : []);
      setCurrentPage(0);
    } catch (err) {
      console.error("Fetch reports error:", err);
      Alert.alert('Fetch Error', `Could not load reports: ${err.message}`);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [userEmail, SERVER_URL]);


  useFocusEffect(
    useCallback(() => {
      if (userEmail) {
        fetchReports();
      } else {
        setReports([]);
        setLoading(false);
      }
    }, [userEmail, fetchReports])
  );


  const deleteReport = useCallback(
    reportId => {
       if (!SERVER_URL) {
          Alert.alert('Configuration Error', 'Server URL is not configured.');
          return;
       }
      Alert.alert('Delete Report?', 'This action cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const resp = await fetch(`${SERVER_URL}/report/${reportId}`, { method: 'DELETE' });
              if (!resp.ok) {
                  const errorBody = await resp.text();
                  throw new Error(`Server responded with status ${resp.status}. ${errorBody}`);
              }
              setReports(currentReports => currentReports.filter(report => report._id !== reportId));
            } catch (err) {
              console.error("Delete report error:", err);
              Alert.alert('Deletion Failed', `Could not delete report: ${err.message}`);
            } finally {
              setLoading(false);
            }
          }
        }
      ]);
    },
    [SERVER_URL]
  );


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
        const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        if (priorityDiff !== 0) return priorityDiff;
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


  const pickOrTakePhoto = () => {
    Alert.alert('Select Profile Photo', 'Choose image source:', [
      { text:'Camera', onPress:()=>launchCamera({mediaType:'photo', quality:0.7, maxWidth:512, maxHeight:512}, handleImage) },
      { text:'Library', onPress:()=>launchImageLibrary({mediaType:'photo', quality:0.7, maxWidth:512, maxHeight:512}, handleImage) },
      { text:'Cancel', style:'cancel' }
    ]);
  };

  const handleImage = async response => {
    if (response.didCancel) {
        console.log('User cancelled image picker');
        return;
    }
    if (response.errorCode) {
        console.error('ImagePicker Error:', response.errorCode, response.errorMessage);
        Alert.alert('Image Error', response.errorMessage || 'Could not select image.');
        return;
    }
    const asset = response.assets?.[0];
    if (!asset?.uri) {
        console.error('ImagePicker Error: No asset URI found');
        Alert.alert('Image Error', 'Could not get image reference.');
        return;
    }

    setUploading(true);
    try {
        if (!SERVER_URL || !BUCKET_NAME || !AWS_REGION) {
            throw new Error("Client configuration error: Missing S3/Server details.");
        }

        const fileExtension = asset.fileName?.split('.').pop()?.toLowerCase() || 'jpg';
        const safeUserEmail = userEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
        const uniqueFilename = `profile-photos/${safeUserEmail}_${Date.now()}.${fileExtension}`;
        const fileType = asset.type || 'image/jpeg';


        const filenameForPresign = uniqueFilename.split('/').pop();
        console.log(`Requesting presigned URL for: ${filenameForPresign}, Type: ${fileType}`);
        const presignRes = await fetch(
            `${SERVER_URL}/s3/presign?filename=${encodeURIComponent(filenameForPresign)}&type=${encodeURIComponent(fileType)}`
        );
        if (!presignRes.ok) {
            const errorBody = await presignRes.text();
            console.error(`Presign request failed: ${presignRes.status}`, errorBody);
            throw new Error(`Failed to get upload URL (Status: ${presignRes.status}). Check server logs.`);
        }
        const { url: presignedUrl } = await presignRes.json();
        if (!presignedUrl) throw new Error("Invalid presigned URL received.");


        const blob = await uriToBlob(asset.uri);
        console.log('Uploading blob to S3...');
        const uploadRes = await fetch(presignedUrl, {
            method: 'PUT',
            headers: {
            'Content-Type': fileType,

            },
            body: blob
        });
        if (!uploadRes.ok) {
             const errorBody = await uploadRes.text();
             console.error(`S3 Upload failed: ${uploadRes.status}`, errorBody);
             throw new Error(`Upload failed with status ${uploadRes.status}. Check S3 permissions and bucket policy.`);
        }
        console.log('S3 Upload successful!');


        const publicUrl = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${uniqueFilename}`;
        console.log('Constructed public URL:', publicUrl);


        if (!auth.currentUser) throw new Error("User not authenticated to update profile.");
        await updateProfile(auth.currentUser, { photoURL: publicUrl });
        console.log('Firebase profile updated.');


        setProfilePhotoUri(`${publicUrl}?t=${Date.now()}`);
        setShowProfileModal(false);

    } catch (err) {
      console.error('Upload process error:', err);
      Alert.alert('Upload Error', `Failed to upload profile picture: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };


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
        Alert.alert('Map Error', 'Could not open map application.');
        Linking.openURL(webUrl).catch(e => console.error("Web map fallback failed:", e));
      });
  };


  const renderReport = ({ item }) => {
    const lat = parseFloat(item.latitude);
    const lon = parseFloat(item.longitude);
    const isValidCoord = isValidLatLng(lat, lon);
    const mapRegion = isValidCoord ? { latitude: lat, longitude: lon, latitudeDelta: 0.01, longitudeDelta: 0.01 } : null;


    let priorityStyle = styles.priorityLow;
     if (!item.isClean && item.priority) {
        const capitalizedPriority = item.priority.charAt(0).toUpperCase() + item.priority.slice(1);
        priorityStyle = styles[`priority${capitalizedPriority}`] || styles.priorityLow;
     } else if (item.isClean) {
        priorityStyle = styles.priorityClean;
     }

    return (
      <View style={styles.reportCard}>

        <View style={styles.reportRow}>

          <View style={styles.reportTextContainer}>
            {['Town', 'County', 'Country', 'Email'].map(field => (
              <Text key={field} style={styles.row} numberOfLines={1} ellipsizeMode="tail">
                <Text style={styles.label}>{field}: </Text>
                <Text style={styles.value}>

                  {(item[field.toLowerCase()] && !String(item[field.toLowerCase()]).includes('Error'))
                    ? item[field.toLowerCase()] : 'N/A'}
                </Text>
              </Text>
            ))}

            <Text style={styles.row}>
              <Text style={styles.label}>{item.isClean ? 'Status: ' : 'Priority: '}</Text>
              <Text style={[styles.value, priorityStyle]}>
                {item.isClean ? 'Cleaned' : item.priority?.toUpperCase() || 'N/A'}
              </Text>
            </Text>

            <Text style={styles.row}>
              <Text style={styles.label}>Reported: </Text>
              <Text style={styles.value}>
                {item.reportedAt ? new Date(item.reportedAt).toLocaleDateString() : 'N/A'}
              </Text>
            </Text>
          </View>


          <View style={styles.reportMapContainer}>
            {isValidCoord && REACT_APP_GOOGLE_MAPS_API_KEY ? (
              <TouchableOpacity
                style={styles.mapTouchable}
                onPress={() => openInGoogleMaps(lat, lon)}
                activeOpacity={0.7}>
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.reportMap}
                  region={mapRegion}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  toolbarEnabled={false}
                  liteMode={true}
                >
                  <Marker coordinate={{ latitude: lat, longitude: lon }} pinColor="red" />
                </MapView>
              </TouchableOpacity>
            ) : (
              <View style={styles.noLocationContainer}>
                <Text style={styles.noLocationText}>
                   {REACT_APP_GOOGLE_MAPS_API_KEY ? (isValidCoord ? 'Map N/A' : 'No Location') : 'Map Unavailable'}
                </Text>
              </View>
            )}
          </View>
        </View>


        <View style={styles.reportButtons}>
          {!item.isClean && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#FF5252' }]}
              onPress={() => deleteReport(item._id)}>
              <Text style={styles.actionButtonText}>Delete</Text>
            </TouchableOpacity>
          )}

        </View>
      </View>
    );
  };


  const renderProfileModal = () => (
    <Modal
      visible={showProfileModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowProfileModal(false)}
    >
     <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPressOut={() => setShowProfileModal(false)}
      >

        <TouchableOpacity activeOpacity={1} style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalHeader}>Your Profile</Text>


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

            <Text style={styles.profileEmail} numberOfLines={1} ellipsizeMode="tail">{userEmail || 'Loading...'}</Text>


            <TouchableOpacity style={styles.modalButton} onPress={pickOrTakePhoto} disabled={uploading}>
              <Text style={styles.modalButtonText}>
                {uploading ? 'Uploading...' : (profilePhotoUri ? 'Change Photo' : 'Add Photo')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.logoutModalButton]}
              onPress={() => {
                signOut(auth).catch((error) => {
                  console.error("Sign out error:", error);
                  Alert.alert("Logout Error", "Could not sign out.");
                });

                setShowProfileModal(false);
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


  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1E1E" />


      <View style={styles.navbar}>
        <Text style={styles.navbarTitle}>Dashboard</Text>
        <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() => setShowProfileModal(true)}
            disabled={!userEmail}
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


      <View style={styles.filterBar}>
        {['all', 'high', 'medium', 'low', 'clean'].map(key => {
          const label = key.charAt(0).toUpperCase() + key.slice(1);

          const count = useMemo(() => {
             if (key === 'all') return reports.length;
             return reports.filter(r =>
                key === 'clean' ? r.isClean : (!r.isClean && r.priority === key)
             ).length;
          }, [reports, key]);

          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterButton,
                key !== 'all' && styles[`filterButton${label}`],
                filterSelection === key && styles.filterButtonActive,
              ]}
              onPress={() => {
                  setCurrentPage(0);
                  setFilterSelection(key);
              }}
              disabled={loading}
            >
              <Text style={[styles.filterButtonText, filterSelection === key && styles.filterButtonTextActive]}>
                {label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>


      <View style={styles.listArea}>

        {loading && !reports.length ? (
          <ActivityIndicator style={styles.loader} size="large" color="#1E90FF" />
        ) : !filteredAndSorted.length ? (
          <Text style={styles.noReportsText}>

            {userEmail ? `No reports found for '${filterSelection}' filter.` : 'Please log in to view reports.'}
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
            removeClippedSubviews={Platform.OS === 'android'}
            ListEmptyComponent={!loading ? <Text style={styles.noReportsText}>No reports match the filter.</Text> : null}
          />
        )}
      </View>


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


      <View style={styles.bottomButtonContainer}>

        <TouchableOpacity
          style={[styles.reportButton, { backgroundColor: '#BB86FC' }]}
          onPress={() => navigation.navigate('Leaderboard')}
        >
          <Text style={styles.reportButtonText}>View Leaderboard</Text>
        </TouchableOpacity>


        <TouchableOpacity
          style={[styles.reportButton, { backgroundColor:'#03DAC6' }]}
          onPress={() => navigation.navigate('CleanerTasks')}
        >
          <Text style={[styles.reportButtonText, { color:'#121212' }]}>View Cleanup Tasks</Text>
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