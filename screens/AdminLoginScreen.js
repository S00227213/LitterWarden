
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons'; 

import { useNavigation } from '@react-navigation/native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';

const AdminLoginScreen = () => {
  const navigation = useNavigation();
  const [step, setStep] = useState(1);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fbError, setFbError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleMasterCode = () => {
    code.trim() === '2169'
      ? (setStep(2), setCode(''))
      : Alert.alert('Invalid Code', 'The admin code you entered is incorrect.');
  };

  const handleFirebaseLogin = async () => {
    setLoading(true);
    setFbError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigation.replace('CleanerInterface');
    } catch {
      setFbError('Email or password not recognized');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={28} color="#BB86FC" />
      </TouchableOpacity>

      {step === 1 ? (
        <>
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
        </>
      ) : (
        <>
          <Text style={styles.title}>Admin Login</Text>
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
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#222',
    paddingTop:
      Platform.OS === 'android'
        ? StatusBar.currentHeight + 10
        : 40,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top:
      Platform.OS === 'android'
        ? StatusBar.currentHeight + 10
        : 40,
    left: 15,
    padding: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
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
