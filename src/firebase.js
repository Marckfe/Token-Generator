import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCR-fXANI8vZL_R2kI8VhJ0EDTxdZwBT0w",
  authDomain: "tokengeneretor.firebaseapp.com",
  projectId: "tokengeneretor",
  storageBucket: "tokengeneretor.firebasestorage.app",
  messagingSenderId: "130281071263",
  appId: "1:130281071263:web:60442cbd2c1923c8c078aa",
  measurementId: "G-PDMFYJ78D6"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);
