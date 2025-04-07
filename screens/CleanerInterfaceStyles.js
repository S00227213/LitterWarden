import { StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const numColumns = 3;
const screenPadding = 10 * 2;
const cardMargin = 5 * 2 * numColumns;
const availableWidth = width - screenPadding - cardMargin;
const cardWidth = availableWidth / numColumns;

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  headerBar: {
    paddingTop: 15,
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
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      paddingRight: 10,
  },
  backButtonText: {
      color: '#BB86FC',
      fontSize: 16,
  },
  contentArea: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    justifyContent: 'flex-start',
    marginBottom: 10,
  },


  reportCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    marginHorizontal: 5,
    padding: 8,
    width: cardWidth,
    minHeight: 160,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  priorityText: {
    fontSize: 11,
    fontWeight: 'bold',
    flexShrink: 1,
    marginRight: 4,
  },
  dateText: {
    fontSize: 9,
    color: '#A0A0A0',
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
    marginTop: 4,
  },
  textContainer: {
    flex: 3,
    paddingRight: 5,
    justifyContent: 'space-around',
  },
  locationText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#E0E0E0',
    marginBottom: 2,
  },
  coordsText: {
    fontSize: 10,
    color: '#A0A0A0',
    marginBottom: 2,
  },
  reporterText: {
    fontSize: 9,
    color: '#888',
    fontStyle: 'italic',
  },
  mapContainer: {
    flex: 2,
    height: 60,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noMapContainer: {
     borderWidth: 1,
     borderColor: '#444',
  },
  miniMap: {
    ...StyleSheet.absoluteFillObject,
  },
  noMapText: {
     fontSize: 10,
     color: '#999',
     textAlign: 'center',
  },



  priorityLow: { color: '#FFEB3B' },
  priorityMedium: { color: '#FF9800' },
  priorityHigh: { color: '#F44336' },


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
  },
  modalContainer: {
    width: '90%',
    maxWidth: 500,
    maxHeight: '95%',
    backgroundColor: '#2C2C2C',
    borderRadius: 15,
    padding: 5,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
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
    marginBottom: 8,
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
    paddingTop: 10,
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
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#444',
  },
  modalMap: {
    ...StyleSheet.absoluteFillObject,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
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
  },
  changePhotoButton: {
     backgroundColor: '#FFC107',
     marginTop: 5,
  },

  modalErrorText: {
      color: '#FF7043',
      textAlign: 'center',
      marginBottom: 10,
      fontSize: 14,
  },
});

export default styles;