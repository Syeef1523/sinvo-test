import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyC-yW1SVsMfOij_ovyvDfk-1NDFqKeri98",
  authDomain: "sinvo-ai.firebaseapp.com",
  databaseURL: "https://sinvo-ai-default-rtdb.firebaseio.com",
  projectId: "sinvo-ai",
  storageBucket: "sinvo-ai.firebasestorage.app",
  messagingSenderId: "223035008853",
  appId: "1:223035008853:web:84d1cc41e32008603ff1dc"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();
