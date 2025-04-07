import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage'; 

const firebaseConfig = {
  apiKey: "AIzaSyAWjJPVn3pzyYhgmbry1HS-g_xrQftZbcQ",
  authDomain: "reallitter.firebaseapp.com",
  projectId: "reallitter",
  storageBucket: "reallitter.appspot.com", 
  messagingSenderId: "877582915989",
  appId: "1:877582915989:android:4b0fadcf66dbb6e0dbbe9c",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app); 

export { auth, storage };
