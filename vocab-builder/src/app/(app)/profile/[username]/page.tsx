'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Edit2,
    MessageCircle,
    Bookmark,
    Flame,
    Trophy,
    Brain,
    ThumbsUp,
    MessageSquare,
    Share2,
    MoreHorizontal,
    ChevronRight,
    BookOpen,
    Code,
    Utensils,
    Lock,
    GraduationCap,
    Award,
    Users,
    MapPin,
    LayoutList
} from 'lucide-react';
import LearningDashboard from '@/components/learning-dashboard';
import { FavoriteQuote } from '@/lib/db/favorite-quotes';
import { getUserReposts } from '@/lib/db/social';
import { getPost } from '@/lib/db/posts';
import { getSavedArticles, unsaveArticle, SavedArticle } from '@/lib/db/bookmarks';
import { getLearningStats } from '@/lib/db/learning-stats';
import { Repost } from '@/lib/db/types';
import { Timestamp } from 'firebase/firestore';
import Link from 'next/link';
import { toast } from 'sonner';
import { sanitizeHtml } from '@/lib/sanitize';
import { useConfirm } from '@/components/confirm-dialog';
import { EditorialLoader } from '@/components/ui/editorial-loader';

// Replaced CommentsData with FavoriteQuote directly from shared types

interface RepostWithPost extends Repost {
    post?: {
        authorName: string;
        authorUsername: string;
        content: string;
    };
}

export default function ProfilePage() {
    const { profile, user } = useAuth();
    const [isOwnProfile] = useState(true);
    const [loading, setLoading] = useState(true);
    const [editBioOpen, setEditBioOpen] = useState(false);
    const [bio, setBio] = useState(profile?.bio || '');
    const [favQuotes, setFavQuotes] = useState<FavoriteQuote[]>([]);
    const [reposts, setReposts] = useState<RepostWithPost[]>([]);
    const [savedArticles, setSavedArticles] = useState<Array<SavedArticle & { post?: { title?: string; content: string; authorName: string; coverImage?: string } }>>([]);
    const [readingLists, setReadingLists] = useState<Array<{ id: string; name: string; postIds: string[]; coverColor?: string }>>([]);
    const [activeTab, setActiveTab] = useState('comments');

    // Learning stats for dashboard
    const [learningStats, setLearningStats] = useState({
        totalPhrases: profile?.stats?.totalPhrases || 0,
        masteredPhrases: Math.floor((profile?.stats?.totalPhrases || 0) * 0.3),
        learningPhrases: Math.ceil((profile?.stats?.totalPhrases || 0) * 0.7),
        scenariosCompleted: 0,
        currentStreak: profile?.stats?.currentStreak || 0,
        bestStreak: profile?.stats?.longestStreak || 0,
        weeklyReviews: 0,
        activityData: Array(84).fill(0),
        totalHistory: Array(14).fill(0),
        masteredHistory: Array(14).fill(0),
        recentScenarios: [] as Array<{ id: string; scenario: string; phrasesUsed: number; totalPhrases: number; date: Date }>,
    });

    // Confirm dialog
    const { confirm, DialogComponent } = useConfirm();

    useEffect(() => {
        const loadData = async () => {
            if (!user) return;

            try {
                const stats = await getLearningStats(user.uid);
                setLearningStats(prev => ({
                    ...prev,
                    scenariosCompleted: stats.scenariosCompleted,
                    currentStreak: stats.currentStreak || prev.currentStreak,
                    bestStreak: Math.max(stats.bestStreak, prev.bestStreak),
                    weeklyReviews: stats.weeklyReviews,
                    activityData: stats.activityData,
                    recentScenarios: stats.recentScenarios,
                    totalHistory: stats.totalHistory,
                    masteredHistory: stats.masteredHistory,
                    totalPhrases: stats.totalPhrases,
                    masteredPhrases: stats.masteredPhrases
                }));

                const token = await user.getIdToken();
                const favRes = await fetch('/api/user/favorite-quotes', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'x-user-id': user.uid
                    }
                });
                if (favRes.ok) {
                    const favData = await favRes.json();
                    setFavQuotes(favData.quotes || []);
                }

                const userReposts = await getUserReposts(user.uid);
                const repostsWithPosts = await Promise.all(
                    userReposts.map(async (r) => {
                        const post = await getPost(r.postId);
                        return {
                            ...r,
                            post: post ? {
                                authorName: post.authorName,
                                authorUsername: post.authorUsername,
                                content: post.content,
                            } : undefined,
                        };
                    })
                );
                setReposts(repostsWithPosts);

                const saved = await getSavedArticles(user.uid);
                const savedWithPosts = await Promise.all(
                    saved.map(async (s) => {
                        const post = await getPost(s.postId);
                        return {
                            ...s,
                            post: post ? {
                                title: post.title,
                                content: post.content,
                                authorName: post.authorName,
                                coverImage: post.coverImage,
                            } : undefined,
                        };
                    })
                );
                setSavedArticles(savedWithPosts);

                // Fetch reading lists
                const listsResponse = await fetch('/api/user/reading-lists', {
                    headers: { 'x-user-id': user.uid },
                });
                if (listsResponse.ok) {
                    const listsData = await listsResponse.json();
                    setReadingLists(listsData.lists || []);
                }
            } catch (error) {
                console.error('Error loading profile data:', error);
            }

            setLoading(false);
        };

        loadData();
    }, [user]);

    const formatTime = (timestamp: Timestamp | Date) => {
        const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
        const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
        if (hours < 1) return 'Just now';
        if (hours < 24) return `${hours}h ago`;
        if (hours < 48) return 'Yesterday';
        return `${Math.floor(hours / 24)} days ago`;
    };

    const handleSaveBio = () => {
        setEditBioOpen(false);
    };

    if (loading) {
        return (
            <div className="w-full py-8 px-8 flex items-center justify-center min-h-[50vh]">
                <EditorialLoader size="md" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="w-full py-12 px-8 text-center">
                <p className="text-neutral-500">Profile not found</p>
            </div>
        );
    }

    const tabs = [
        { id: 'comments', label: `Fav Quotes (${favQuotes.length})` },
        { id: 'reposts', label: `Reposts (${reposts.length})` },
        { id: 'bookmarked', label: `Bookmarked (${savedArticles.length})` },
        { id: 'insights', label: 'Insights' },
    ];

    return (
        <>
            {DialogComponent}
            <div className="w-full pt-6 font-sans">
                {/* Profile Card */}
                <div className="px-8 mb-8">
                    <div className="bg-white border border-neutral-200 py-12 px-8">
                        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                            {/* Avatar */}
                            <div className="relative flex-shrink-0">
                                <Avatar className="h-28 w-28 md:h-24 md:w-24 border-2 border-neutral-200 bg-white">
                                    <AvatarImage src={profile.photoURL} alt={profile.displayName} />
                                    <AvatarFallback className="text-2xl bg-neutral-900 text-white">
                                        {profile.displayName?.charAt(0) || 'U'}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="absolute bottom-1 right-1 h-4 w-4 bg-neutral-900 border-2 border-white rounded-full"></div>
                            </div>

                            {/* Info */}
                            <div className="flex-1 text-center md:text-left">
                                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                                    <div>
                                        <h1 className="text-2xl font-serif text-neutral-900">{profile.displayName}</h1>
                                        <p className="text-neutral-500 mt-1 text-sm flex items-center justify-center md:justify-start gap-1.5">
                                            <GraduationCap className="h-3.5 w-3.5" />
                                            {profile.bio || 'Language enthusiast'}
                                        </p>
                                        <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-3 text-sm text-neutral-500">
                                            <span className="flex items-center gap-1">
                                                <span className="font-semibold text-neutral-900">{learningStats.totalPhrases}</span> phrases
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="font-semibold text-neutral-900">{learningStats.scenariosCompleted}</span> scenarios
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Flame className="h-3.5 w-3.5 text-neutral-900" />
                                                <span className="font-semibold text-neutral-900">{learningStats.currentStreak}</span> day streak
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2 justify-center md:justify-start">
                                        {isOwnProfile ? (
                                            <Dialog open={editBioOpen} onOpenChange={setEditBioOpen}>
                                                <DialogTrigger asChild>
                                                    <button className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors">
                                                        <Edit2 className="h-3.5 w-3.5" />
                                                        Edit Profile
                                                    </button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Edit Profile</DialogTitle>
                                                        <DialogDescription>
                                                            Update your bio to tell others about yourself.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <Textarea
                                                        value={bio}
                                                        onChange={(e) => setBio(e.target.value)}
                                                        placeholder="Write a short bio..."
                                                        className="min-h-[100px]"
                                                        maxLength={160}
                                                    />
                                                    <p className="text-xs text-neutral-400 text-right">{bio.length}/160</p>
                                                    <DialogFooter>
                                                        <Button variant="outline" onClick={() => setEditBioOpen(false)}>Cancel</Button>
                                                        <Button onClick={handleSaveBio} className="bg-neutral-900 hover:bg-neutral-800 text-white">Save</Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        ) : (
                                            <>
                                                <button className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors">
                                                    <Users className="h-3.5 w-3.5" />
                                                    Follow
                                                </button>
                                                <button className="flex items-center gap-2 px-4 py-2 border border-neutral-200 text-neutral-700 text-sm font-medium hover:bg-neutral-50 transition-colors">
                                                    <MessageCircle className="h-3.5 w-3.5" />
                                                    Message
                                                </button>
                                            </>
                                        )}
                                        <button className="h-9 w-9 flex items-center justify-center border border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats Dashboard */}
                <div className="px-8 mb-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="flex flex-col gap-1 p-5 border border-neutral-200 bg-white relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-8 group-hover:opacity-15 transition-opacity">
                                <Bookmark className="h-8 w-8 text-[#1e3a5f]" />
                            </div>
                            <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-medium">Phrases Saved</p>
                            <div className="flex items-end gap-2">
                                <p className="text-2xl font-serif text-neutral-900">{learningStats.totalPhrases}</p>
                                <span className="text-neutral-400 text-xs mb-0.5">total</span>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1 p-5 border border-neutral-200 bg-white relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-8 group-hover:opacity-15 transition-opacity">
                                <Flame className="h-8 w-8 text-amber-500" />
                            </div>
                            <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-medium">Day Streak</p>
                            <div className="flex items-end gap-2">
                                <p className="text-2xl font-serif text-neutral-900">{learningStats.currentStreak}</p>
                                {learningStats.currentStreak > 0 && (
                                    <span className="text-amber-700 text-[10px] font-semibold uppercase tracking-[0.1em] bg-amber-50 border border-amber-200 px-1.5 py-0.5 mb-0.5">Active</span>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col gap-1 p-5 border border-neutral-200 bg-white relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-8 group-hover:opacity-15 transition-opacity">
                                <Trophy className="h-8 w-8 text-[#1e3a5f]" />
                            </div>
                            <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-medium">Scenarios Completed</p>
                            <div className="flex items-end gap-2">
                                <p className="text-2xl font-serif text-neutral-900">{learningStats.scenariosCompleted}</p>
                                <span className="text-neutral-400 text-xs mb-0.5">sessions</span>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1 p-5 border border-neutral-200 bg-white relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-8 group-hover:opacity-15 transition-opacity">
                                <Brain className="h-8 w-8 text-amber-500" />
                            </div>
                            <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-medium">Mastered Phrases</p>
                            <div className="flex items-end gap-2">
                                <p className="text-2xl font-serif text-neutral-900">{learningStats.masteredPhrases}</p>
                                <span className="text-neutral-400 text-xs mb-0.5">phrases</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Grid */}
                <div className="px-8 pb-12">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* Left Column - Main Content */}
                        <div className="lg:col-span-8 flex flex-col gap-6">
                            {/* Tabs */}
                            <div className="border-b border-neutral-200">
                                <nav className="flex gap-8">
                                    {tabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`border-b-2 font-medium text-sm py-3 px-1 transition-colors ${activeTab === tab.id
                                                ? 'border-neutral-900 text-neutral-900'
                                                : 'border-transparent text-neutral-400 hover:text-neutral-700'
                                                }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </nav>
                            </div>

                            {/* Tab Content */}
                            {activeTab === 'comments' && (
                                <div className="flex flex-col gap-4">
                                    {favQuotes.length === 0 ? (
                                        <div className="p-8 bg-white border border-neutral-200 text-center">
                                            <Bookmark className="h-6 w-6 text-neutral-300 mx-auto mb-3" />
                                            <p className="text-neutral-500 text-sm">No favorite quotes yet. Like a quote to see it here!</p>
                                        </div>
                                    ) : (
                                        favQuotes.map((quote) => (
                                            <Link key={quote.id} href={`/post/${quote.postId}`} className="block">
                                                <div className="p-4 bg-white border border-neutral-200 hover:border-neutral-300 transition-colors">
                                                    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
                                                        <Flame className="h-3.5 w-3.5 text-neutral-900" />
                                                        <span className="font-medium uppercase tracking-[0.1em]">Favorite Quote</span>
                                                    </div>
                                                    <div className="mb-3 p-4 bg-neutral-50 border border-neutral-100 relative">
                                                        <p className="text-sm md:text-base font-serif text-neutral-800 italic leading-relaxed">
                                                            "{quote.text}"
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-col gap-1 mt-3">
                                                        <p className="text-xs font-semibold text-neutral-900">
                                                            {quote.postTitle} <span className="text-neutral-400 font-normal">by {quote.author}</span>
                                                        </p>
                                                        <p className="text-[11px] text-neutral-400">
                                                            Saved {formatTime(new Date(quote.createdAt))}
                                                        </p>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))
                                    )}
                                </div>
                            )}

                            {activeTab === 'reposts' && (
                                <div className="flex flex-col gap-4">
                                    {reposts.length === 0 ? (
                                        <div className="p-8 bg-white border border-neutral-200 text-center">
                                            <Share2 className="h-6 w-6 text-neutral-300 mx-auto mb-3" />
                                            <p className="text-neutral-500 text-sm">No reposts yet. Click the repost button on posts you like!</p>
                                        </div>
                                    ) : (
                                        reposts.map((repost) => (
                                            <Link key={repost.id} href={`/post/${repost.postId}`} className="block">
                                                <div className="p-4 bg-white border border-neutral-200 hover:border-neutral-300 transition-colors">
                                                    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
                                                        <Share2 className="h-3.5 w-3.5" />
                                                        <span className="font-medium uppercase tracking-[0.1em]">Reposted</span>
                                                    </div>
                                                    {repost.post ? (
                                                        <>
                                                            <p className="text-[11px] text-neutral-400 mb-1">from @{repost.post.authorUsername}</p>
                                                            <p className="text-sm text-neutral-700 line-clamp-2">{repost.post.content}</p>
                                                        </>
                                                    ) : (
                                                        <p className="text-sm text-neutral-400 italic">Post no longer available</p>
                                                    )}
                                                    <p className="text-xs text-neutral-400 mt-2">{formatTime(repost.createdAt)}</p>
                                                </div>
                                            </Link>
                                        ))
                                    )}
                                </div>
                            )}

                            {activeTab === 'bookmarked' && (
                                <div className="flex flex-col gap-4">
                                    {savedArticles.length === 0 ? (
                                        <div className="p-8 bg-white border border-neutral-200 text-center">
                                            <Bookmark className="h-6 w-6 text-neutral-300 mx-auto mb-3" />
                                            <p className="text-neutral-500 text-sm">No saved articles yet. Click the bookmark icon on articles to save them!</p>
                                        </div>
                                    ) : (
                                        savedArticles.map((saved) => (
                                            <Link key={saved.id} href={`/post/${saved.postId}`} className="block">
                                                <div className="p-4 bg-white border border-neutral-200 hover:border-neutral-300 transition-colors">
                                                    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-3">
                                                        <Bookmark className="h-3.5 w-3.5 fill-current" />
                                                        <span className="font-medium uppercase tracking-[0.1em]">Saved Article</span>
                                                    </div>
                                                    {saved.post ? (
                                                        <div className="flex gap-4">
                                                            {saved.post.coverImage && (
                                                                <div className="flex-shrink-0 w-24 h-24 overflow-hidden bg-neutral-100">
                                                                    <img
                                                                        src={saved.post.coverImage}
                                                                        alt={saved.post.title || 'Article cover'}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                </div>
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                {saved.post.title && (
                                                                    <h4 className="font-serif text-neutral-900 mb-1 line-clamp-2">{saved.post.title}</h4>
                                                                )}
                                                                <p className="text-[11px] text-neutral-400 mb-1">by {saved.post.authorName}</p>
                                                                <p className="text-sm text-neutral-600 line-clamp-2">
                                                                    {saved.post.content.replace(/<[^>]*>/g, '').substring(0, 100)}...
                                                                </p>
                                                                <p className="text-[11px] text-neutral-400 mt-2">Saved {formatTime(saved.savedAt)}</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-neutral-400 italic">Article no longer available</p>
                                                    )}
                                                </div>
                                            </Link>
                                        ))
                                    )}
                                </div>
                            )}

                            {activeTab === 'insights' && (
                                <LearningDashboard stats={learningStats} />
                            )}
                        </div>

                        {/* Right Column - Sidebar */}
                        <div className="lg:col-span-4 flex flex-col gap-6">
                            {/* Reading Lists */}
                            <div className="bg-white border border-neutral-200 p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="h-9 w-9 border border-[#1e3a5f]/20 bg-[#1e3a5f]/5 flex items-center justify-center">
                                        <LayoutList className="h-4 w-4 text-[#1e3a5f]" />
                                    </div>
                                    <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-[0.1em]">My Reading Lists</h3>
                                </div>
                                {readingLists.length === 0 ? (
                                    <p className="text-sm text-neutral-500">
                                        No reading lists yet. Clone collections from the Library to get started.
                                    </p>
                                ) : (
                                    <div className="space-y-3">
                                        {readingLists.map((list) => (
                                            <div
                                                key={list.id}
                                                className="flex items-center gap-3 p-2 -mx-2 hover:bg-neutral-50 transition-colors"
                                            >
                                                <div
                                                    className="w-8 h-8 flex items-center justify-center text-white font-bold text-xs shrink-0 bg-neutral-900"
                                                >
                                                    ★
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-neutral-900 truncate">{list.name}</p>
                                                    <p className="text-xs text-neutral-400">{(list.postIds as string[])?.length || 0} materials</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Badges - Coming Soon */}
                            <div className="bg-white border border-neutral-200 border-dashed p-5 relative overflow-hidden">
                                <div className="absolute top-3 right-3">
                                    <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-neutral-400 border border-neutral-200 px-2 py-1">
                                        Coming Soon
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="h-9 w-9 border border-neutral-200 flex items-center justify-center">
                                        <Award className="h-4 w-4 text-neutral-900" />
                                    </div>
                                    <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-[0.1em]">Badges</h3>
                                </div>
                                <p className="text-sm text-neutral-500 mb-4">
                                    Earn badges for reaching milestones, maintaining streaks, and mastering vocabulary.
                                </p>
                                <div className="flex flex-wrap gap-2 opacity-30">
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 text-neutral-600 border border-neutral-200 text-xs font-medium">
                                        <Award className="h-3 w-3" />
                                        Lexicon Master
                                    </div>
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 text-neutral-600 border border-neutral-200 text-xs font-medium">
                                        <Flame className="h-3 w-3" />
                                        On Fire
                                    </div>
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 text-neutral-600 border border-neutral-200 text-xs font-medium">
                                        <Trophy className="h-3 w-3" />
                                        100 Days
                                    </div>
                                </div>
                            </div>

                            {/* Social Features - Coming Soon */}
                            <div className="bg-white border border-neutral-200 border-dashed p-5 relative overflow-hidden">
                                <div className="absolute top-3 right-3">
                                    <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-neutral-400 border border-neutral-200 px-2 py-1">
                                        Coming Soon
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="h-9 w-9 border border-neutral-200 flex items-center justify-center">
                                        <Users className="h-4 w-4 text-neutral-900" />
                                    </div>
                                    <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-[0.1em]">Connect & Learn</h3>
                                </div>
                                <p className="text-sm text-neutral-500 mb-4">
                                    Follow friends, compare progress, and get personalized learner recommendations.
                                </p>
                                <div className="flex items-center gap-3 opacity-30">
                                    <div className="flex -space-x-2">
                                        <div className="h-8 w-8 rounded-full bg-neutral-200 border-2 border-white"></div>
                                        <div className="h-8 w-8 rounded-full bg-neutral-300 border-2 border-white"></div>
                                        <div className="h-8 w-8 rounded-full bg-neutral-400 border-2 border-white"></div>
                                    </div>
                                    <span className="text-xs text-neutral-400">+3 learners like you</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
