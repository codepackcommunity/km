// lib/firebase/config.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Admin configuration
export const ADMIN_CONFIG = {
  // List of admin emails (you can add more)
  adminEmails: [
    process.env.NEXT_KM_ADMIN,
    process.env.NEXT_KM_SUPER,
    process.env.NEXT_KM_MANAGER
  ],
  
  // Admin roles and permissions
  roles: {
    superadmin: ['*'],
    admin: ['approve_users', 'view_users', 'manage_content'],
    manager: ['view_users', 'manage_content']
  }
};

// Helper function to check if user is admin
export const isAdminEmail = (email) => {
  return ADMIN_CONFIG.adminEmails.includes(email?.toLowerCase()?.trim());
};

// Function to get user role based on email
export const getUserRole = (email) => {
  if (email?.includes('superadmin')) return 'superadmin';
  if (email?.includes('admin')) return 'admin';
  if (email?.includes('manager')) return 'manager';
  return 'user';
};

export default app;