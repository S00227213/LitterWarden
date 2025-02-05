import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet 
} from 'react-native';
import { HeaderBackButton } from '@react-navigation/elements';
import { auth } from '../firebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successVisible, setSuccessVisible] = useState(false);

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setSuccessVisible(true);
      setError('');
      setTimeout(() => {
        navigation.replace('Dashboard');
      }, 2000);
    } catch (err) {
      setError('Email or user not recognized');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.loginBox}>
        {/* Built-in Back Button from React Navigation */}
        <View style={styles.backButton}>
          <HeaderBackButton onPress={() => navigation.goBack()} tintColor="#1e90ff" />
        </View>

        <Text style={styles.title}>Login</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          placeholder="Email"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor="#666"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />
        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>

        {successVisible && <Text style={styles.successMessage}>Login Successful!</Text>}

        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.registerLink}>Not a user? Please register.</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#808080',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginBox: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 30,
    paddingHorizontal: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  backButton: {
    position: 'absolute',
    top: 15,
    left: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
    color: '#333',
  },
  button: {
    backgroundColor: '#1e90ff',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  error: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 15,
  },
  successMessage: {
    marginTop: 15,
    textAlign: 'center',
    color: 'green',
    fontSize: 18,
    fontWeight: '600',
  },
  registerLink: {
    marginTop: 20,
    textAlign: 'center',
    color: '#1e90ff',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
});

export default LoginScreen;
