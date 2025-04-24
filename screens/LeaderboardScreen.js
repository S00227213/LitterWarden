// LeaderboardScreen.js

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
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { REACT_APP_SERVER_URL } from '@env'; // Make sure you have this in your .env
import styles from './LeaderboardScreenStyles';

// Crown icon – place a crown.png into your project's assets folder
const crownIcon = require('../assets/crown.png');

const LeaderboardScreen = ({ navigation }) => {
  const SERVER_URL = REACT_APP_SERVER_URL;
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    if (!SERVER_URL) {
      setError('Server URL is not configured. Please check environment variables.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!refreshing) setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${SERVER_URL}/leaderboard`);
      if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) {
        console.error("Invalid data format received from /leaderboard:", data);
        throw new Error('Received invalid data format from server.');
      }
      setLeaderboardData(data);
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      setError(`Failed to load leaderboard: ${err.message}`);
      setLeaderboardData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [SERVER_URL, refreshing]);

  useFocusEffect(
    useCallback(() => {
      fetchLeaderboard();
    }, [fetchLeaderboard])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLeaderboard();
  }, [fetchLeaderboard]);

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

  const renderItem = ({ item, index }) => (
    <View style={styles.itemRow}>
      <View style={styles.rankContainer}>
        {index === 0 && <Image source={crownIcon} style={styles.crown} />}
        <Text style={[styles.itemText, styles.rank]}>{index + 1}</Text>
      </View>
      <Text
        style={[styles.itemText, styles.user]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {item.email || item._id || 'Unknown User'}
      </Text>
      <Text style={[styles.itemText, styles.count]}>
        {item.totalReports ?? 'N/A'}
      </Text>
      <Text style={[styles.itemText, styles.count, styles.priorityHigh]}>
        {item.highPriority ?? 0}
      </Text>
      <Text style={[styles.itemText, styles.count, styles.priorityMedium]}>
        {item.mediumPriority ?? 0}
      </Text>
      <Text style={[styles.itemText, styles.count, styles.priorityLow]}>
        {item.lowPriority ?? 0}
      </Text>
    </View>
  );

  const renderContent = () => {
    if (loading && !refreshing) {
      return <ActivityIndicator size="large" color="#03DAC6" style={styles.loader} />;
    }
    if (error) {
      return <Text style={styles.errorText}>{error}</Text>;
    }
    if (!leaderboardData.length) {
      return <Text style={styles.emptyText}>No leaderboard data available yet.</Text>;
    }
    return (
      <FlatList
        data={leaderboardData}
        renderItem={renderItem}
        keyExtractor={(item) => item._id || String(Math.random())}
        ListHeaderComponent={renderListHeader}
        contentContainerStyle={styles.listContentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#03DAC6"]}
            tintColor={"#03DAC6"}
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
