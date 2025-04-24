// ReportCard.js (or wherever you render a single report item)
import React from 'react';
import { View, Text, TouchableOpacity /* other imports */ } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Icon from 'react-native-vector-icons/Ionicons'; // <-- Import an Icon component
import styles from './screens/DashboardScreenStyles';
import { REACT_APP_Maps_API_KEY } from '@env';

// ... (isValidLatLng helper function if it's here)

// Assume 'item', 'onPressMap', 'onDelete' are passed as props
const ReportCard = ({ item, onPressMap, onDelete }) => {
  // ... (lat, lon, validCoordinates, initialRegion calculations)

  // --- Check for photo ---
  // V V V V V V V V V V V V V V V V V V V V V V V V V V V V V V V V V V V V
  // *** IMPORTANT: Replace 'item.photoUrl' with the actual field name
  // *** from your report data that indicates a photo exists.
  // *** If it's just a boolean like 'hasPhoto', use 'item.hasPhoto'
  const hasPhoto = item.imageUrl && item.imageUrl.length > 0;  // ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^

  return (
    <View style={styles.reportCard}>
      <View style={styles.reportRow}>
        <View style={styles.reportTextContainer}>

          {/* --- Conditionally render Photo Icon --- */}
          {/* V V V V V V V V V V V V V V V V V V V V V V V V */}
          {hasPhoto && (
            <Icon
              name="camera" // Icon name from Ionicons (or your chosen set)
              size={14}      // Adjust size as needed
              color="#BB86FC" // Adjust color as needed
              style={styles.photoIcon} // Style for positioning
            />
          )}
          {/* ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ */}


          {/* ... (Rest of your Text components for Town, County, etc.) ... */}
           <Text style={styles.row} numberOfLines={1} ellipsizeMode="tail">
             <Text style={styles.label}>Town: </Text>
             {/* ... */}
           </Text>
           {/* ... other Text fields ... */}
           <Text style={styles.row} numberOfLines={1} ellipsizeMode="tail">
             <Text style={styles.label}>Reported: </Text>
              {/* ... */}
           </Text>

        </View>

        {/* ... (Map Container View) ... */}
        <View style={styles.reportMapContainer}>
           {/* ... MapView or No Location Text ... */}
        </View>
      </View>

      {/* ... (Report Buttons View) ... */}
      <View style={styles.reportButtons}>
           {/* ... Delete Button ... */}
      </View>
    </View>
  );
};

// Use React.memo if you haven't already for performance
export default React.memo(ReportCard);