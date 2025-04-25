import React, { useEffect, useState, useRef } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Animated, 
  Dimensions 
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

// 10 famous environmental quotes
const quotes = [
  "The greatest threat to our planet is the belief that someone else will save it. - Robert Swan",
  "We won't have a society if we destroy the environment. - Margaret Mead",
  "The Earth is what we all have in common. - Wendell Berry",
  "He that plants trees loves others besides himself. - Thomas Fuller",
  "Take nothing but pictures, leave nothing but footprints. - Unknown",
  "Littering is a form of violence against nature. - Unknown",
  "What we are doing to the forests of the world is but a mirror reflection of what we are doing to ourselves and to one another. - Mahatma Gandhi",
  "Respect your Mother Earth. - Unknown",
  "Cleanliness is not next to godliness—it is a form of love. - Unknown",
  "There is no planet B. - Unknown",
];

const HomeScreen = () => {
  const navigation = useNavigation();

  const [dynamicMessage, setDynamicMessage] = useState('Welcome');
  const [introComplete, setIntroComplete] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [shouldPlayIntro, setShouldPlayIntro] = useState(true);

  const messageOpacity = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const quoteOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem('introPlayed')
      .then(value => {
        if (value === 'true') {
          setShouldPlayIntro(false);
          setIntroComplete(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!shouldPlayIntro) {
      // If already seen, fade in buttons & quotes immediately
      setIntroComplete(true);
      Animated.timing(buttonOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      Animated.timing(quoteOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      return;
    }
    // Intro sequence
    Animated.sequence([
      Animated.timing(messageOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(1000),
      Animated.timing(messageOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),

      Animated.timing(messageOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(1000),
      Animated.timing(messageOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),

      Animated.timing(messageOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(500),
    ]).start(() => {
      setDynamicMessage('Litter Warden');
      setTimeout(() => {
        setIntroComplete(true);
        AsyncStorage.setItem('introPlayed', 'true').catch(()=>{});
        Animated.timing(buttonOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        Animated.timing(quoteOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      }, 300);
    });
  }, [shouldPlayIntro]);

  useEffect(() => {
    if (!introComplete) return;
    const iv = setInterval(() => {
      Animated.timing(quoteOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        setQuoteIndex(i => (i + 1) % quotes.length);
        Animated.timing(quoteOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(iv);
  }, [introComplete]);

  const renderStatic = () => (
    <>
      <Text style={styles.staticHeader}>Litter Warden</Text>
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.loginButton]}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.registerButton]}
          onPress={() => navigation.navigate('Register')}
        >
          <Text style={styles.buttonText}>Register</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.adminButton]}
          onPress={() => navigation.navigate('AdminLogin')}
        >
          <Text style={styles.buttonText}>Admin Login</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      {introComplete && (
        <Animated.Text style={[styles.backgroundQuote, { opacity: quoteOpacity }]}>
          {quotes[quoteIndex]}
        </Animated.Text>
      )}
      {!introComplete && (
        <Animated.Text style={[styles.dynamicMessage, { opacity: messageOpacity }]}>
          {dynamicMessage}
        </Animated.Text>
      )}
      {introComplete && renderStatic()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backgroundQuote: {
    position: 'absolute',
    top: 40,
    width: width - 40,
    textAlign: 'center',
    fontSize: 16,
    fontStyle: 'italic',
    color: '#555',
  },
  dynamicMessage: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  staticHeader: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 40,
  },
  buttonContainer: {
    alignItems: 'center',
    width: '100%',
  },
  button: {
    width: '80%',
    paddingVertical: 15,
    borderRadius: 10,
    marginVertical: 8,
    alignItems: 'center',
  },
  loginButton: {
    backgroundColor: '#1e90ff',
  },
  registerButton: {
    backgroundColor: '#ff69b4',
  },
  adminButton: {
    backgroundColor: '#FFA500',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default HomeScreen;
