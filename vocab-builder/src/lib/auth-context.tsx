'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { User } from 'firebase/auth';

interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    username: string;
    bio: string;
    photoURL: string;
    role: 'user' | 'admin';
    createdAt: Date;
    lastActiveAt: Date;
    stats: {
        totalPhrases: number;
        totalComments: number;
        totalReposts: number;
        currentStreak: number;
        longestStreak: number;
        lastStudyDate: Date | null;
        // Gamification
        xp?: number;
        level?: number;
        xpToday?: number;
        xpTodayDate?: string | null;
        redeemedDays?: number;
    };
    subscription: {
        status: 'trial' | 'active' | 'expired' | 'cancelled';
        plan: 'monthly' | 'yearly' | null;
        trialEndsAt: Date | null;
        currentPeriodEnd: Date | null;
    };
    settings: {
        dailyGoal: number;
        preferredStyles: string[];
        notificationsEnabled: boolean;
    };
}

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Only run on client
        if (typeof window === 'undefined') {
            setLoading(false);
            return;
        }

        let unsubscribe: (() => void) | undefined;

        // Dynamically import and initialize Firebase
        const initAuth = async () => {
            try {
                const { initializeFirebase } = await import('@/lib/firebase');
                const { auth, db } = await initializeFirebase();

                if (!auth || !db) {
                    setLoading(false);
                    return;
                }

                const { onAuthStateChanged } = await import('firebase/auth');
                const { doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');

                unsubscribe = onAuthStateChanged(auth, async (user) => {
                    setUser(user);

                    if (user && db) {
                        const userRef = doc(db, 'users', user.uid);
                        const userSnap = await getDoc(userRef);

                        if (userSnap.exists()) {
                            await setDoc(userRef, { lastActiveAt: serverTimestamp() }, { merge: true });
                            setProfile(userSnap.data() as UserProfile);
                        } else {
                            const newProfile = {
                                uid: user.uid,
                                email: user.email || '',
                                displayName: user.displayName || '',
                                username: user.email?.split('@')[0] || `user${Date.now()}`,
                                bio: '',
                                photoURL: user.photoURL || '',
                                role: 'user' as const,
                                createdAt: serverTimestamp(),
                                lastActiveAt: serverTimestamp(),
                                stats: {
                                    totalPhrases: 0,
                                    totalComments: 0,
                                    totalReposts: 0,
                                    currentStreak: 0,
                                    longestStreak: 0,
                                    lastStudyDate: null,
                                    xp: 0,
                                    level: 1,
                                    xpToday: 0,
                                    xpTodayDate: null,
                                    redeemedDays: 0,
                                },
                                subscription: {
                                    status: 'trial' as const,
                                    plan: null,
                                    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                                    currentPeriodEnd: null,
                                },
                                settings: {
                                    dailyGoal: 10,
                                    preferredStyles: ['twitter', 'instagram'],
                                    notificationsEnabled: true,
                                },
                            };

                            await setDoc(userRef, newProfile);
                            setProfile(newProfile as unknown as UserProfile);
                        }
                    } else {
                        setProfile(null);
                    }

                    setLoading(false);
                });
            } catch (error) {
                console.error('Failed to initialize Firebase:', error);
                setLoading(false);
            }
        };

        initAuth();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const signInWithGoogle = useCallback(async () => {
        try {
            const { initializeFirebase } = await import('@/lib/firebase');
            const { auth } = await initializeFirebase();

            if (!auth) {
                console.error('[Auth] Firebase not initialized');
                return;
            }

            const { signInWithPopup, signInWithRedirect, GoogleAuthProvider } = await import('firebase/auth');
            const provider = new GoogleAuthProvider();

            try {
                await signInWithPopup(auth, provider);
            } catch (error: unknown) {
                const firebaseError = error as { code?: string; message?: string };
                console.error('[Auth] Sign-in error:', firebaseError.code, firebaseError.message);
                if (firebaseError.code === 'auth/popup-blocked' ||
                    firebaseError.code === 'auth/cancelled-popup-request' ||
                    firebaseError.code === 'auth/popup-closed-by-user') {
                    await signInWithRedirect(auth, provider);
                } else if (firebaseError.code === 'auth/unauthorized-domain') {
                    alert(`This domain is not authorized for Firebase Auth. Add "${window.location.hostname}" to Firebase Console > Authentication > Settings > Authorized domains.`);
                } else {
                    throw error;
                }
            }
        } catch (error) {
            console.error('[Auth] signInWithGoogle failed:', error);
        }
    }, []);

    const signOut = useCallback(async () => {
        const { initializeFirebase } = await import('@/lib/firebase');
        const { auth } = await initializeFirebase();

        if (!auth) {
            throw new Error('Firebase not initialized');
        }

        const { signOut: firebaseSignOut } = await import('firebase/auth');
        await firebaseSignOut(auth);
    }, []);

    const refreshProfile = useCallback(async () => {
        if (!user) return;

        const { initializeFirebase } = await import('@/lib/firebase');
        const { db } = await initializeFirebase();

        if (!db) return;

        const { doc, getDoc } = await import('firebase/firestore');
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            setProfile(userSnap.data() as UserProfile);
        }
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, profile, loading, signInWithGoogle, signOut, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
