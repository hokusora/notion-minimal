import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  auth,
  db,
  signInWithGoogle,
  signInGuestUser,
  signInWithEmailUser,
  signUpWithEmailUser,
  signOutUser,
  AuthErrorInfo,
  parseAuthError
} from '../services/firebase.ts';
import { checkAndSeedInitialWorkspace } from '../services/workspace.ts';

interface AuthContextType {
  user: FirebaseUser | null;
  isLoading: boolean;
  authError: AuthErrorInfo | null;
  clearAuthError: () => void;
  signIn: () => Promise<void>;
  signInGuest: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  authError: null,
  clearAuthError: () => {},
  signIn: async () => {},
  signInGuest: async () => {},
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<AuthErrorInfo | null>(null);

  const clearAuthError = () => setAuthError(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);

      if (currentUser) {
        // Clear any previous auth error on successful auth state change
        setAuthError(null);

        // Sync user profile document (guarantee valid non-empty email for Firestore rules)
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const fallbackEmail = `${currentUser.uid.slice(0, 12)}@workspace.cloud`;
          const effectiveEmail = currentUser.email && currentUser.email.trim().length > 0
            ? currentUser.email
            : fallbackEmail;

          await setDoc(
            userDocRef,
            {
              id: currentUser.uid,
              email: effectiveEmail,
              displayName: currentUser.displayName || (currentUser.isAnonymous ? 'Guest User' : 'Notion User'),
              photoURL: currentUser.photoURL || '',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );

          // Seed default workspace in Firestore if first time
          await checkAndSeedInitialWorkspace(currentUser.uid);
        } catch (err) {
          console.warn('[Auth] Profile sync notice:', err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      setAuthError(null);
      await signInWithGoogle();
    } catch (err) {
      const parsed = parseAuthError(err);
      setAuthError(parsed);
      console.warn('[Auth] Sign-in notice:', parsed);
    }
  };

  const handleSignInGuest = async () => {
    try {
      setAuthError(null);
      await signInGuestUser();
    } catch (err) {
      const parsed = parseAuthError(err);
      setAuthError(parsed);
      console.warn('[Auth] Guest sign-in notice:', parsed);
    }
  };

  const handleSignInWithEmail = async (email: string, pass: string) => {
    try {
      setAuthError(null);
      await signInWithEmailUser(email, pass);
    } catch (err) {
      const parsed = parseAuthError(err);
      setAuthError(parsed);
      throw parsed;
    }
  };

  const handleSignUpWithEmail = async (email: string, pass: string) => {
    try {
      setAuthError(null);
      await signUpWithEmailUser(email, pass);
    } catch (err) {
      const parsed = parseAuthError(err);
      setAuthError(parsed);
      throw parsed;
    }
  };

  const handleSignOut = async () => {
    try {
      setAuthError(null);
      await signOutUser();
    } catch (err) {
      console.error('[Auth] Sign-out error:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        authError,
        clearAuthError,
        signIn: handleSignIn,
        signInGuest: handleSignInGuest,
        signInWithEmail: handleSignInWithEmail,
        signUpWithEmail: handleSignUpWithEmail,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
