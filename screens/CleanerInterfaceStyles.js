import { StyleSheet, Dimensions, Platform, StatusBar } from 'react-native'; // Added Platform, StatusBar

// Function to determine card width based on screen size and desired columns
const getCardWidth = () => {
  const screenWidth = Dimensions.get('window').width;
  const columns = screenWidth < 600 ? 1 : 3; // Use 1 column for smaller screens
  const screenPadding = 10 * 2;
  const cardMargin = columns > 1 ? 5 * 2 * columns : 0;
  const availableWidth = screenWidth - screenPadding - cardMargin;
  return columns === 1 ? screenWidth - screenPadding : availableWidth / columns;
};

const cardWidth = getCardWidth();
// *** EXPORT this flag so the component can use it ***
export const isSingleColumn =
  cardWidth === Dimensions.get('window').width - (10 * 2);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  headerBar: {
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 15,
    paddingBottom: 10,
    paddingHorizontal: 15,
    backgroundColor: '#1E1E1E',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    position: 'relative',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  backButton: {
    position: 'absolute',
    left: 15,
    top: Platform.OS === 'android' ? StatusBar.currentHeight : 15,
    bottom: 0,
    justifyContent: 'center',
    paddingRight: 10,
  },
  backButtonText: {
    color: '#BB86FC',
    fontSize: 16,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingVertical: 10,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#555',
    marginHorizontal: 4,
    alignSelf: 'center',
  },
  filterButtonActive: {
    borderColor: '#BB86FC',
    backgroundColor: 'rgba(187, 134, 252, 0.2)',
  },
  filterButtonHigh: { borderColor: '#F44336' },
  filterButtonMedium: { borderColor: '#FF9800' },
  filterButtonLow: { borderColor: '#FFEB3B' },
  filterButtonClean: { borderColor: '#4CAF50' },
  filterButtonText: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  contentArea: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#FF5252',
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: '#BB86FC',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  retryButtonText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: 'bold',
  },
  noReportsText: {
    flex: 1,
    fontSize: 18,
    color: '#B0B0B0',
    textAlign: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
  listContainer: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
  },
  listColumnWrapper: {
    // Only applied when numColumns > 1 by FlatList logic
    justifyContent: 'flex-start',
    marginBottom: 10,
  },
  reportCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    marginHorizontal: isSingleColumn ? 0 : 5,
    marginBottom: isSingleColumn ? 10 : 0, // Add bottom margin only for single column
    padding: 10,
    width: cardWidth,
    minHeight: isSingleColumn ? 120 : 160,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  priorityText: {
    fontSize: isSingleColumn ? 13 : 11,
    fontWeight: 'bold',
    flexShrink: 1,
    marginRight: 4,
  },
  dateText: {
    fontSize: isSingleColumn ? 11 : 9,
    color: '#A0A0A0',
  },
  cardBody: {
    flexDirection: 'row',
    flex: 1,
    marginTop: 4,
  },
  textContainer: {
    flex: isSingleColumn ? 4 : 3,
    paddingRight: 8,
    justifyContent: 'space-between',
  },
  locationText: {
    fontSize: isSingleColumn ? 14 : 11,
    fontWeight: '500',
    color: '#E0E0E0',
    marginBottom: 3,
  },
  coordsText: {
    fontSize: isSingleColumn ? 12 : 10,
    color: '#A0A0A0',
    marginBottom: 3,
  },
  reporterText: {
    fontSize: isSingleColumn ? 11 : 9,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 2,
  },
  mapContainer: {
    flex: isSingleColumn ? 2 : 2,
    height: isSingleColumn ? 100 : 60,
    minWidth: 60,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  noMapContainer: {
    borderWidth: 1,
    borderColor: '#444',
  },
  miniMap: {
    ...StyleSheet.absoluteFillObject,
  },
  profileButton: {
    position: 'absolute',
    right: 15,
    top: Platform.OS === 'android' ? StatusBar.currentHeight : 15,
  },
  noMapText: {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
  },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  priorityLow: { color: '#FFEB3B' },
  priorityMedium: { color: '#FF9800' },
  priorityHigh: { color: '#F44336' },
  priorityClean: { color: '#4CAF50' },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  pageButton: {
    backgroundColor: '#03DAC6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginHorizontal: 10,
  },
  pageButtonText: {
    color: '#121212',
    fontSize: 14,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#555',
    opacity: 0.6,
  },
  pageInfo: {
    fontSize: 14,
    color: '#FFFFFF',
    marginHorizontal: 10,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 10,
  },
  modalContainer: {
    width: '90%',
    maxWidth: 500,
    maxHeight: '95%',
    backgroundColor: '#2C2C2C',
    borderRadius: 15,
    paddingBottom: 0,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    overflow: 'hidden',
  },
  modalScrollView: {
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 15,
  },
  modalDetailRow: {
    marginBottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#BB86FC',
    marginRight: 5,
  },
  modalValue: {
    fontSize: 14,
    color: '#E0E0E0',
    flexShrink: 1,
  },
  evidenceSection: {
    marginTop: 15,
    marginBottom: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#444',
    paddingTop: 15,
  },
  evidenceImage: {
    width: '90%',
    aspectRatio: 1.5,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#444',
  },
  modalMapContainer: {
    height: 200,
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 15,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: '#444',
    position: 'relative',
  },
  modalMap: {
    ...StyleSheet.absoluteFillObject,
  },
  openMapButton: {
    backgroundColor: '#1E90FF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    alignSelf: 'center',
    marginTop: 8,
  },
  openMapButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#444',
    backgroundColor: '#2C2C2C',
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    flexGrow: 1,
    marginHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: '#607d8b',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
  },
  addPhotoButton: {
    backgroundColor: '#03A9F4',
    marginTop: 5,
    flexGrow: 0,
  },
  changePhotoButton: {
    backgroundColor: '#FFC107',
    marginTop: 5,
    flexGrow: 0,
  },
  modalErrorText: {
    color: '#FF7043',
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 14,
  },

  /** Avatar & Profile Modal Styles **/
  avatarContainer: {
    marginRight: 15,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  avatarPlaceholder: {
    backgroundColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 15,
  },
  profilePhotoLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#444',
    marginBottom: 12,
  },
  profileEmail: {
    fontSize: 14,
    color: '#E0E0E0',
    marginBottom: 16,
  },
  logoutModalButton: {
    backgroundColor: '#FF5252',
  },
});

export default styles;
