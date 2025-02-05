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
import { createUserWithEmailAndPassword } from 'firebase/auth';

const RegisterScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleRegister = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      navigation.replace('Login');  
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.registerBox}>
        {/* Built-in Back Button from React Navigation */}
        <View style={styles.backButton}>
          <HeaderBackButton onPress={() => navigation.goBack()} tintColor="#1e90ff" />
        </View>

        <Text style={styles.title}>Register</Text>
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
        <TouchableOpacity style={styles.button} onPress={handleRegister}>
          <Text style={styles.buttonText}>Register</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.replace('Login')}>
          <Text style={styles.loginLink}>Already a user? Sign in.</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2c2c2c',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  registerBox: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: '#f7f7f7',
    borderRadius: 12,
    paddingVertical: 30,
    paddingHorizontal: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 8,
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
    backgroundColor: '#fff',
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
  loginLink: {
    marginTop: 20,
    textAlign: 'center',
    color: '#1e90ff',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
});

export default RegisterScreen;
