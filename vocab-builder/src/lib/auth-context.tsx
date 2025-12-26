'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
    User,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    GoogleAuthProvider
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

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
        // Skip if Firebase is not initialized (SSR or no API key)
        if (!auth || !db) {
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setUser(user);

            if (user && db) {
                // Fetch or create user profile
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    // Update last active
                    await setDoc(userRef, { lastActiveAt: serverTimestamp() }, { merge: true });
                    setProfile(userSnap.data() as UserProfile);
                } else {
                    // Create new user profile
                    const newProfile: Omit<UserProfile, 'createdAt' | 'lastActiveAt'> & {
                        createdAt: ReturnType<typeof serverTimestamp>;
                        lastActiveAt: ReturnType<typeof serverTimestamp>;
                    } = {
                        uid: user.uid,
                        email: user.email || '',
                        displayName: user.displayName || '',
                        username: user.email?.split('@')[0] || `user${Date.now()}`,
                        bio: '',
                        photoURL: user.photoURL || '',
                        role: 'user',
                        createdAt: serverTimestamp(),
                        lastActiveAt: serverTimestamp(),
                        stats: {
                            totalPhrases: 0,
                            totalComments: 0,
                            totalReposts: 0,
                            currentStreak: 0,
                            longestStreak: 0,
                            lastStudyDate: null,
                        },
                        subscription: {
                            status: 'trial',
                            plan: null,
                            trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
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

        return () => unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        if (!auth) {
            throw new Error('Firebase not initialized');
        }
        const provider = new GoogleAuthProvider();
        try {
            // Try popup first, fallback to redirect
            await signInWithPopup(auth, provider);
        } catch (error: unknown) {
            const firebaseError = error as { code?: string };
            // If popup blocked or failed, try redirect
            if (firebaseError.code === 'auth/popup-blocked' ||
                firebaseError.code === 'auth/cancelled-popup-request' ||
                firebaseError.code === 'auth/popup-closed-by-user') {
                await signInWithRedirect(auth, provider);
            } else {
                throw error;
            }
        }
    };

    const signOut = async () => {
        if (!auth) {
            throw new Error('Firebase not initialized');
        }
        try {
            await firebaseSignOut(auth);
        } catch (error) {
            console.error('Error signing out:', error);
            throw error;
        }
    };

    const refreshProfile = async () => {
        if (!user || !db) return;
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            setProfile(userSnap.data() as UserProfile);
        }
    };

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
