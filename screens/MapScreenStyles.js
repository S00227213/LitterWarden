// MapScreenStyles.js
import { StyleSheet, Dimensions, Platform } from 'react-native';

const { width } = Dimensions.get('window');

export default StyleSheet.create({

  container: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#121212',
  },
  mapContainer: {
    flex: 3,
    backgroundColor: '#ccc',
  },
  map: {
    flex: 1,
  },
  bottomSectionContainer: {
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 5,
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },


  header: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginVertical: 15,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 69, 0, 0.3)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 10,
    marginTop: 5,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: '#FF4500',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    textAlign: 'left',
  },
  errorCloseButton: {
    paddingLeft: 10,
  },
  errorCloseButtonText: {
    color: '#FF4500',
    fontSize: 18,
    fontWeight: 'bold',
  },
  refreshButton: {
    position: 'absolute',
    bottom: 15,
    right: 15,
    backgroundColor: 'rgba(30,144,255, 0.85)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    zIndex: 5,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deviceStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,


  },
  deviceStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginRight: 8,
  },
  rescanButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#444',
    borderRadius: 15,
  },
  rescanButtonText: {
    color: '#eee',
    fontSize: 12,
  },
  extraButtonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    paddingVertical: 5,
  },
  extraButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#4b4b4b',
    borderRadius: 25,
    marginBottom: 8,
    minWidth: width / 4.8,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  manualButton: {

  },
  extraButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  emailContainer: {
    paddingVertical: 5,
    alignItems: 'center',
  },
  emailText: {
    color: '#aaa',
    fontSize: 12,
  },


  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  loadingText: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: '#1e90ff',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    marginTop: 20,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },


  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  modalContainer: {
    backgroundColor: '#2c2c2c',
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10,
    width: '95%',
    maxWidth: 480,
    maxHeight: '90%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
    position: 'relative',
  },
  modalTopCloseButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 10 : 8,
    right: 10,
    padding: 5,
    zIndex: 10,


  },
  modalTopCloseButtonText: {
    color: '#ccc',
    fontSize: 22,
    fontWeight: 'bold',
    lineHeight: 24,
  },
  modalHeader: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 12,
    color: '#eaeaea',
    textAlign: 'center',
  },
  modalText: {
    fontSize: 14,
    marginBottom: 6,
    textAlign: 'center',
    color: '#b5b5b5',
    lineHeight: 19,
  },
  modalTextHighlight: {
    color: '#fff',
    fontWeight: '600',
  },

  priorityTextLow: { color: '#ffeb3b' },
  priorityTextMedium: { color: '#ff9800' },
  priorityTextHigh: { color: '#f44336' },
  paginationText: {
    fontSize: 11,
    color: '#999',
    marginBottom: 8,
    fontWeight: '500',
  },
  evidenceSection: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  evidenceButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginVertical: 8,
  },
  evidenceButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  imageFrame: {
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 10,
    padding: 4,
    backgroundColor: '#1f1f1f',
    marginBottom: 10,
    marginTop: 5,
    width: '90%',
    aspectRatio: 4/3,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  evidencePreview: {
    borderRadius: 7,
    width: '100%',
    height: '100%',
  },
  noPhotoContainer: {
    width: '90%',
    aspectRatio: 4/3,
    backgroundColor: '#333',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 5,
  },
  noPhotoText: {
    color: '#888',
    fontSize: 16,
    fontStyle: 'italic',
  },

  modalButton: {
    borderRadius: 8,
    marginVertical: 4,
    paddingVertical: 10,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  submitButton: { backgroundColor: '#4CAF50' },
  changeButton: { backgroundColor: '#ff9800' },
  removeButton: { backgroundColor: '#f44336' },
  modalButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  modalFooterContainer: {
    width: '100%',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#444',
    alignItems: 'center',
  },
  modalNavContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: 5,
  },
  navButton: {
    backgroundColor: '#555',
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  navButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.6,
  },
  navButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  cleanButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginHorizontal: 10,
  },



  priorityModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  priorityModalContainer: {
    backgroundColor: '#2c2c2c',
    borderRadius: 16,
    paddingVertical: 25,
    paddingHorizontal: 20,
    width: '85%',
    maxWidth: 350,
    alignItems: 'stretch',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  priorityModalHeader: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 25,
    color: '#eaeaea',
    textAlign: 'center',
  },
  priorityButton: {
    paddingVertical: 15,
    borderRadius: 8,
    marginBottom: 15,
    alignItems: 'center',
  },

  lowPriority: { backgroundColor: '#ffeb3b' },
  mediumPriority: { backgroundColor: '#ff9800' },
  highPriority: { backgroundColor: '#f44336' },
  cancelButton: { backgroundColor: '#6c757d', marginTop: 10 },
  priorityButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },


  clusterContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 4,
  },
  clusterText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },


  customMarker: {  },
  markerImage: {  },
});