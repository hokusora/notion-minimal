import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User as FirebaseUser,
  AuthError
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

export { firebaseConfig };

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// CRITICAL: Initialize Firestore with configured firestoreDatabaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Connection validation
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Client appears offline or firestore unavailable.');
    }
  }
}
testConnection();

// --- Error Handling Interface (Mandatory for Firestore security & debugging) ---
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const currentUser = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo: currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('[Firestore Error]:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Auth Error Helper ---
export interface AuthErrorInfo {
  code: string;
  message: string;
  isUnauthorizedDomain: boolean;
  domain?: string;
}

export function parseAuthError(err: unknown): AuthErrorInfo {
  const error = err as AuthError;
  const code = error?.code || 'unknown-error';
  const rawMessage = error?.message || 'Authentication failed';
  const isUnauthorizedDomain = code === 'auth/unauthorized-domain';
  const domain = typeof window !== 'undefined' ? window.location.hostname : undefined;

  let message = rawMessage;
  if (isUnauthorizedDomain) {
    message = `This domain (${domain}) is not authorized for Google OAuth in Firebase Console. Add "${domain}" to Firebase Console > Authentication > Settings > Authorized domains.`;
  } else if (code === 'auth/popup-blocked') {
    message = 'Sign-in popup was blocked by your browser. Please allow popups or try guest sign-in.';
  } else if (code === 'auth/popup-closed-by-user') {
    message = 'Sign-in popup was closed before completing.';
  } else if (code === 'auth/network-request-failed') {
    message = 'Network error while reaching Firebase Auth.';
  }

  return { code, message, isUnauthorizedDomain, domain };
}

// --- Auth Utilities ---
export async function signInWithGoogle(): Promise<FirebaseUser> {
  try {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    const parsed = parseAuthError(err);
    console.warn('[Firebase Auth] Sign in failed:', parsed);
    throw parsed;
  }
}

export async function signInGuestUser(): Promise<FirebaseUser> {
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (err) {
    const parsed = parseAuthError(err);
    console.warn('[Firebase Auth] Guest sign in failed:', parsed);
    throw parsed;
  }
}

export async function signInWithEmailUser(email: string, pass: string): Promise<FirebaseUser> {
  try {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return result.user;
  } catch (err) {
    const parsed = parseAuthError(err);
    console.warn('[Firebase Auth] Email sign in failed:', parsed);
    throw parsed;
  }
}

export async function signUpWithEmailUser(email: string, pass: string): Promise<FirebaseUser> {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    return result.user;
  } catch (err) {
    const parsed = parseAuthError(err);
    console.warn('[Firebase Auth] Email sign up failed:', parsed);
    throw parsed;
  }
}

export async function signOutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.error('[Firebase Auth] Sign out failed:', err);
    throw err;
  }
}

// --- Cloud Storage File Upload ---
export async function uploadFileToStorage(file: File, userId: string): Promise<string> {
  try {
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `users/${userId}/uploads/${Date.now()}_${cleanFileName}`;
    const fileRef = storageRef(storage, path);

    const snapshot = await uploadBytes(fileRef, file, {
      contentType: file.type || 'application/octet-stream',
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (storageError) {
    console.warn('[Firebase Storage] Direct upload error, checking base64 fallback:', storageError);
    // If under 15MB, provide inline Base64 data URL fallback so media never breaks
    if (file.size < 15 * 1024 * 1024) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(file);
      });
    }
    throw storageError;
  }
}

// --- Cloud Storage Delete File ---
export async function deleteFileFromStorage(fileUrl: string): Promise<void> {
  try {
    if (!fileUrl || !fileUrl.startsWith('http')) return;
    const fileRef = storageRef(storage, fileUrl);
    await deleteObject(fileRef);
  } catch (err) {
    console.warn('[Firebase Storage] Delete file warning:', err);
  }
}
