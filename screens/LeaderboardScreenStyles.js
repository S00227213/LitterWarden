// LeaderboardScreenStyles.js

import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#121212',
  },
  container: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 10,
    backgroundColor: '#121212',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginVertical: 10,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    flex: 1,
    textAlign: 'center',
    marginTop: 50,
    color: '#FF6B6B',
    fontSize: 16,
    paddingHorizontal: 20,
  },
  emptyText: {
    flex: 1,
    textAlign: 'center',
    marginTop: 50,
    color: '#AAAAAA',
    fontSize: 16,
  },
  listContentContainer: {
    paddingBottom: 20,
  },

  headerRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#03DAC6',
    backgroundColor: '#1E1E1E',
    marginBottom: 5,
    paddingHorizontal: 5,
  },
  headerText: {
    color: '#E0E0E0',
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
  },
  rankHeader: {
    flex: 0.1,
    textAlign: 'left',
  },
  userHeader: {
    flex: 0.4,
    textAlign: 'left',
    paddingLeft: 5,
  },
  countHeader: {
    flex: 0.125,
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    paddingHorizontal: 5,
  },
  itemText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
  },
  rankContainer: {
    flex: 0.1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rank: {
    textAlign: 'left',
    fontWeight: 'bold',
    color: '#BB86FC',
  },
  user: {
    flex: 0.4,
    textAlign: 'left',
    paddingLeft: 5,
    color: '#E0E0E0',
  },
  count: {
    flex: 0.125,
  },

  crown: {
    width: 16,
    height: 16,
    marginRight: 4,
  },

  priorityHigh: {
    color: '#FF7043',
    fontWeight: 'bold',
  },
  priorityMedium: {
    color: '#FFCA28',
    fontWeight: 'bold',
  },
  priorityLow: {
    color: '#66BB6A',
    fontWeight: 'bold',
  },
});
