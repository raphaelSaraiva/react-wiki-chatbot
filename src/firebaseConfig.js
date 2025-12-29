// src/firebaseConfig.js
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB0o7i2flJdg30UNOxAYUm-B_BUR7V_Nco",
  authDomain: "chabot-metrics.firebaseapp.com",
  projectId: "chabot-metrics",
  storageBucket: "chabot-metrics.firebasestorage.app",
  messagingSenderId: "513216530540",
  appId: "1:513216530540:web:3279e065badbb99f98f049",
  measurementId: "G-LM7K82TRTQ",
};

// Inicializar o Firebase
const app = initializeApp(firebaseConfig);

// 🔐 Auth
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// 🗄️ Firestore (NOVO)
export const db = getFirestore(app);

// Reexporta helpers que você já usa
export { signInWithPopup, signOut };
