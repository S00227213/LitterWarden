import { StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const numColumns = 3;
const screenPadding = 20 * 2;
const cardMargin = 5 * 2 * numColumns;
const availableWidth = width - screenPadding - cardMargin;
const cardWidth = availableWidth / numColumns;

const styles = StyleSheet.create({
  // Layout
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    justifyContent: 'space-between',
  },
  topSection: {
    flex: 1,
    marginBottom: 10,
  },
  // Navbar
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  navbarTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  navbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  username: {
    fontSize: 14,
    color: '#BB86FC',
    marginRight: 12,
    maxWidth: width * 0.3,
  },
  logoutButton: {
    backgroundColor: '#333333',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  // Header
  header: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  // Loader / No Reports
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  noReportsText: {
    flex: 1,
    fontSize: 16,
    color: '#B0B0B0',
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 20,
    minHeight: 200,
  },
  // Report List
  reportList: {
    paddingBottom: 10,
  },
  listColumnWrapper: {
    justifyContent: 'flex-start',
    marginBottom: 10,
  },
  reportCard: {
    backgroundColor: '#1E1E1E',
    marginHorizontal: 5,
    padding: 10,
    borderRadius: 8,
    width: cardWidth,
    minHeight: 190,
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
    flex: 1,
  },
  reportTextContainer: {
    flex: 3,
    paddingRight: 8,
    justifyContent: 'space-between',
  },
  row: {
    marginBottom: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#BB86FC',
  },
  value: {
    fontSize: 11,
    color: '#E0E0E0',
    flexShrink: 1,
  },
  // Report Map
  reportMapContainer: {
    flex: 2,
    height: 90,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportMap: {
    ...StyleSheet.absoluteFillObject,
  },
  mapTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  // No Location
  noLocationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 5,
  },
  noLocationText: {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
  },
  noLocationTextLarge: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    padding: 20,
  },
  // Report Buttons
  reportButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    paddingTop: 5,
    borderTopColor: '#333333',
    borderTopWidth: 1,
  },
  actionButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
    minWidth: 50,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  // Pagination
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
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
  },
  // Report Button
  reportButton: {
    backgroundColor: '#BB86FC',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    alignSelf: 'center',
    width: '60%',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  reportButtonText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    width: '85%',
    maxWidth: 400,
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  modalHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#121212',
    marginBottom: 15,
  },
  modalMap: {
    width: '100%',
    height: 280,
    borderRadius: 8,
    marginBottom: 15,
  },
  closeModalButton: {
    backgroundColor: '#333333',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginTop: 10,
  },
  closeModalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default styles;
