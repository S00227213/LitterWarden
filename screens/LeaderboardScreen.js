import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { REACT_APP_SERVER_URL } from '@env'; // Make sure you have this in your .env
import styles from './LeaderboardScreenStyles'; // We'll create this next

const LeaderboardScreen = ({ navigation }) => {
  const SERVER_URL = REACT_APP_SERVER_URL;
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Function to fetch leaderboard data from the backend
  const fetchLeaderboard = useCallback(async () => {
    if (!SERVER_URL) {
      setError('Server URL is not configured. Please check environment variables.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Don't set loading to true if just refreshing
    if (!refreshing) {
        setLoading(true);
    }
    setError(null); // Clear previous errors

    try {
      // --- IMPORTANT ---
      // This assumes your backend has an endpoint like '/leaderboard'
      // that returns an array of user objects, sorted by total reports descending.
      // Each object should look something like:
      // {
      //   _id: "user_identifier_or_email", // Unique key for the user
      //   email: "user@example.com",       // Display identifier
      //   totalReports: 15,
      //   highPriority: 5,
      //   mediumPriority: 7,
      //   lowPriority: 3
      // }
      // --- IMPORTANT ---
      const response = await fetch(`${SERVER_URL}/leaderboard`);

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
         console.error("Invalid data format received from /leaderboard:", data);
         throw new Error('Received invalid data format from server.');
      }

      console.log("Fetched leaderboard data:", data.length, "users");
      setLeaderboardData(data);

    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      setError(`Failed to load leaderboard: ${err.message}`);
      setLeaderboardData([]); // Clear data on error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [SERVER_URL, refreshing]); // Dependency on SERVER_URL and refreshing state

  // Fetch data when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchLeaderboard();
    }, [fetchLeaderboard]) // Re-run if fetchLeaderboard function changes (due to SERVER_URL)
  );

  // Handler for pull-to-refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // fetchLeaderboard will be called because 'refreshing' state changes,
    // and fetchLeaderboard depends on it.
    // No need to call fetchLeaderboard() directly here if setup correctly.
    // However, explicitly calling it can be clearer:
    fetchLeaderboard();
  }, [fetchLeaderboard]); // Dependency added

  // Render Header for the FlatList
  const renderListHeader = () => (
    <View style={styles.headerRow}>
      <Text style={[styles.headerText, styles.rankHeader]}>#</Text>
      <Text style={[styles.headerText, styles.userHeader]}>User</Text>
      <Text style={[styles.headerText, styles.countHeader]}>Total</Text>
      <Text style={[styles.headerText, styles.countHeader, styles.priorityHigh]}>H</Text>
      <Text style={[styles.headerText, styles.countHeader, styles.priorityMedium]}>M</Text>
      <Text style={[styles.headerText, styles.countHeader, styles.priorityLow]}>L</Text>
    </View>
  );

  // Render each item in the FlatList
  const renderItem = ({ item, index }) => (
    <View style={styles.itemRow}>
      <Text style={[styles.itemText, styles.rank]}>{index + 1}</Text>
      <Text style={[styles.itemText, styles.user]} numberOfLines={1} ellipsizeMode="tail">
        {item.email || item._id || 'Unknown User'}
      </Text>
      <Text style={[styles.itemText, styles.count]}>{item.totalReports ?? 'N/A'}</Text>
      <Text style={[styles.itemText, styles.count, styles.priorityHigh]}>{item.highPriority ?? 0}</Text>
      <Text style={[styles.itemText, styles.count, styles.priorityMedium]}>{item.mediumPriority ?? 0}</Text>
      <Text style={[styles.itemText, styles.count, styles.priorityLow]}>{item.lowPriority ?? 0}</Text>
    </View>
  );

  // Render Content Area (Loading, Error, Empty, or List)
  const renderContent = () => {
    if (loading && !refreshing) {
      return <ActivityIndicator size="large" color="#03DAC6" style={styles.loader} />;
    }
    if (error) {
      return <Text style={styles.errorText}>{error}</Text>;
    }
    if (!leaderboardData || leaderboardData.length === 0) {
      return <Text style={styles.emptyText}>No leaderboard data available yet.</Text>;
    }

    return (
      <FlatList
        data={leaderboardData}
        renderItem={renderItem}
        keyExtractor={(item) => item._id || String(Math.random())} // Fallback key if _id missing
        ListHeaderComponent={renderListHeader}
        contentContainerStyle={styles.listContentContainer}
        refreshControl={ // Add pull-to-refresh
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#03DAC6"]} // Spinner color
            tintColor={"#03DAC6"} // Spinner color for iOS
          />
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      <View style={styles.container}>
        <Text style={styles.title}>Top Reporters</Text>
        {renderContent()}
      </View>
    </SafeAreaView>
  );
};

export default LeaderboardScreen;