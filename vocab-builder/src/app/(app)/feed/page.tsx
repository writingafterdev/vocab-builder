'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
    Search,
    Plus,
    MoreHorizontal,
    BookOpen,
    Bookmark,
    Clock,
    Check,
    ChevronRight,
    Link as LinkIcon,
    FileText,
    Sparkles,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { getSourceLogo } from '@/lib/sources';
import { getPosts, getPostsPaginated, createUserArticle } from '@/lib/db/posts';
import { getUserPhrases } from '@/lib/db/srs';

// import { getCollections } from '@/lib/db/collections';
import { RichTextEditor } from '@/components/rich-text-editor';
import type { Post as PostType, Collection, LexileLevel } from '@/lib/db/types';
import { Timestamp } from '@/lib/appwrite/firestore';
import { BentoGrid, BentoCard, getCardSize, getBentoPattern, StackingCards, StackingCardItem } from '@/components/library';
import { LibraryCard as NewLibraryCard } from '@/components/library';
import { QuoteSwiper } from '@/components/quotes';
import { FeedFilter } from '@/components/article/FeedFilter';

type FilterTab = 'all' | 'books' | 'articles' | 'news' | 'unread';

interface LibraryPost extends PostType {
    progress?: number; // 0-100
    phrasesCount?: number;
    isRead?: boolean;
    wordCount?: number;
    topics?: string[];
    importTopic?: string;
}

// Library Card Component matching mockup design
function LibraryCard({ post, userLists, onAddToList, variant = 'standard', className }: {
    post: LibraryPost;
    userLists?: Array<{ id: string; name: string; postIds: string[] }>;
    onAddToList?: (listId: string, postId: string) => void;
    variant?: 'standard' | 'wide' | 'featured';
    className?: string;
}) {
    const router = useRouter();
    const progress = post.progress || 0;
    const isRead = post.isRead || progress === 100;
    const wordCount = post.wordCount || Math.ceil((post.content || '').length / 5);
    const phrasesCount = post.phrasesCount || 0;

    // Helper to determine styles based on variant
    const isWide = variant === 'wide';
    const isFeatured = variant === 'featured';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatTime = (timestamp: Timestamp | Date | any | null | undefined) => {
        if (!timestamp) return 'Just now';

        let date: Date;
        if (timestamp instanceof Timestamp) {
            date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            date = timestamp;
        } else if (timestamp._seconds !== undefined) {
            // REST API format: { _seconds, _nanoseconds }
            date = new Date(timestamp._seconds * 1000);
        } else if (timestamp.seconds !== undefined) {
            // Alternative REST format: { seconds, nanoseconds }
            date = new Date(timestamp.seconds * 1000);
        } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
            date = new Date(timestamp);
        } else {
            return 'Just now';
        }

        const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
        if (hours < 1) return 'Just now';
        if (hours < 24) return `${hours} hours ago`;
        if (hours < 48) return 'Yesterday';
        return `${Math.floor(hours / 24)} days ago`;
    };

    // Decode HTML entities like &#8217; -> '
    const decodeHtmlEntities = (text: string) => {
        const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null;
        if (textarea) {
            textarea.innerHTML = text;
            return textarea.value;
        }
        // Fallback for SSR: decode common entities manually
        return text
            .replace(/&#8217;/g, "'")
            .replace(/&#8216;/g, "'")
            .replace(/&#8220;/g, '"')
            .replace(/&#8221;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'");
    };

    const cleanContent = (post.content || '').replace(/<[^>]*>?/gm, '');
    const previewText = decodeHtmlEntities(cleanContent.slice(0, 150)) + '...';

    // Determine source type for icon
    const getSourceIcon = () => {
        if (post.source?.toLowerCase().includes('epub') || post.source?.toLowerCase().includes('book')) {
            return (
                <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                    <BookOpen className="h-5 w-5 text-orange-600" />
                </div>
            );
        }
        if (getSourceLogo(post.source)) {
            return (
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                    <img
                        src={getSourceLogo(post.source)!}
                        alt={post.source || 'source'}
                        className="w-6 h-6 object-contain opacity-70"
                    />
                </div>
            );
        }
        return (
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-sm font-bold text-foreground">
                {(post.source || 'A')[0].toUpperCase()}
            </div>
        );
    };

    return (
        <motion.article
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "group bg-card rounded-lg p-5 shadow-sm border border-border hover:shadow-md transition-all duration-200 flex flex-col justify-between",
                isWide ? "md:flex-row md:gap-6" : "flex-col",
                className
            )}
        >
            <div className={cn("flex flex-col h-full", isWide ? "flex-1" : "")}>
                {/* Header: Source + Author + Date + Read Badge */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                        {getSourceIcon()}
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">{post.source || 'Article'}</h3>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{post.authorName || post.authorUsername}</span>
                                <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/50" />
                                <span>{formatTime(post.createdAt)}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isRead && (
                            <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
                                <Check className="h-3 w-3" />
                                Read
                            </span>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted transition-colors">
                                    <MoreHorizontal className="h-5 w-5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                {userLists && userLists.length > 0 ? (
                                    <>
                                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                            Add to List
                                        </div>
                                        {userLists.map((list) => {
                                            const isInList = (list.postIds as string[])?.includes(post.id);
                                            return (
                                                <DropdownMenuItem
                                                    key={list.id}
                                                    onClick={() => onAddToList?.(list.id, post.id)}
                                                    className={isInList ? 'text-green-600' : ''}
                                                >
                                                    <span className="mr-2">{isInList ? '✓' : '★'}</span>
                                                    {list.name}
                                                </DropdownMenuItem>
                                            );
                                        })}
                                    </>
                                ) : (
                                    <DropdownMenuItem disabled className="text-muted-foreground">
                                        No lists yet
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Content: Title + Description */}
                <div className="flex-1 mb-4">
                    <h3
                        className={cn(
                            "font-semibold text-foreground mb-2 hover:opacity-70 cursor-pointer transition-opacity",
                            isFeatured ? "text-3xl leading-tight" : "text-lg line-clamp-2"
                        )}
                        onClick={() => router.push(`/post/${post.id}`)}
                    >
                        {post.title || 'Untitled Article'}
                    </h3>
                    <p className={cn(
                        "text-muted-foreground leading-relaxed",
                        isFeatured ? "text-lg line-clamp-3" : "text-sm line-clamp-2"
                    )}>
                        {post.caption || previewText}
                    </p>
                </div>

                {/* Footer Meta & Stats */}
                <div className="mt-auto">
                    {/* Meta: Tags + Levels + Word Count */}
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                        {post.topics && post.topics.length > 0 && (
                            <Badge variant="secondary" className="bg-muted text-foreground border-0 text-xs">
                                {post.topics[0]}
                            </Badge>
                        )}
                        {/* Level badges - only show if article has levels */}
                        {post.levels && Object.keys(post.levels).length > 0 && (
                            <div className="flex gap-0.5">
                                {(['A1', 'A2', 'B1', 'B2'] as LexileLevel[]).map(level => {
                                    const hasLevel = post.levels?.[level];
                                    return (
                                        <span
                                            key={level}
                                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${hasLevel
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-muted text-muted-foreground'
                                                }`}
                                        >
                                            {level}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                        <span className="text-xs text-muted-foreground">~{wordCount.toLocaleString()} words</span>
                    </div>

                    {/* Footer: Progress + Phrases + CTA */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            {/* Progress */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground font-medium">PROGRESS</span>
                                <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-foreground rounded-full transition-all duration-300"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <span className="text-xs text-muted-foreground">{progress}%</span>
                            </div>

                            {/* Phrases Count */}
                            <div className="flex items-center gap-1 text-muted-foreground">
                                <Bookmark className="h-3.5 w-3.5" />
                                <span className="text-xs">{phrasesCount}</span>
                            </div>
                        </div>

                        {/* CTA Button */}
                        <Button
                            size="sm"
                            variant={progress > 0 ? "outline" : "default"}
                            className={progress > 0
                                ? "border-border text-foreground hover:bg-muted"
                                : "bg-foreground hover:bg-foreground/90 text-background"
                            }
                            onClick={() => router.push(`/post/${post.id}`)}
                        >
                            {progress > 0 ? 'Continue' : 'Start Reading'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Image for Wide/Standard Layouts */}
            {post.coverImage && (
                <div className={cn(
                    "rounded-lg overflow-hidden bg-muted flex-shrink-0",
                    isWide ? "w-1/3 h-auto min-h-[200px]" : "w-full h-48 mb-4 order-first",
                    isFeatured ? "hidden md:block w-full h-64 mb-6 order-first" : ""
                )}>
                    <img src={post.coverImage} alt="" className="w-full h-full object-cover" />
                </div>
            )}

            {/* Standard layout image handling is tricky in logic above, simplifying:
                Standard: Image is rendered conditionally? 
                Actually, let's restructure:
                Standard: Image (top) -> Header -> Content -> Footer
                Wide: Left (Header -> Content -> Footer) | Right (Image)
                
                My current flex-col approach puts content first.
                For Standard, we usually want Image TOP or Image Middle?
                Original was: Header -> Content(Text+Image) -> Footer.
                
                Let's stick to a clean structure:
                If Wide: Flex Row (Left: ContentStack, Right: Image)
                If Standard: Flex Col (Header -> Image -> Content -> Footer)
            */}
        </motion.article>
    );
}









// Skeleton Loader
function LibraryCardSkeleton() {
    return (
        <div className="bg-white rounded-xl border border-neutral-200 p-5 animate-pulse">
            <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 bg-neutral-200 rounded-full" />
                <div className="w-24 h-4 bg-neutral-200 rounded" />
                <div className="w-16 h-4 bg-neutral-200 rounded" />
            </div>
            <div className="h-6 bg-neutral-200 rounded w-3/4 mb-2" />
            <div className="h-4 bg-neutral-200 rounded w-full mb-1" />
            <div className="h-4 bg-neutral-200 rounded w-2/3 mb-4" />
            <div className="flex justify-between">
                <div className="w-32 h-4 bg-neutral-200 rounded" />
                <div className="w-24 h-8 bg-neutral-200 rounded" />
            </div>
        </div>
    );
}

export default function LibraryPage() {
    const { profile, user } = useAuth();
    const router = useRouter();
    const [posts, setPosts] = useState<LibraryPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
    
    // 3-Layer Filter States
    const [activeSourceFilter, setActiveSourceFilter] = useState<string | null>(null);
    const [activeSectionFilter, setActiveSectionFilter] = useState<string | null>(null);
    const [activeTopicFilter, setActiveTopicFilter] = useState<string | null>(null);
    
    const [lastDoc, setLastDoc] = useState<any>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const observerTarget = useRef<HTMLDivElement>(null);
    // const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null); // Removed
    const [userLists, setUserLists] = useState<Array<{ id: string; name: string; postIds: string[] }>>([]);


    // Fetch user's reading lists
    const fetchUserLists = async () => {
        if (!user) return;
        try {
            const response = await fetch('/api/user/reading-lists', {
                headers: { 'x-user-id': user.$id },
            });
            if (response.ok) {
                const data = await response.json();
                setUserLists(data.lists || []);
            }
        } catch (error) {
            console.error('Error loading user lists:', error);
        }
    };

    // Handle adding/removing article from list
    const handleAddToList = async (listId: string, postId: string) => {
        if (!user) return;

        const list = userLists.find(l => l.id === listId);
        const isInList = (list?.postIds as string[])?.includes(postId);

        try {
            const response = await fetch(`/api/user/reading-lists/${listId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.$id,
                },
                body: JSON.stringify({
                    action: isInList ? 'remove' : 'add',
                    postId,
                }),
            });

            if (response.ok) {
                toast.success(isInList ? 'Removed from list' : 'Added to list');
                // Refresh lists
                fetchUserLists();

                // Track interaction for recommendations
                if (!isInList) {
                    const post = posts.find((p: any) => p.id === postId);
                    if (post && post.importTopic) {
                        fetch('/api/user/track-interaction', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-user-id': user.$id },
                            body: JSON.stringify({ postId, action: 'save', topic: post.importTopic })
                        }).catch(console.error);
                    }
                }
            } else {
                const data = await response.json();
                toast.error(data.error || 'Failed to update list');
            }
        } catch (error) {
            console.error('Error updating list:', error);
            toast.error('Failed to update list');
        }
    };

    // Import modal state
    const [showImportModal, setShowImportModal] = useState(false);
    const [importTitle, setImportTitle] = useState('');
    const [importContent, setImportContent] = useState('');
    const [importSource, setImportSource] = useState('');
    const [importUrl, setImportUrl] = useState('');
    const [importCoverImage, setImportCoverImage] = useState('');
    const [selectedListId, setSelectedListId] = useState<string>('');
    const [importing, setImporting] = useState(false);

    const [topicScores, setTopicScores] = useState<Record<string, number> | null>(null);

    const loadPosts = async () => {
        setLoading(true);
        try {
            let scores = topicScores;
            if (user?.$id && !scores) {
                const res = await fetch('/api/user/topic-scores', {
                    headers: { 'x-user-id': user.$id }
                });
                if (res.ok) {
                    const data = await res.json();
                    scores = data.topicScores || {};
                    setTopicScores(scores);
                }
            }

            const { posts: fetchedPosts, lastDoc: newLastDoc } = await getPostsPaginated(20, user?.$id, undefined, scores || undefined);
            
            const postsWithMeta = fetchedPosts.map(p => ({
                ...p,
                progress: Math.floor(Math.random() * 100),
                phrasesCount: Math.floor(Math.random() * 20),
                wordCount: Math.ceil((p.content || '').length / 5),
                isRead: Math.random() > 0.7,
            }));
            setPosts(postsWithMeta);
            setLastDoc(newLastDoc);
            setHasMore(fetchedPosts.length === 20);
        } catch (error) {
            console.error('Failed to load posts:', error);
        }
        setLoading(false);
    };

    const loadMorePosts = useCallback(async () => {
        if (!hasMore || loadingMore || !lastDoc) return;
        setLoadingMore(true);
        try {
            const { posts: fetchedPosts, lastDoc: newLastDoc } = await getPostsPaginated(20, user?.$id, lastDoc, topicScores || undefined);
            const postsWithMeta = fetchedPosts.map(p => ({
                ...p,
                progress: Math.floor(Math.random() * 100),
                phrasesCount: Math.floor(Math.random() * 20),
                wordCount: Math.ceil((p.content || '').length / 5),
                isRead: Math.random() > 0.7,
            }));
            setPosts(prev => [...prev, ...postsWithMeta]);
            setLastDoc(newLastDoc);
            setHasMore(fetchedPosts.length === 20);
        } catch (error) {
            console.error('Failed to load more posts:', error);
        }
        setLoadingMore(false);
    }, [hasMore, loadingMore, lastDoc, user?.$id, topicScores]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) {
                    loadMorePosts();
                }
            },
            { threshold: 0.1 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => observer.disconnect();
    }, [loadMorePosts, observerTarget.current]);

    const handleImport = async () => {
        if (!user || !importTitle.trim() || !importContent.trim()) {
            toast.error('Please fill in title and content');
            return;
        }

        setImporting(true);
        try {
            const articleId = await createUserArticle({
                title: importTitle.trim(),
                content: importContent.trim(),
                userId: user.$id,
                userName: profile?.displayName || user.email || 'User',
                source: importSource.trim() || 'User Import',
                originalUrl: importUrl.trim() || undefined,
                coverImage: importCoverImage.trim() || undefined,
            });

            // Add to selected reading list if one is chosen
            if (selectedListId && articleId) {
                try {
                    await fetch(`/api/user/reading-lists/${selectedListId}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user-id': user.$id,
                        },
                        body: JSON.stringify({
                            action: 'add',
                            postId: articleId,
                        }),
                    });
                } catch (listError) {
                    console.error('Error adding to list:', listError);
                }
            }

            toast.success('Article imported successfully!');
            setShowImportModal(false);
            setImportTitle('');
            setImportContent('');
            setImportSource('');
            setImportUrl('');
            setImportCoverImage('');
            setSelectedListId('');

            // Reload posts and lists to show new article
            loadPosts();
            fetchUserLists();
        } catch (error) {
            console.error('Import error:', error);
            toast.error('Failed to import article');
        }
        setImporting(false);
    };

    const [dueCount, setDueCount] = useState(0);
    const [preGeneratedQuestions, setPreGeneratedQuestions] = useState<any[]>([]);

    const loadDueCount = async () => {
        if (!user) return;
        try {
            const savedPhrases = await getUserPhrases(user.$id);
            const now = new Date();

            // Helper to handle Firestore timestamps or regular dates
            const toDate = (d: any): Date => {
                if (d instanceof Date) return d;
                if (d && typeof d === 'object' && 'toDate' in d) return d.toDate();
                return new Date(d || Date.now());
            };

            const due = savedPhrases.filter(p => {
                if (!p.nextReviewDate) return true;
                return toDate(p.nextReviewDate) <= now;
            });

            setDueCount(due.length);
        } catch (error) {
            console.error('Failed to load due count:', error);
        }
    };

    useEffect(() => {
        loadPosts();
        fetchUserLists();
        loadDueCount();

        if (user) {

            // Fetch daily pre-generated feed quizzes from Firestore via API
            fetch('/api/exercise/feed-quizzes', {
                headers: { 'x-user-id': user.$id },
                cache: 'no-store'
            })
                .then(res => res.ok ? res.json() : { quizzes: [] })
                .then(data => setPreGeneratedQuestions(data.quizzes || []))
                .catch(err => console.warn('Feed quiz fetch failed:', err));
        }
    }, [user]);

    // Filter posts
    const filteredPosts = posts.filter(post => {
        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchesSearch =
                post.title?.toLowerCase().includes(query) ||
                (post.content || '').toLowerCase().includes(query) ||
                post.authorName?.toLowerCase().includes(query);
            if (!matchesSearch) return false;
        }

        // Drop the old "Tab filter" for now, or keep it if it doesn't conflict
        if (activeFilter === 'unread' && post.isRead) return false;
        
        // 3-Layer Filters
        if (activeSourceFilter && post.source !== activeSourceFilter && (post as any).sourceId !== activeSourceFilter) return false;
        if (activeSectionFilter && (post as any).section !== activeSectionFilter) return false;
        if (activeTopicFilter && !post.topics?.includes(activeTopicFilter)) return false;

        return true;
    });

    return (
        <div className="flex gap-6 max-w-[1400px] mx-auto font-[Inter,sans-serif]">
            {/* Main Content - Full Page Scroll Experience */}
            <div className="flex-1 min-w-0">
                {/* Section 1: Quote Swiper */}
                <section className="min-h-[calc(100vh-4rem)] flex flex-col justify-center items-center relative">

                    {/* Quote Swiper - Centered */}
                    <div className="w-full max-w-4xl px-8 flex-1 flex flex-col justify-center -mt-8">
                        {user?.$id && <QuoteSwiper userId={user.$id} preGeneratedQuestions={preGeneratedQuestions} />}
                    </div>

                    {/* Scroll hint */}
                    <div className="absolute bottom-4 flex flex-col items-center gap-1 text-neutral-300 animate-bounce">
                        <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Articles</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </div>
                </section>

                {/* Section 2: Articles - Stacking Cards */}
                <section className="relative pb-32">

                    {/* Stacking Cards */}
                    <div className="relative mt-12">
                        <div className="mb-6 max-w-[700px] mx-auto px-4">
                            <FeedFilter 
                                activeSource={activeSourceFilter}
                                activeSection={activeSectionFilter}
                                activeTopic={activeTopicFilter}
                                onSourceChange={setActiveSourceFilter}
                                onSectionChange={setActiveSectionFilter}
                                onTopicChange={setActiveTopicFilter}
                            />
                        </div>
                        
                        {loading ? (
                            <div className="space-y-6 max-w-[700px] mx-auto">
                                <LibraryCardSkeleton />
                                <LibraryCardSkeleton />
                                <LibraryCardSkeleton />
                            </div>
                        ) : filteredPosts.length === 0 ? (
                            <div className="text-center py-24">
                                <BookOpen className="h-16 w-16 text-neutral-200 mx-auto mb-6" />
                                <h3 className="text-xl font-medium text-neutral-800 mb-2">No materials yet</h3>
                                <p className="text-neutral-500 mb-6">Import articles or books to build your library.</p>
                                <Button
                                    onClick={() => setShowImportModal(true)}
                                    variant="outline"
                                    className="gap-2"
                                >
                                    <Plus className="h-4 w-4" />
                                    Import Material
                                </Button>
                            </div>
                        ) : (
                            <StackingCards totalCards={filteredPosts.length}>
                                {/* Library cards */}
                                {filteredPosts.map((post) => (
                                    <StackingCardItem key={post.id} topOffset={120}>
                                        <div className="mb-4">
                                            <NewLibraryCard
                                                post={post}
                                                size="featured"
                                                userLists={userLists}
                                                onAddToList={handleAddToList}
                                            />
                                        </div>
                                    </StackingCardItem>
                                ))}
                            </StackingCards>
                        )}
                        
                        {/* Infinite Scroll trigger */}
                        {posts.length > 0 && hasMore && (
                            <div ref={observerTarget} className="w-full py-16 flex justify-center mt-8">
                                {loadingMore ? (
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-800 rounded-full animate-spin" />
                                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Loading...</span>
                                    </div>
                                ) : (
                                    <div className="h-6" />
                                )}
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {/* Import Modal */}
            <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto font-sans">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <FileText className="h-5 w-5 text-foreground" />
                            Import Material
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 mt-4">
                        {/* Title */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">
                                Title <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={importTitle}
                                onChange={(e) => setImportTitle(e.target.value)}
                                placeholder="Article title..."
                                className="w-full px-4 py-2.5 rounded-lg border border-border focus:ring-2 focus:ring-foreground focus:border-transparent text-sm bg-background"
                            />
                        </div>

                        {/* Source */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">
                                    Source
                                </label>
                                <input
                                    type="text"
                                    value={importSource}
                                    onChange={(e) => setImportSource(e.target.value)}
                                    placeholder="e.g., The Guardian, Medium..."
                                    className="w-full px-4 py-2.5 rounded-lg border border-border focus:ring-2 focus:ring-foreground focus:border-transparent text-sm bg-background"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1 flex items-center gap-1">
                                    <LinkIcon className="h-3 w-3" /> Original URL
                                </label>
                                <input
                                    type="url"
                                    value={importUrl}
                                    onChange={(e) => setImportUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="w-full px-4 py-2.5 rounded-lg border border-border focus:ring-2 focus:ring-foreground focus:border-transparent text-sm bg-background"
                                />
                            </div>
                        </div>

                        {/* Cover Image */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">
                                Cover Image URL
                            </label>
                            <input
                                type="url"
                                value={importCoverImage}
                                onChange={(e) => setImportCoverImage(e.target.value)}
                                placeholder="https://..."
                                className="w-full px-4 py-2.5 rounded-lg border border-border focus:ring-2 focus:ring-foreground focus:border-transparent text-sm bg-background"
                            />
                            {importCoverImage && (
                                <div className="mt-2 relative aspect-video rounded-lg overflow-hidden bg-muted">
                                    <img src={importCoverImage} alt="Preview" className="object-cover w-full h-full" />
                                </div>
                            )}
                        </div>

                        {/* Collection */}
                        {userLists.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">
                                    Add to Collection (Optional)
                                </label>
                                <select
                                    value={selectedListId}
                                    onChange={(e) => setSelectedListId(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-lg border border-border focus:ring-2 focus:ring-foreground focus:border-transparent text-sm bg-background"
                                >
                                    <option value="">No collection</option>
                                    {userLists.map((list) => (
                                        <option key={list.id} value={list.id}>{list.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Content */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">
                                Content <span className="text-red-500">*</span>
                            </label>
                            <RichTextEditor
                                content={importContent}
                                onChange={setImportContent}
                                placeholder="Paste or type your article content here..."
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4">
                            <Button
                                variant="outline"
                                onClick={() => setShowImportModal(false)}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={importing || !importTitle.trim() || !importContent.trim()}
                                className="flex-1 bg-foreground hover:bg-foreground/90 text-background"
                            >
                                {importing ? 'Importing...' : 'Import Article'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
