import { StyleSheet, Dimensions, Platform, StatusBar } from 'react-native';

const { width } = Dimensions.get('window');
const H_PAD = 20;

export default StyleSheet.create({
  // Container
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 20,
    paddingBottom: 10,
  },

  // Navbar
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    marginBottom: 8,
  },
  navbarTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Avatar only in navbar right
  avatarContainer: {
    marginRight: 12,
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

  // Filter Bar
  filterBar: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    paddingVertical: 6,
    paddingHorizontal: H_PAD,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginBottom: 12,
  },
  filterButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#555',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
  filterButtonActive: {
    backgroundColor: 'rgba(187,134,252,0.2)',
    borderColor: '#BB86FC',
  },
  filterButtonHigh: { borderColor: '#F44336' },
  filterButtonMedium: { borderColor: '#FF9800' },
  filterButtonLow: { borderColor: '#FFEB3B' },
  filterButtonClean: { borderColor: '#4CAF50' },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#A0A0A0',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Main list area
  listArea: {
    flex: 1,
    paddingHorizontal: H_PAD,
  },
  reportList: {
    paddingBottom: 20,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 150,
  },
  noReportsText: {
    flex: 1,
    fontSize: 16,
    color: '#B0B0B0',
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: H_PAD,
    minHeight: 150,
  },

  // Report card
  reportCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reportTextContainer: {
    flex: 2.5,
    paddingRight: 12,
    justifyContent: 'flex-start',
  },
  row: {
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#BB86FC',
  },
  value: {
    fontSize: 12,
    color: '#E0E0E0',
    flexShrink: 1,
    marginLeft: 4,
  },

  // Priority colors
  priorityHigh: { color: '#F44336' },
  priorityMedium: { color: '#FF9800' },
  priorityLow: { color: '#FFEB3B' },
  priorityClean: { color: '#4CAF50' },

  // Map preview
  reportMapContainer: {
    flex: 1.2,
    minHeight: 100,
    maxHeight: 120,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportMap: { ...StyleSheet.absoluteFillObject },
  mapTouchable: { ...StyleSheet.absoluteFillObject },
  noLocationContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  noLocationText: {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
  },

  // Action buttons in card
  reportButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#333333',
    paddingTop: 8,
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    marginLeft: 8,
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Pagination controls
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: H_PAD,
  },
  pageButton: {
    backgroundColor: '#03DAC6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginHorizontal: 12,
  },
  pageButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#121212',
  },
  disabledButton: {
    backgroundColor: '#555',
    opacity: 0.6,
  },
  pageInfo: {
    fontSize: 14,
    color: '#FFFFFF',
  },

  // Bottom action buttons
  bottomButtonContainer: {
    paddingHorizontal: H_PAD,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    paddingTop: 10,
    alignItems: 'center',
  },
  reportButton: {
    width: width - H_PAD * 2,
    paddingVertical: 14,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    backgroundColor: '#BB86FC',
  },
  reportButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#121212',
  },

  // Modal overlay & container
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    backgroundColor: '#2C2C2C',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  modalHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },

  // Profile modal specific
  profilePhotoLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#444',
    marginBottom: 12,
  },
  profileEmail: {
    fontSize: 16,
    color: '#E0E0E0',
    marginBottom: 16,
  },

  // Modal buttons
  modalButton: {
    backgroundColor: '#03DAC6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginBottom: 10,
  },
  logoutModalButton: {
    backgroundColor: '#FF5252',
  },
  cancelButton: {
    backgroundColor: '#888',
  },
  modalButtonText: {
    color: '#121212',
    fontSize: 14,
    fontWeight: '700',
  },
});
