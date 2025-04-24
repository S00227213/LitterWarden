import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#121212', // Dark background for the whole screen area
  },
  container: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 10, // Adjust as needed if using a custom header
    backgroundColor: '#121212', // Dark theme background
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF', // White text
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 10,
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
    color: '#FF6B6B', // Reddish color for errors
    fontSize: 16,
    paddingHorizontal: 20,
  },
  emptyText: {
    flex: 1,
    textAlign: 'center',
    marginTop: 50,
    color: '#AAAAAA', // Greyish text for empty state
    fontSize: 16,
  },
  listContentContainer: {
    paddingBottom: 20, // Add padding at the bottom of the list
  },
  // Header Row Styles
  headerRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#03DAC6', // Accent color border
    backgroundColor: '#1E1E1E', // Slightly lighter background for header
    marginBottom: 5,
    paddingHorizontal: 5, // Padding inside the header row
  },
  headerText: {
    color: '#E0E0E0', // Lighter grey text for headers
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
  },
  rankHeader: {
    flex: 0.1, // ~10% width for rank
    textAlign: 'left',
  },
  userHeader: {
    flex: 0.4, // ~40% width for user email
    textAlign: 'left',
    paddingLeft: 5,
  },
  countHeader: {
    flex: 0.125, // ~12.5% width for each count (Total, H, M, L)
  },
  // Item Row Styles
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center', // Vertically center items in the row
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333333', // Darker separator line
    paddingHorizontal: 5, // Padding inside item rows
  },
  itemText: {
    color: '#FFFFFF', // White text for items
    fontSize: 14,
    textAlign: 'center',
  },
  rank: {
    flex: 0.1, // Match header width
    textAlign: 'left',
    fontWeight: 'bold',
    color: '#BB86FC', // Purple accent for rank
  },
  user: {
    flex: 0.4, // Match header width
    textAlign: 'left',
    paddingLeft: 5,
    color: '#E0E0E0', // Lighter grey for email
  },
  count: {
    flex: 0.125, // Match header width
  },
  // Priority Colors (reusing styles from Dashboard potentially)
  priorityHigh: {
    color: '#FF7043', // Example: Orange/Red for High
    fontWeight: 'bold',
  },
  priorityMedium: {
    color: '#FFCA28', // Example: Amber/Yellow for Medium
    fontWeight: 'bold',
  },
  priorityLow: {
    color: '#66BB6A', // Example: Green for Low
    fontWeight: 'bold',
  },
});

export default styles;