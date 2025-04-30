
import { StyleSheet } from 'react-native';

export default StyleSheet.create({
   // Header with back arrow
backHeader: {
     flexDirection: 'row',
     alignItems: 'center',
     paddingHorizontal: 10,
     paddingVertical: 12,
     backgroundColor: '#121212',
  },
   backButton: {
     marginRight: 10,
    },
    backArrow: {
      fontSize: 24,
     color: '#FFFFFF',
    },
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

  // Header Card
  headerCard: {
    marginHorizontal: 5,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#03DAC6',
  },
  headerText: {
    color: '#E0E0E0',
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
  },
  rankHeader: { flex: 0.1, textAlign: 'left' },
  userHeader: { flex: 0.4, textAlign: 'left' },
  countHeader: { flex: 0.125, textAlign: 'center' },

  // Row Card
  card: {
    marginHorizontal: 5,
    borderRadius: 8,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  cardEven: { backgroundColor: '#1E1E1E' },
  cardOdd: { backgroundColor: '#242424' },
  topCard: {
    borderColor: '#FFD700',
    borderWidth: 2,
  },

  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },

  itemText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
  },
  rankContainer: {
    flex: 0.1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crownIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },

  // Default rank styling (for 4th and below)
  rank: {
    flex: 0.1,
    textAlign: 'left',
    fontWeight: 'bold',
    color: '#BB86FC',
  },

  // Top-three special colors
  rankGold: {
    flex: 0.1,
    textAlign: 'left',
    fontWeight: 'bold',
    color: '#FFD700',
  },
  rankSilver: {
    flex: 0.1,
    textAlign: 'left',
    fontWeight: 'bold',
    color: '#C0C0C0',
  },
  rankBronze: {
    flex: 0.1,
    textAlign: 'left',
    fontWeight: 'bold',
    color: '#CD7F32',
  },

  user: {
    flex: 0.4,
    textAlign: 'left',
    paddingLeft: 10,
    color: '#E0E0E0',
  },
  count: { flex: 0.125 },

  // Priority colors
  priorityHigh: { color: '#FF7043', fontWeight: 'bold' },
  priorityMedium: { color: '#FFCA28', fontWeight: 'bold' },
  priorityLow: { color: '#66BB6A', fontWeight: 'bold' },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: '#1F1F1F',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  modalRank: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 10,
  },
  modalEmail: {
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  modalStat: {
    color: '#E0E0E0',
    fontSize: 16,
    flex: 1,
    textAlign: 'center',
  },
  modalCloseButton: {
    marginTop: 10,
    backgroundColor: '#03DAC6',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  modalCloseText: {
    color: '#000',
    fontWeight: 'bold',
  },
});
