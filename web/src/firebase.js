import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Firebase Web config identifies this app; private credentials stay on the API.
const config = {
  apiKey: 'AIzaSyDuE__ECvaF3WaOpMBpT6VV3RZoXrxE1VI',
  authDomain: 'entrelia-17696.firebaseapp.com',
  projectId: 'entrelia-17696',
  storageBucket: 'entrelia-17696.firebasestorage.app',
  messagingSenderId: '899626488747',
  appId: '1:899626488747:web:b5991245ea38bddf7038ee',
};

export const configured = Object.values(config).every(Boolean);
export const auth = configured ? getAuth(initializeApp(config)) : null;
export const googleProvider = new GoogleAuthProvider();
