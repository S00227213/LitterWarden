
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
import * as Animatable from 'react-native-animatable';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { height, width } = Dimensions.get('window');

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

  // State for the dynamic message (for intro)
  const [dynamicMessage, setDynamicMessage] = useState('Welcome');
  // This flag controls whether to play the intro animation
  const [introComplete, setIntroComplete] = useState(false);
  // State for cycling background quotes
  const [quoteIndex, setQuoteIndex] = useState(0);
  // State to indicate whether the intro should be played (if not already played)
  const [shouldPlayIntro, setShouldPlayIntro] = useState(true);

  // Animated values for dynamic text, buttons, and background quotes
  const messageOpacity = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const quoteOpacity = useRef(new Animated.Value(0)).current;

  // On mount, check AsyncStorage to see if intro has already played
  useEffect(() => {
    AsyncStorage.getItem('introPlayed')
      .then(value => {
        if (value === 'true') {
          // Intro already played; skip animation.
          setShouldPlayIntro(false);
          setIntroComplete(true);
        } else {
          setShouldPlayIntro(true);
        }
      })
      .catch(err => {
        console.error('Error reading introPlayed flag:', err);
        setShouldPlayIntro(true);
      });
  }, []);

  // Intro sequence for dynamic text (only if shouldPlayIntro is true)
  useEffect(() => {
    if (shouldPlayIntro) {
      // Step 1: Fade in "Welcome"
      Animated.timing(messageOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        // Hold "Welcome" for 1 second, then fade it out.
        setTimeout(() => {
          Animated.timing(messageOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }).start(() => {
            // Step 2: Update text to "TO" and fade it in.
            setDynamicMessage('TO');
            Animated.timing(messageOpacity, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }).start(() => {
              // Hold "TO" for 1 second, then fade it out.
              setTimeout(() => {
                Animated.timing(messageOpacity, {
                  toValue: 0,
                  duration: 500,
                  useNativeDriver: true,
                }).start(() => {
                  // Step 3: Update text to "Litter Warden" and fade it in.
                  setDynamicMessage('Litter Warden');
                  Animated.timing(messageOpacity, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                  }).start(() => {
                    // Hold briefly before finishing the intro.
                    setTimeout(() => {
                      // Mark the intro as complete.
                      setIntroComplete(true);
                      // Save flag in AsyncStorage so intro doesn't play again.
                      AsyncStorage.setItem('introPlayed', 'true')
                        .catch(err => console.error('Error saving introPlayed flag:', err));
                      // Fade in the buttons.
                      Animated.timing(buttonOpacity, {
                        toValue: 1,
                        duration: 500,
                        useNativeDriver: true,
                      }).start();
                      // Fade in the background quotes.
                      Animated.timing(quoteOpacity, {
                        toValue: 1,
                        duration: 500,
                        useNativeDriver: true,
                      }).start();
                    }, 500);
                  });
                });
              }, 1000);
            });
          });
        }, 1000);
      });
    }
  }, [shouldPlayIntro, messageOpacity, buttonOpacity, quoteOpacity]);

  // Cycle background quotes every 5 seconds (only if intro is complete)
  useEffect(() => {
    if (introComplete) {
      const cycleQuotes = () => {
        Animated.timing(quoteOpacity, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }).start(() => {
          setQuoteIndex((prevIndex) => (prevIndex + 1) % quotes.length);
          Animated.timing(quoteOpacity, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }).start();
        });
      };

      const interval = setInterval(cycleQuotes, 5000);
      return () => clearInterval(interval);
    }
  }, [introComplete, quoteOpacity]);

  // If the intro should not play, show the static home screen with buttons.
  const renderStaticContent = () => (
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
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      {/* Background Animated Quote (only shown after intro completes) */}
      {introComplete && (
        <Animated.Text style={[styles.backgroundQuote, { opacity: quoteOpacity }]}>
          {quotes[quoteIndex]}
        </Animated.Text>
      )}

      {/* Intro dynamic text (shown only if intro should play) */}
      {shouldPlayIntro && !introComplete && (
        <Animated.Text style={[styles.dynamicMessage, { opacity: messageOpacity }]}>
          {dynamicMessage}
        </Animated.Text>
      )}

      {/* When intro is complete, show static header and buttons */}
      {introComplete && renderStaticContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#222', // Dark background for contrast
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backgroundQuote: {
    position: 'absolute',
    top: 20,
    width: width - 40,
    textAlign: 'center',
    fontSize: 16,
    fontStyle: 'italic',
    color: '#555',
    zIndex: 0,
  },
  dynamicMessage: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  staticHeader: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 40,
    zIndex: 1,
  },
  buttonContainer: {
    zIndex: 1,
    alignItems: 'center',
  },
  button: {
    padding: 15,
    borderRadius: 10,
    marginVertical: 10,
    width: 200,
    alignItems: 'center',
  },
  loginButton: {
    backgroundColor: '#1e90ff', // Blue for Login
  },
  registerButton: {
    backgroundColor: '#ff69b4', // Pink for Register
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default HomeScreen;
