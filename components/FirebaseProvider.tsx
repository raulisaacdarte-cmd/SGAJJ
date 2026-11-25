'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  clampFirestoreString,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  sanitizeFirestoreId,
  testConnection,
} from '@/lib/firebase';

export interface SyncPublicationInput {
  slug: string;
  title: string;
  summary: string;
  category: string;
  author_name: string;
  status: string;
}

export interface SyncActivityInput {
  id: number;
  title: string;
  activity_type: string;
  location: string;
  status: string;
  start_datetime: string;
}

interface FirebaseContextValue {
  firebaseUser: User | null;
  firebaseReady: boolean;
  connectionStatus: 'checking' | 'connected' | 'offline' | 'error';
  signInWithGoogle: () => Promise<User | null>;
  signOutFirebase: () => Promise<void>;
  syncInstitutionalSnapshot: (input: {
    publications: SyncPublicationInput[];
    activities: SyncActivityInput[];
  }) => Promise<{ publicationsSynced: number; activitiesSynced: number }>;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  firebaseUser: null,
  firebaseReady: false,
  connectionStatus: 'checking',
  signInWithGoogle: async () => null,
  signOutFirebase: async () => {},
  syncInstitutionalSnapshot: async () => ({ publicationsSynced: 0, activitiesSynced: 0 }),
});

export function useFirebase() {
  return useContext(FirebaseContext);
}

class FirebaseErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    let readable = error.message || 'Ocorreu um erro inesperado na ligação à nuvem.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; path?: string };
      if (parsed?.error) {
        readable = `${parsed.error}${parsed.path ? ` (${parsed.path})` : ''}`;
      }
    } catch {
      // Plain message
    }
    return { hasError: true, message: readable };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9] dark:bg-[#071121] p-6">
          <div className="max-w-md w-full rounded-xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-[#0D1B30] p-6 space-y-4">
            <h2 className="font-serif-display text-xl font-bold text-[#0B1F3A] dark:text-white">
              Erro de Ligação ou Permissão
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="rounded-lg bg-[#0B1F3A] dark:bg-[#A6863A] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Tentar Novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'offline' | 'error'>('checking');

  useEffect(() => {
    let active = true;
    testConnection().then((status) => {
      if (active) setConnectionStatus(status);
    });

    const unsub = onAuthStateChanged(auth, (u) => {
      if (!active) return;
      setFirebaseUser(u);
      setFirebaseReady(true);
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  async function ensureUserProfileMirror(u: User) {
    if (!u.emailVerified || !u.email) return;
    const uid = sanitizeFirestoreId(u.uid, 128);
    const isPresidentEmail = u.email.toLowerCase() === 'associacaodejovensjuristas@gmail.com';
    const userPath = `users/${uid}`;
    const privatePath = `users/${uid}/private/info`;

    try {
      const existingSnap = await getDoc(doc(db, 'users', uid));
      const batch = writeBatch(db);

      if (isPresidentEmail) {
        const adminRef = doc(db, 'admins', uid);
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          batch.set(adminRef, {
            uid,
            roleCode: 'PRESIDENTE',
            createdAt: serverTimestamp(),
          });
        }
      }

      if (!existingSnap.exists()) {
        batch.set(doc(db, 'users', uid), {
          uid,
          displayName: clampFirestoreString(u.displayName || u.email.split('@')[0], 120, 'Membro AJJ'),
          roleCode: isPresidentEmail ? 'PRESIDENTE' : 'ASSOCIADO',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(doc(db, 'users', uid), {
          displayName: clampFirestoreString(u.displayName || u.email.split('@')[0], 120, 'Membro AJJ'),
          updatedAt: serverTimestamp(),
        });
      }

      batch.set(doc(db, 'users', uid, 'private', 'info'), {
        uid,
        email: clampFirestoreString(u.email, 160),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${userPath} / ${privatePath}`);
    }
  }

  async function signInWithGoogle(): Promise<User | null> {
    const credential = await signInWithPopup(auth, googleProvider);
    await ensureUserProfileMirror(credential.user);
    return credential.user;
  }

  async function signOutFirebase(): Promise<void> {
    await signOut(auth);
  }

  async function syncInstitutionalSnapshot(input: {
    publications: SyncPublicationInput[];
    activities: SyncActivityInput[];
  }) {
    const current = auth.currentUser;
    if (!current || !current.emailVerified) {
      throw new Error('Autentique primeiro a sua conta Google verificada da AJJ para sincronizar com o Firestore.');
    }

    const batch = writeBatch(db);
    let publicationsSynced = 0;
    let activitiesSynced = 0;

    for (const pub of input.publications) {
      if (pub.status !== 'PUBLICADO') continue;
      const slug = sanitizeFirestoreId(pub.slug, 100);
      if (slug.length < 2) continue;
      batch.set(doc(db, 'public_publications', slug), {
        slug,
        title: clampFirestoreString(pub.title, 200, 'Publicação AJJ'),
        summary: clampFirestoreString(pub.summary, 600, ''),
        category: clampFirestoreString(pub.category, 80, 'Artigo Jurídico'),
        authorName: clampFirestoreString(pub.author_name, 120, 'Direção Nacional da AJJ'),
        status: 'PUBLICADO',
        updatedAt: serverTimestamp(),
      });
      publicationsSynced += 1;
    }

    for (const act of input.activities) {
      if (act.status !== 'PUBLICADO') continue;
      const actId = sanitizeFirestoreId(`act-${act.id}`, 100);
      batch.set(doc(db, 'public_activities', actId), {
        title: clampFirestoreString(act.title, 200, 'Atividade AJJ'),
        activityType: clampFirestoreString(act.activity_type, 40, 'EVENTO'),
        location: clampFirestoreString(act.location, 160, 'Luanda'),
        status: 'PUBLICADO',
        startDatetime: clampFirestoreString(act.start_datetime, 40, ''),
        updatedAt: serverTimestamp(),
      });
      activitiesSynced += 1;
    }

    try {
      await batch.commit();
      return { publicationsSynced, activitiesSynced };
    } catch (error) {
      return handleFirestoreError(error, OperationType.WRITE, 'public_publications / public_activities');
    }
  }

  return (
    <FirebaseErrorBoundary>
      <FirebaseContext.Provider
        value={{
          firebaseUser,
          firebaseReady,
          connectionStatus,
          signInWithGoogle,
          signOutFirebase,
          syncInstitutionalSnapshot,
        }}
      >
        {children}
      </FirebaseContext.Provider>
    </FirebaseErrorBoundary>
  );
}
