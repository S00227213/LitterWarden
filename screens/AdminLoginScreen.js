// screens/AdminLoginScreen.js

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';

const AdminLoginScreen = () => {
  const navigation = useNavigation();

  // Step 1 = entering the master code
  // Step 2 = entering Firebase email/password
  const [step, setStep] = useState(1);

  // master code state
  const [code, setCode] = useState('');

  // Firebase login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fbError, setFbError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleMasterCode = () => {
    if (code.trim() === '2169') {
      setStep(2);
      setCode('');      // clear for safety
    } else {
      Alert.alert('Invalid Code', 'The admin code you entered is incorrect.');
    }
  };

  const handleFirebaseLogin = async () => {
    setLoading(true);
    setFbError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // once firebase auth is successful, send them to CleanerInterface
      navigation.replace('CleanerInterface');
    } catch (err) {
      setFbError('Email or password not recognized');
    } finally {
      setLoading(false);
    }
  };

  if (step === 1) {
    // render master-code screen
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Admin Access</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter master code"
          placeholderTextColor="#888"
          value={code}
          onChangeText={setCode}
          keyboardType="numeric"
          secureTextEntry
        />
        <TouchableOpacity style={styles.button} onPress={handleMasterCode}>
          <Text style={styles.buttonText}>Next</Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    // render Firebase login screen
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Firebase Login</Text>
        {!!fbError && <Text style={styles.error}>{fbError}</Text>}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#888"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#888"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity
          style={styles.button}
          onPress={handleFirebaseLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#222" />
            : <Text style={styles.buttonText}>Login as Admin</Text>
          }
        </TouchableOpacity>
      </View>
    );
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 20,
  },
  input: {
    width: '80%',
    height: 50,
    backgroundColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 18,
    color: '#fff',
    marginBottom: 15,
  },
  button: {
    width: '60%',
    paddingVertical: 15,
    backgroundColor: '#FFA500',
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#222',
    fontSize: 18,
    fontWeight: '700',
  },
  error: {
    color: 'salmon',
    marginBottom: 10,
  },
});

export default AdminLoginScreen;
