'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    ArrowLeft,
    Loader2,
    BookOpen,
    MessageSquare,
    FileText,
    Coins,
    CheckCircle,
    Calendar
} from 'lucide-react';
import Link from 'next/link';
import {
    getUserDebates,
    getUserPosts,
    getUserTokenUsage,
    getUserSavedPhrases,
    UserDebate,
    UserPost,
    UserTokenUsage
} from '@/lib/firestore';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';

const ADMIN_EMAIL = 'ducanhcontactonfb@gmail.com';

export default function AdminUserPage() {
    const params = useParams();
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const userId = params.userId as string;

    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [activeTab, setActiveTab] = useState<'phrases' | 'debates' | 'posts' | 'tokens'>('phrases');

    // User data
    const [phrases, setPhrases] = useState<Array<{ id: string; phrase: string; meaning: string; createdAt: Date; usageCount: number }>>([]);
    const [debates, setDebates] = useState<UserDebate[]>([]);
    const [posts, setPosts] = useState<UserPost[]>([]);
    const [tokens, setTokens] = useState<{ total: number; calls: number; byEndpoint: UserTokenUsage[] } | null>(null);

    const isAdmin = user?.email === ADMIN_EMAIL;

    useEffect(() => {
        if (!authLoading && (!user || !isAdmin)) {
            router.push('/feed');
        }
    }, [user, authLoading, isAdmin, router]);

    useEffect(() => {
        if (!userId || !isAdmin || !db) return;

        const loadUserData = async () => {
            if (!db) return;
            setLoading(true);
            try {
                // Load user profile
                const userDoc = await getDoc(doc(db, 'users', userId));
                if (userDoc.exists()) {
                    setUserProfile({ uid: userDoc.id, ...userDoc.data() } as UserProfile);
                }

                // Load all user data in parallel
                const [phrasesData, debatesData, postsData] = await Promise.all([
                    getUserSavedPhrases(userId),
                    getUserDebates(userId),
                    getUserPosts(userId),
                ]);

                setPhrases(phrasesData);
                setDebates(debatesData);
                setPosts(postsData);

                // Load token usage if we have email
                if (userDoc.exists()) {
                    const email = userDoc.data().email;
                    if (email) {
                        const tokensData = await getUserTokenUsage(email);
                        setTokens(tokensData);
                    }
                }
            } catch (error) {
                console.error('Error loading user data:', error);
            }
            setLoading(false);
        };

        loadUserData();
    }, [userId, isAdmin]);

    if (authLoading || loading) {
        return (
            <div className="max-w-4xl mx-auto py-12 px-4 flex flex-col items-center justify-center min-h-[50vh] font-sans">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-400 mb-4" />
                <p className="text-neutral-500">Loading user data...</p>
            </div>
        );
    }

    if (!userProfile) {
        return (
            <div className="max-w-4xl mx-auto py-12 px-4 text-center font-sans">
                <p className="text-neutral-500">User not found.</p>
                <Link href="/admin">
                    <Button variant="outline" className="mt-4">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Admin
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto py-6 px-4 font-sans">
            {/* Header */}
            <div className="mb-6">
                <Link href="/admin">
                    <Button variant="ghost" size="sm" className="text-neutral-500 mb-4">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Admin
                    </Button>
                </Link>

                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-neutral-900">{userProfile.displayName || 'User'}</h1>
                        <p className="text-neutral-500">@{userProfile.username} · {userProfile.email}</p>
                    </div>
                    <Badge variant="secondary" className="text-sm">
                        {userProfile.subscription?.status || 'free'}
                    </Badge>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <Card>
                    <CardContent className="pt-4 pb-4 text-center">
                        <BookOpen className="h-5 w-5 mx-auto mb-2 text-neutral-400" />
                        <div className="text-2xl font-bold">{phrases.length}</div>
                        <div className="text-xs text-neutral-500">Phrases</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-4 text-center">
                        <MessageSquare className="h-5 w-5 mx-auto mb-2 text-neutral-400" />
                        <div className="text-2xl font-bold">{debates.length}</div>
                        <div className="text-xs text-neutral-500">Debates</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-4 text-center">
                        <FileText className="h-5 w-5 mx-auto mb-2 text-neutral-400" />
                        <div className="text-2xl font-bold">{posts.length}</div>
                        <div className="text-xs text-neutral-500">Posts</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-4 text-center">
                        <Coins className="h-5 w-5 mx-auto mb-2 text-neutral-400" />
                        <div className="text-2xl font-bold">{tokens?.total.toLocaleString() || 0}</div>
                        <div className="text-xs text-neutral-500">Tokens</div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <TabsList className="grid w-full grid-cols-4 mb-6">
                    <TabsTrigger value="phrases">Phrases</TabsTrigger>
                    <TabsTrigger value="debates">Debates</TabsTrigger>
                    <TabsTrigger value="posts">Posts</TabsTrigger>
                    <TabsTrigger value="tokens">Token Usage</TabsTrigger>
                </TabsList>

                {/* Phrases Tab */}
                <TabsContent value="phrases">
                    <Card>
                        <CardHeader>
                            <CardTitle>Saved Phrases ({phrases.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {phrases.length === 0 ? (
                                <p className="text-neutral-500 text-center py-8">No saved phrases yet.</p>
                            ) : (
                                <div className="space-y-3">
                                    {phrases.map((p) => (
                                        <div key={p.id} className="p-4 bg-neutral-50 rounded-lg border border-neutral-100">
                                            <p className="font-medium text-neutral-900">{p.phrase}</p>
                                            <p className="text-sm text-neutral-600 mt-1">{p.meaning}</p>
                                            <div className="flex gap-3 text-xs text-neutral-400 mt-2">
                                                <span>Used {p.usageCount}x</span>
                                                <span>·</span>
                                                <span>Added {p.createdAt.toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Debates Tab */}
                <TabsContent value="debates">
                    <Card>
                        <CardHeader>
                            <CardTitle>Debate History ({debates.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {debates.length === 0 ? (
                                <p className="text-neutral-500 text-center py-8">No debates yet.</p>
                            ) : (
                                <div className="space-y-3">
                                    {debates.map((d) => (
                                        <div key={d.id} className="p-4 bg-neutral-50 rounded-lg border border-neutral-100">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <p className="font-medium text-neutral-900">{d.topic}</p>
                                                    <div className="flex gap-3 text-xs text-neutral-500 mt-1">
                                                        <span className="flex items-center gap-1">
                                                            <MessageSquare className="h-3 w-3" />
                                                            {d.turnsCount} turns
                                                        </span>
                                                        <span>·</span>
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            {d.createdAt.toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    {d.phrasesNatural > 0 && (
                                                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                                                            <CheckCircle className="h-3 w-3 mr-1" />
                                                            {d.phrasesNatural} natural
                                                        </Badge>
                                                    )}
                                                    <Badge variant="secondary">
                                                        {d.phrasesTotal} phrases
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Posts Tab */}
                <TabsContent value="posts">
                    <Card>
                        <CardHeader>
                            <CardTitle>Posts & Articles ({posts.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {posts.length === 0 ? (
                                <p className="text-neutral-500 text-center py-8">No posts created.</p>
                            ) : (
                                <div className="space-y-3">
                                    {posts.map((post) => (
                                        <div key={post.id} className="p-4 bg-neutral-50 rounded-lg border border-neutral-100">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-neutral-900 truncate">
                                                        {post.title || post.content.slice(0, 80) + '...'}
                                                    </p>
                                                    <div className="flex gap-3 text-xs text-neutral-500 mt-1">
                                                        <span>{post.commentCount} comments</span>
                                                        <span>·</span>
                                                        <span>{post.repostCount} reposts</span>
                                                        <span>·</span>
                                                        <span>{post.createdAt.toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                                <Badge variant="secondary">
                                                    {post.isArticle ? 'Article' : 'Post'}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tokens Tab */}
                <TabsContent value="tokens">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <Card>
                                <CardContent className="pt-6 text-center">
                                    <div className="text-3xl font-bold text-neutral-900">
                                        {tokens?.total.toLocaleString() || 0}
                                    </div>
                                    <div className="text-sm text-neutral-500 mt-1">Total Tokens Used</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6 text-center">
                                    <div className="text-3xl font-bold text-neutral-900">
                                        {tokens?.calls || 0}
                                    </div>
                                    <div className="text-sm text-neutral-500 mt-1">API Calls</div>
                                </CardContent>
                            </Card>
                        </div>

                        {tokens && tokens.byEndpoint.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Usage by Endpoint</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {tokens.byEndpoint.map((e) => (
                                            <div key={e.endpoint} className="flex justify-between items-center p-3 bg-neutral-50 rounded-lg">
                                                <span className="text-neutral-700 font-medium">{e.endpoint}</span>
                                                <div className="text-right">
                                                    <span className="text-neutral-900 font-medium">{e.totalTokens.toLocaleString()}</span>
                                                    <span className="text-neutral-400 text-sm ml-2">({e.callCount} calls)</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {(!tokens || tokens.byEndpoint.length === 0) && (
                            <Card>
                                <CardContent className="py-12 text-center text-neutral-500">
                                    <Coins className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>No token usage data for this user.</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
