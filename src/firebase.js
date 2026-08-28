import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  // Firebase Web設定はブラウザへ配布される公開識別情報です。
  // 環境変数がある場合はそれを優先し、Netlify未設定時も本番が起動するよう既定値を持たせます。
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAEaRhiu8LK12zguD0BAHprxbxAyLzZv_4',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'soccer-predict-59a84.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://soccer-predict-59a84-default-rtdb.firebaseio.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'soccer-predict-59a84',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'soccer-predict-59a84.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '307448711261',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:307448711261:web:901df3dd88cc88c789e5b4',
};

const missingConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingConfig.length > 0) {
  throw new Error(`Firebase configuration is missing: ${missingConfig.join(', ')}`);
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
