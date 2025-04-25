import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StatusBar,
  SafeAreaView,
  RefreshControl,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { REACT_APP_SERVER_URL } from '@env';
import styles from './LeaderboardScreenStyles';
const crownIcon = require('../assets/crown.png');

const LeaderboardScreen = () => {
  const navigation = useNavigation();
  const SERVER_URL = REACT_APP_SERVER_URL;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Fetch leaderboard from backend
  const fetchLeaderboard = useCallback(async () => {
    if (!SERVER_URL) {
      setError('Server URL not configured.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!refreshing) setLoading(true);
    setError(null);

    try {
      const resp = await fetch(`${SERVER_URL}/leaderboard`);
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const json = await resp.json();
      if (!Array.isArray(json)) throw new Error('Invalid response format');
      setData(json);
    } catch (e) {
      setError(e.message);
      setData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [SERVER_URL, refreshing]);

  // Re-fetch when screen focused
  useFocusEffect(
    useCallback(() => {
      fetchLeaderboard();
    }, [fetchLeaderboard])
  );

  // Pull-to-refresh handler
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Header row
  const renderHeader = () => (
    <View style={[styles.headerRow, styles.headerCard]}>
      <Text style={[styles.headerText, styles.rankHeader]}>#</Text>
      <Text style={[styles.headerText, styles.userHeader]}>User</Text>
      <Text style={[styles.headerText, styles.countHeader]}>Total</Text>
      <Text style={[styles.headerText, styles.countHeader, styles.priorityHigh]}>H</Text>
      <Text style={[styles.headerText, styles.countHeader, styles.priorityMedium]}>M</Text>
      <Text style={[styles.headerText, styles.countHeader, styles.priorityLow]}>L</Text>
    </View>
  );

  // Each row
  const renderItem = ({ item, index }) => {
    const isEven = index % 2 === 0;
    const cardStyle = [
      styles.card,
      isEven ? styles.cardEven : styles.cardOdd,
      index === 0 && styles.topCard,
    ];
    return (
      <View style={cardStyle}>
        <View style={styles.cardContent}>
          <View style={styles.rankContainer}>
            {index === 0 ? (
              <Image source={crownIcon} style={styles.crownIcon} />
            ) : (
              <Text
                style={[
                  styles.itemText,
                  index === 1
                    ? styles.rankSilver
                    : index === 2
                    ? styles.rankBronze
                    : styles.rank
                ]}
              >
                {index + 1}
              </Text>
            )}
          </View>
          <Text style={[styles.itemText, styles.user]} numberOfLines={1} ellipsizeMode="tail">
            {item.email || item._id || '–'}
          </Text>
          <Text style={[styles.itemText, styles.count]}>
            {item.totalReports ?? 0}
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
      </View>
    );
  };

  // Decide what to render
  let content;
  if (loading && !refreshing) {
    content = <ActivityIndicator style={styles.loader} size="large" color="#03DAC6" />;
  } else if (error) {
    content = <Text style={styles.errorText}>{error}</Text>;
  } else if (data.length === 0) {
    content = <Text style={styles.emptyText}>No data available.</Text>;
  } else {
    content = (
      <FlatList
        data={data}
        keyExtractor={(item) => item._id || Math.random().toString()}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#03DAC6']}
          />
        }
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      {/* Top bar with Back arrow + Title */}
      <View style={styles.backHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Leaderboard</Text>
      </View>
      {content}
    </SafeAreaView>
  );
};

export default LeaderboardScreen;
