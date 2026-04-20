'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { account, databases, DB_ID } from '@/lib/appwrite/client';
import { OAuthProvider, Models, AppwriteException } from 'appwrite';

// ─── JWT Cache (14-min TTL, keeps us from minting a new JWT on every request) ───
let _cachedJwt: string | null = null;
let _jwtExpiresAt = 0;
async function getCachedJwt(): Promise<string> {
    if (_cachedJwt && Date.now() < _jwtExpiresAt) return _cachedJwt;
    const result = await account.createJWT();
    _cachedJwt = result.jwt;
    _jwtExpiresAt = Date.now() + 14 * 60 * 1000; // 14 minutes
    return _cachedJwt;
}

interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    username: string;
    bio: string;
    photoURL: string;
    role: 'user' | 'admin';
    createdAt: Date | string;
    lastActiveAt: Date | string;
    stats: {
        totalPhrases: number;
        totalComments: number;
        totalReposts: number;
        currentStreak: number;
        longestStreak: number;
        lastStudyDate: Date | string | null;

    };
    subscription: {
        status: 'trial' | 'active' | 'expired' | 'cancelled';
        plan: 'monthly' | 'yearly' | null;
        trialEndsAt: Date | string | null;
        currentPeriodEnd: Date | string | null;
    };
    settings: {
        dailyGoal: number;
        preferredStyles: string[];
        notificationsEnabled: boolean;
    };
}

export interface AppUser {
    $id: string;
    email: string | null;
    name: string | null;
    photoURL: string | null;
    getJwt: () => Promise<string>;
}

interface AuthContextType {
    user: AppUser | null;
    profile: UserProfile | null;
    loading: boolean;
    signIn: () => Promise<void>;
    signInWithEmail: (email?: string, password?: string) => Promise<void>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AppUser | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshProfile = useCallback(async (appwriteUser?: AppUser) => {
        const currentUser = appwriteUser || user;
        if (!currentUser) return;

        try {
            const userDoc = await databases.getDocument(DB_ID, 'users', currentUser.$id);
            if (userDoc) {
                // Deserialize JSON fields that are stored as strings in Appwrite
                let decodedProfile = { ...userDoc } as any;
                if (typeof decodedProfile.stats === 'string') decodedProfile.stats = JSON.parse(decodedProfile.stats);
                if (typeof decodedProfile.subscription === 'string') decodedProfile.subscription = JSON.parse(decodedProfile.subscription);
                if (typeof decodedProfile.settings === 'string') decodedProfile.settings = JSON.parse(decodedProfile.settings);
                
                // Update lastActiveAt fire-and-forget — don't block profile display
                const nowISO = new Date().toISOString();
                databases.updateDocument(DB_ID, 'users', currentUser.$id, { lastActiveAt: nowISO }).catch(() => {});
                
                decodedProfile.lastActiveAt = nowISO;
                setProfile(decodedProfile as UserProfile);
            }
        } catch (e: any) {
            if (e.code === 404) {
                // Profile doesn't exist yet, wait for Auth flow or create default
                const nowISO = new Date().toISOString();
                const newProfile = {
                    uid: currentUser.$id,
                    email: currentUser.email || '',
                    displayName: currentUser.name || '',
                    username: currentUser.email?.split('@')[0] || `user${Date.now()}`,
                    bio: '',
                    photoURL: '',
                    role: 'user',
                    createdAt: nowISO,
                    lastActiveAt: nowISO,
                    stats: JSON.stringify({
                        totalPhrases: 0,
                        totalComments: 0,
                        totalReposts: 0,
                        currentStreak: 0,
                        longestStreak: 0,
                        lastStudyDate: null,

                    }),
                    subscription: JSON.stringify({
                        status: 'trial',
                        plan: null,
                        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                        currentPeriodEnd: null,
                    }),
                    settings: JSON.stringify({
                        dailyGoal: 10,
                        preferredStyles: ['twitter', 'instagram'],
                        notificationsEnabled: true,
                    }),
                };

                await databases.createDocument(DB_ID, 'users', currentUser.$id, newProfile);
                
                // Parse it back for local state
                setProfile({
                    ...newProfile,
                    stats: JSON.parse(newProfile.stats),
                    subscription: JSON.parse(newProfile.subscription),
                    settings: JSON.parse(newProfile.settings)
                } as UserProfile);
            } else {
                console.warn('[Auth] Appwrite profile fetch failed:', e);
            }
        }
    }, [user]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            setLoading(false);
            return;
        }

        const checkSession = async () => {
            try {
                const currentUser = await account.get();
                // Adapt to Firebase-like User Interface for frontend compatibility
                const adaptedUser: AppUser = {
                    $id: currentUser.$id,
                    email: currentUser.email,
                    name: currentUser.name,
                    photoURL: currentUser.prefs?.photoURL || null,
                    getJwt: getCachedJwt, // Use cached JWT — avoids minting a new one every call
                };
                setUser(adaptedUser);
                // ✅ Unblock the UI immediately — profile loads in background
                setLoading(false);
                refreshProfile(adaptedUser).catch(e => console.warn('[Auth] Background profile fetch failed:', e));
            } catch (error: any) {
                if (error instanceof AppwriteException && error.code === 401) {
                    // Not logged in, completely normal
                    setUser(null);
                    setProfile(null);
                } else {
                    console.error('[Auth] Session check failed:', error);
                }
                setLoading(false);
            }
        };

        checkSession();
    }, []);

    const signIn = useCallback(async () => {
        try {
            // Success → /auth/callback (retries account.get() for mobile ITP cookie delay)
            // Failure → / (landing page)
            account.createOAuth2Session(
                OAuthProvider.Google,
                window.location.origin + '/auth/callback',
                window.location.origin + '/'
            );
        } catch (error) {
            console.error('[Auth] signIn failed:', error);
        }
    }, []);

    const signInWithEmail = useCallback(async (email?: string, password?: string) => {
        try {
            const authEmail = email || 'test@vocabbuilder.dev';
            const authPassword = password || 'TestUser123!';
            await account.createEmailPasswordSession(authEmail, authPassword);
            // Reload page to refresh all Appwrite context properly
            window.location.reload();
        } catch (error) {
            console.error('[Auth] signInWithEmail failed:', error);
            throw error; // Rethrow to handle in UI
        }
    }, []);

    const signOut = useCallback(async () => {
        try {
            await account.deleteSession('current');
            setUser(null);
            setProfile(null);
        } catch (error) {
            console.error('[Auth] signOut failed:', error);
        }
    }, []);

    return (
        <AuthContext.Provider value={{ user, profile, loading, signIn, signInWithEmail, signOut, refreshProfile }}>
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
