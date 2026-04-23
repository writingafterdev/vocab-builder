'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { ScrapeImportTab } from '@/components/admin/ScrapeImportTab';
import { DecksManagementTab } from '@/components/admin/DecksManagementTab';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Users,
    FileText,
    MessageSquare,
    BarChart3,
    Trash2,
    Plus,
    RefreshCw,
    ArrowLeft,
    BookOpen,
    Clock,
    Save,
    Upload,
    Download,
    CheckCircle,
    AlertCircle,
    Coins,
    Sparkles,
    Share2,
    X,
    Loader2,
    Rss,
} from 'lucide-react';
import Link from 'next/link';
import { getPosts, createPost, createArticle, ArticleInput } from '@/lib/db/posts';
import {
    getAllUsers,
    deletePost,
    createPostWithComments,
    getAdminStats,
    getLearningCycleSettings,
    updateLearningCycleSettings,
    getUserPosts,
    getUserTokenUsage,
    getUserSavedPhrases,
    getUserScenarios,
    UserPost,
    UserTokenUsage,
    bulkDeleteAllPosts,
    bulkDeleteAllArticles,
    setAdminEmail,
    getTokenUsageStats,
    getDetailedTokenUsage,
    DetailedTokenEntry,
} from '@/lib/db/admin-client';
import { Post, LearningCycleSettings, DEFAULT_LEARNING_CYCLE } from '@/lib/db/types';

import type { UserProfile } from '@/types';
import { RichTextEditor } from '@/components/rich-text-editor';


const ADMIN_EMAIL = 'ducanhcontactonfb@gmail.com';

// Server-side API helper functions
async function extractPhrasesFromServer(content: string, userEmail: string): Promise<string[]> {
    try {
        const response = await fetch('/api/admin/extract-phrases', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-email': userEmail,
            },
            body: JSON.stringify({ content }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to extract phrases');
        }

        const data = await response.json();
        return data.phrases || [];
    } catch (error) {
        console.error('Extract phrases error:', error);
        throw error;
    }
}

async function translateFromServer(text: string, userEmail: string): Promise<string> {
    try {
        const response = await fetch('/api/admin/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-email': userEmail,
            },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to translate');
        }

        const data = await response.json();
        return data.translatedText || '';
    } catch (error) {
        console.error('Translate error:', error);
        throw error;
    }
}

async function generateCaptionFromServer(title: string, content: string, userEmail: string): Promise<string> {
    try {
        const response = await fetch('/api/admin/generate-caption', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-email': userEmail,
            },
            body: JSON.stringify({ title, content }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to generate caption');
        }

        const data = await response.json();
        return data.caption || '';
    } catch (error) {
        console.error('Generate caption error:', error);
        throw error;
    }
}

// Batch extract phrases (for bulk import)
async function extractPhrasesBatchFromServer(contents: string[], userEmail: string): Promise<string[][]> {
    const results: string[][] = [];

    // Process one at a time to avoid overwhelming the API
    for (const content of contents) {
        try {
            const phrases = await extractPhrasesFromServer(content, userEmail);
            results.push(phrases);
        } catch (error) {
            console.error('Batch extract error for content:', error);
            results.push([]);
        }
    }

    return results;
}

export default function AdminPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'posts' | 'articles' | 'learning' | 'import' | 'tokens' | 'sources' | 'decks'>('overview');
    const [activeSource, setActiveSource] = useState<string>('the-new-yorker');
    const [stats, setStats] = useState<{
        totalUsers: number;
        totalPosts: number;
        totalArticles: number;
        totalScenarios: number;
        totalPhrases: number;
        totalTokens: number;
    } | null>(null);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loadingData, setLoadingData] = useState(false);

    // Article form
    const [showArticleForm, setShowArticleForm] = useState(false);
    const [articleForm, setArticleForm] = useState<ArticleInput>({
        title: '',
        content: '',
        coverImage: '',
        originalUrl: '',
        highlightedPhrases: [],
    });
    const [phrasesInput, setPhrasesInput] = useState('');
    const [translatedTitle, setTranslatedTitle] = useState('');
    const [translatedContent, setTranslatedContent] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [articleSource, setArticleSource] = useState('admin');
    const [articleCaption, setArticleCaption] = useState('');
    const [useTranslation, setUseTranslation] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);

    // Post form (single)
    const [showPostForm, setShowPostForm] = useState(false);
    const [postForm, setPostForm] = useState({ content: '', highlightedPhrases: [] as string[], originalUrl: '' });
    const [postPhrasesInput, setPostPhrasesInput] = useState('');
    const [postSource, setPostSource] = useState('admin');

    // Learning cycle settings
    const [learningSettings, setLearningSettings] = useState<LearningCycleSettings>(DEFAULT_LEARNING_CYCLE);
    const [intervalsInput, setIntervalsInput] = useState('');
    const [levelNamesInput, setLevelNamesInput] = useState('');
    const [savingSettings, setSavingSettings] = useState(false);

    // Bulk import
    const [importType, setImportType] = useState<'articles' | 'posts' | 'comments'>('articles');
    const [importFormat, setImportFormat] = useState<'csv' | 'json'>('csv');
    const [importData, setImportData] = useState('');
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);
    const [useAiExtraction, setUseAiExtraction] = useState(true);
    // AI features are always available for admin via server-side API
    const aiAvailable = true;
    const translationAvailable = true;
    const [importSource, setImportSource] = useState('admin');

    // Reddit Import state
    const [redditSubreddit, setRedditSubreddit] = useState('');
    const [redditSort, setRedditSort] = useState<'hot' | 'top' | 'new'>('hot');
    const [redditTime, setRedditTime] = useState<'hour' | 'day' | 'week' | 'month' | 'year' | 'all'>('week');
    const [redditLimit, setRedditLimit] = useState(10);
    const [redditImporting, setRedditImporting] = useState(false);
    const [redditResult, setRedditResult] = useState<{ success: boolean; imported: number; posts: any[] } | null>(null);

    // RSS Import state
    const [rssUrl, setRssUrl] = useState('');
    const [rssLimit, setRssLimit] = useState(10);
    const [rssImporting, setRssImporting] = useState(false);
    const [rssResult, setRssResult] = useState<{ success: boolean; imported: number; posts: any[] } | null>(null);

    // Token usage state
    const [tokenUsageStats, setTokenUsageStats] = useState<{
        totalTokens: number;
        deepseekTokens: number;
        deepseekPromptTokens: number;
        deepseekCompletionTokens: number;
        totalCalls: number;
        avgTokensPerCall: number;
        avgTokensPerUser: number;
        userStats: Array<{ userId: string; userEmail: string; totalTokens: number; callCount: number; avgTokensPerCall: number }>;
        endpointStats: Array<{ endpoint: string; totalTokens: number; promptTokens: number; completionTokens: number; callCount: number; avgTokensPerCall: number; isDeepSeek: boolean }>;
    } | null>(null);
    const [tokenDaysBack, setTokenDaysBack] = useState(30);
    const [detailedTokenLogs, setDetailedTokenLogs] = useState<DetailedTokenEntry[]>([]);

    // User detail view state
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [userDetailTab, setUserDetailTab] = useState<'phrases' | 'debates' | 'posts' | 'tokens'>('phrases');
    const [userDetailLoading, setUserDetailLoading] = useState(false);
    const [userPhrases, setUserPhrases] = useState<Array<{ id: string; phrase: string; meaning: string; createdAt: Date; usageCount: number }>>([]);
    const [userScenarios, setUserScenarios] = useState<any[]>([]);
    const [userPostsList, setUserPostsList] = useState<UserPost[]>([]);
    const [userTokens, setUserTokens] = useState<{ total: number; calls: number; byEndpoint: UserTokenUsage[] } | null>(null);

    // Feed Quizzes Admin triggers
    const [isTriggeringFeed, setIsTriggeringFeed] = useState(false);
    const [isCollectingFeed, setIsCollectingFeed] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const endOfLogsRef = useRef<HTMLDivElement>(null);

    const addLog = (msg: string) => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, `[${time}] ${msg}`]);
    };

    useEffect(() => {
        if (endOfLogsRef.current) {
            endOfLogsRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const isAdmin = user?.email === ADMIN_EMAIL;

    useEffect(() => {
        if (!loading && (!user || !isAdmin)) {
            router.push('/feed');
        }
    }, [user, loading, isAdmin, router]);

    useEffect(() => {
        if (isAdmin && user?.email) {
            setAdminEmail(user.email);
            loadStats();
            loadTokenUsageStats(tokenDaysBack);
        }
    }, [isAdmin]);

    const loadStats = async () => {
        try {
            const data = await getAdminStats();
            setStats(data);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    };

    const loadUsers = async () => {
        setLoadingData(true);
        try {
            const data = await getAllUsers();
            setUsers(data);
        } catch (error) {
            console.error('Error loading users:', error);
        }
        setLoadingData(false);
    };

    const loadPosts = async () => {
        setLoadingData(true);
        try {
            const data = await getPosts(100);
            setPosts(data);
        } catch (error) {
            console.error('Error loading posts:', error);
        }
        setLoadingData(false);
    };

    const loadUserDetails = async (selectedUser: UserProfile) => {
        setUserDetailLoading(true);
        setUserPhrases([]);
        setUserPostsList([]);
        setUserTokens(null);
        try {
            const [phrases, scenarios, posts, tokens] = await Promise.all([
                getUserSavedPhrases(selectedUser.uid),
                getUserScenarios(selectedUser.uid),
                getUserPosts(selectedUser.uid),
                getUserTokenUsage(selectedUser.email || ''),
            ]);
            setUserPhrases(phrases);
            setUserScenarios(scenarios);
            setUserPostsList(posts);
            setUserTokens(tokens);
        } catch (error) {
            console.error('Error loading user details:', error);
        }
        setUserDetailLoading(false);
    };

    const handleUserClick = (u: UserProfile) => {
        router.push(`/admin/user/${u.uid}`);
    };

    const loadLearningSettings = async () => {
        setLoadingData(true);
        try {
            const settings = await getLearningCycleSettings();
            setLearningSettings(settings);
            setIntervalsInput(settings.intervals.join(', '));
            setLevelNamesInput(settings.levelNames.join(', '));
        } catch (error: any) {
            console.error('Error loading learning settings:', error);
            if (error.code === 'permission-denied' || error.message?.includes('permissions')) {
                alert('Permission denied. Please run "firebase deploy --only firestore:rules" to update permissions.');
            }
        }
        setLoadingData(false);
    };

    // AI Processing Function (Magic Button)
    const handleProcessArticle = async () => {
        if (!articleForm.content.trim()) {
            alert('Please write some content first');
            return;
        }
        if (!user?.email) {
            alert('User not authenticated');
            return;
        }

        setIsProcessing(true);
        try {
            const response = await fetch('/api/admin/process-article', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': user.email,
                },
                body: JSON.stringify({
                    title: articleForm.title,
                    content: articleForm.content,
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to process article');

            if (data.success) {
                setPhrasesInput((data.phrases || []).join(', '));
                if (data.caption) setArticleCaption(data.caption);
                if (data.translatedTitle) setTranslatedTitle(data.translatedTitle);
                if (data.translatedContent) setTranslatedContent(data.translatedContent);
            }
        } catch (error) {
            console.error('Error processing article:', error);
            alert('Failed to process article');
        } finally {
            setIsProcessing(false);
        }
    };

    const loadTokenUsageStats = async (days: number = 30) => {
        setLoadingData(true);
        try {
            const [stats, detailed] = await Promise.all([
                getTokenUsageStats(days),
                getDetailedTokenUsage(100, true) // Today only
            ]);
            setTokenUsageStats(stats);
            setDetailedTokenLogs(detailed);
        } catch (error) {
            console.error('Error loading token usage:', error);
        }
        setLoadingData(false);
    };

    const handleDeletePost = async (postId: string) => {
        if (!confirm('Are you sure you want to delete this post?')) return;
        try {
            await deletePost(postId);
            setPosts(prev => prev.filter(p => p.id !== postId));
            loadStats();
        } catch (error) {
            console.error('Error deleting post:', error);
        }
    };

    const handleCreateArticle = async () => {
        if (!articleForm.title || !articleForm.content) {
            alert('Title and content are required');
            return;
        }

        try {
            const phrases = phrasesInput.split(',').map(p => p.trim()).filter(Boolean);

            // Translate if enabled
            // Values are already in state from Magic Process

            // Override with AI translations if present
            const finalTranslatedTitle = translatedTitle || articleForm.title;
            const finalTranslatedContent = translatedContent;

            // Only include translation fields if they have values
            const articleData = {
                ...articleForm,
                highlightedPhrases: phrases,
                authorName: articleSource.charAt(0).toUpperCase() + articleSource.slice(1),
                authorUsername: articleSource,
                source: articleSource,
                ...(articleCaption && { caption: articleCaption }),
                ...(translatedTitle && { translatedTitle }),
                ...(translatedContent && { translatedContent }),
            };
            await createArticle(articleData);
            setArticleForm({ title: '', content: '', coverImage: '', highlightedPhrases: [] });
            setPhrasesInput('');
            setArticleSource('admin');
            setArticleCaption('');
            setTranslatedTitle('');
            setTranslatedContent('');
            setUseTranslation(false);
            setShowArticleForm(false);
            loadStats();
            alert('Article created successfully!');
        } catch (error) {
            console.error('Error creating article:', error);
            alert('Failed to create article');
            setIsTranslating(false);
        }
    };

    const handleCreatePost = async () => {
        if (!postForm.content) {
            alert('Content is required');
            return;
        }

        try {
            const phrases = postPhrasesInput.split(',').map(p => p.trim()).filter(Boolean);

            await createPost({
                authorId: 'system',
                authorName: postSource.charAt(0).toUpperCase() + postSource.slice(1),
                authorUsername: postSource,
                source: postSource,
                content: postForm.content,
                highlightedPhrases: phrases,
                type: 'admin',
                isArticle: false,
                originalUrl: postForm.originalUrl,
            });

            setPostForm({ content: '', highlightedPhrases: [], originalUrl: '' });
            setPostPhrasesInput('');
            setPostSource('admin');
            setShowPostForm(false);
            loadStats();
            alert('Post created successfully!');
        } catch (error) {
            console.error('Error creating post:', error);
            alert('Failed to create post');
        }
    };





    // RSS Import Handler
    const handleRssImport = async () => {
        if (!rssUrl.trim()) {
            alert('Please enter an RSS URL');
            return;
        }

        setRssImporting(true);
        setRssResult(null);

        try {
            const response = await fetch('/api/admin/import-rss', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': user?.email || '',
                },
                body: JSON.stringify({
                    url: rssUrl,
                    limit: rssLimit,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to import from RSS');
            }

            setRssResult({
                success: true,
                imported: data.imported,
                posts: data.posts,
            });

            // Refresh stats to show new articles
            if (data.imported > 0) {
                loadStats();
                // Clear input if successful
                setRssUrl('');
            }

        } catch (error) {
            console.error('RSS import error:', error);
            alert(error instanceof Error ? error.message : 'Failed to import from RSS');
        } finally {
            setRssImporting(false);
        }
    };

    const parseCSV = (csv: string): Record<string, string>[] => {
        const rows: Record<string, string>[] = [];
        const lines = csv.trim();

        // Parse CSV properly handling quoted fields with newlines
        let currentField = '';
        let inQuotes = false;
        let fields: string[] = [];
        let headers: string[] = [];
        let isFirstRow = true;

        for (let i = 0; i < lines.length; i++) {
            const char = lines[i];
            const nextChar = lines[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped quote
                    currentField += '"';
                    i++;
                } else {
                    // Toggle quote mode
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // Field separator
                fields.push(currentField.trim());
                currentField = '';
            } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
                // Row separator
                if (char === '\r') i++; // Skip \n in \r\n
                fields.push(currentField.trim());

                if (isFirstRow) {
                    headers = fields;
                    isFirstRow = false;
                } else if (fields.some(f => f)) {
                    const row: Record<string, string> = {};
                    headers.forEach((h, idx) => {
                        row[h] = fields[idx] || '';
                    });
                    rows.push(row);
                }
                fields = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }

        // Handle last row if no trailing newline
        if (currentField || fields.length > 0) {
            fields.push(currentField.trim());
            if (!isFirstRow && fields.some(f => f)) {
                const row: Record<string, string> = {};
                headers.forEach((h, idx) => {
                    row[h] = fields[idx] || '';
                });
                rows.push(row);
            }
        }

        return rows;
    };


    const handleBulkImport = async () => {
        if (!importData.trim()) {
            alert('Please paste your data');
            return;
        }

        setImporting(true);
        setImportResult(null);
        const errors: string[] = [];
        let successCount = 0;

        try {
            let items: Record<string, string>[];

            if (importFormat === 'json') {
                try {
                    items = JSON.parse(importData);
                    if (!Array.isArray(items)) items = [items];
                } catch {
                    errors.push('Invalid JSON format');
                    setImportResult({ success: 0, errors });
                    setImporting(false);
                    return;
                }
            } else {
                items = parseCSV(importData);
            }

            // Batch extract phrases if AI is enabled
            let allPhrases: string[][] = [];

            if (useAiExtraction && aiAvailable && user?.email) {
                // Get contents for items that don't have manual phrases
                const contentsToExtract = items
                    .filter(item => !item.phrases)
                    .map(item => item.content);

                if (contentsToExtract.length > 0) {
                    const extractedPhrases = await extractPhrasesBatchFromServer(contentsToExtract, user.email);

                    // Map back to all items
                    let extractedIndex = 0;
                    for (let i = 0; i < items.length; i++) {
                        if (!items[i].phrases) {
                            allPhrases[i] = extractedPhrases[extractedIndex] || [];
                            extractedIndex++;
                        } else {
                            allPhrases[i] = [];
                        }
                    }
                }
            }

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                try {
                    // Parse comments if present (format: "comment1:::author1|||comment2:::author2")
                    let comments: Array<{ content: string; author?: string }> = [];
                    if (item.comments) {
                        comments = item.comments.split('|||').map((c: string) => {
                            const parts = c.split(':::');
                            return {
                                content: parts[0]?.trim() || '',
                                author: parts[1]?.trim() || undefined
                            };
                        }).filter((c: { content: string }) => c.content);
                    }

                    // Get phrases - either manual or from AI batch extraction
                    let phrases: string[] = [];
                    if (item.phrases) {
                        phrases = item.phrases.split('|').map((p: string) => p.trim());
                    } else if (allPhrases[i]) {
                        phrases = allPhrases[i];
                    }

                    if (importType === 'articles') {
                        if (!item.title || !item.content) {
                            errors.push(`Row ${i + 1}: Missing title or content`);
                            continue;
                        }
                        await createPostWithComments({
                            title: item.title,
                            content: item.content,
                            coverImage: item.coverImage || item.cover_image || '',
                            highlightedPhrases: phrases,
                            isArticle: true,
                            authorName: item.author || item.authorName || importSource.charAt(0).toUpperCase() + importSource.slice(1),
                            authorUsername: item.authorUsername || importSource,
                            source: item.source,
                            originalUrl: item.originalUrl || item.original_url || item.url || '',
                            comments,
                        });
                    } else {
                        if (!item.content) {
                            errors.push(`Row ${i + 1}: Missing content`);
                            continue;
                        }
                        await createPostWithComments({
                            content: item.content,
                            highlightedPhrases: phrases,
                            authorName: item.author || item.authorName || importSource.charAt(0).toUpperCase() + importSource.slice(1),
                            authorUsername: item.authorUsername || importSource,
                            source: item.source || (importType === 'comments' ? 'comment' : 'post'),
                            originalUrl: item.originalUrl || item.original_url || item.url || '',
                            comments,
                        });
                    }
                    successCount++;
                } catch (err) {
                    console.error(`Row ${i + 1} import error:`, err);
                    errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Import failed'}`);
                }
            }

            setImportResult({ success: successCount, errors });
            if (successCount > 0) {
                loadStats();
                setImportData('');
            }
        } catch (error) {
            console.error('Bulk import error:', error);
            errors.push('Unexpected error during import');
            setImportResult({ success: 0, errors });
        }

        setImporting(false);
    };

    const handleSaveLearningSettings = async () => {
        setSavingSettings(true);
        try {
            const intervals = intervalsInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
            const levelNames = levelNamesInput.split(',').map(s => s.trim()).filter(Boolean);

            if (intervals.length === 0) {
                alert('Please enter valid intervals (numbers separated by commas)');
                setSavingSettings(false);
                return;
            }

            const newSettings: LearningCycleSettings = {
                intervals,
                masteryThreshold: intervals.length,
                levelNames: levelNames.length > 0 ? levelNames : intervals.map((_, i) => `Level ${i + 1}`),
            };

            await updateLearningCycleSettings(newSettings);
            setLearningSettings(newSettings);
            alert('Learning cycle settings saved!');
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('Failed to save settings');
        }
        setSavingSettings(false);
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return '';

        let date: Date;
        if (timestamp instanceof Date) {
            date = timestamp;
        } else {
            // Handle strings or numbers
            date = new Date(timestamp);
        }

        // Check if valid date
        if (isNaN(date.getTime())) return '';

        try {
            return date.toLocaleDateString();
        } catch (e) {
            return '';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
        );
    }

    if (!isAdmin) {
        return null;
    }

    return (
        <div className="space-y-6 font-sans">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/feed">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
                        <p className="text-neutral-500 text-sm">Manage users, posts, and learning settings</p>
                    </div>
                </div>
                <Button onClick={loadStats} variant="outline" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Quick Links & Actions */}
            <div className="flex flex-wrap items-center gap-2">
            </div>

            {/* Terminal Output */}
            {logs.length > 0 && (
                <div className="flex flex-col gap-1 overflow-y-auto whitespace-pre-wrap break-all border border-neutral-800 rounded-lg shadow-inner bg-black text-green-400 font-mono text-xs p-4 max-h-64 mt-4">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800 text-neutral-500">
                        <span>Terminal Output</span>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="p-0 w-6 h-6 hover:bg-neutral-800 hover:text-white"
                            onClick={() => setLogs([])}
                        >
                            <X className="w-3 h-3" />
                        </Button>
                    </div>
                    {logs.map((log, i) => (
                        <div key={i}>{log}</div>
                    ))}
                    <div ref={endOfLogsRef} />
                </div>
            )}

            {/* PRIMARY TABS */}
            <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-2">
                {[
                    { id: 'overview',  label: 'Overview',       icon: BarChart3,    activeClass: 'bg-neutral-900 text-white shadow',   idleClass: 'text-neutral-600 hover:bg-neutral-100' },
                    { id: 'users',     label: 'Users',           icon: Users,        activeClass: 'bg-blue-600 text-white shadow',      idleClass: 'text-blue-600 hover:bg-blue-50' },
                    { id: 'posts',     label: 'Posts',           icon: MessageSquare,activeClass: 'bg-indigo-600 text-white shadow',    idleClass: 'text-indigo-600 hover:bg-indigo-50' },
                    { id: 'articles',  label: 'Articles',        icon: BookOpen,     activeClass: 'bg-purple-600 text-white shadow',    idleClass: 'text-purple-600 hover:bg-purple-50' },
                    { id: 'learning',  label: 'Learning Cycle',  icon: Clock,        activeClass: 'bg-amber-600 text-white shadow',     idleClass: 'text-amber-600 hover:bg-amber-50' },
                    { id: 'import',    label: 'Bulk Import',     icon: Upload,       activeClass: 'bg-pink-600 text-white shadow',      idleClass: 'text-pink-600 hover:bg-pink-50' },
                    { id: 'sources',   label: 'Content Sources', icon: Rss,          activeClass: 'bg-teal-600 text-white shadow',      idleClass: 'text-teal-600 hover:bg-teal-50' },
                    { id: 'decks',     label: 'Decks',           icon: BookOpen,     activeClass: 'bg-violet-600 text-white shadow',    idleClass: 'text-violet-600 hover:bg-violet-50' },
                    { id: 'tokens',    label: 'Token Usage',     icon: Coins,        activeClass: 'bg-yellow-500 text-white shadow',    idleClass: 'text-yellow-600 hover:bg-yellow-50' },
                ].map((tab) => (
                    <Button
                        key={tab.id}
                        variant="ghost"
                        onClick={() => {
                            setActiveTab(tab.id as typeof activeTab);
                            if (tab.id === 'users') loadUsers();
                            if (tab.id === 'posts' || tab.id === 'articles') loadPosts();
                            if (tab.id === 'learning') loadLearningSettings();
                            if (tab.id === 'tokens') loadTokenUsageStats(tokenDaysBack);
                        }}
                        className={`gap-2 transition-all font-medium ${activeTab === tab.id ? tab.activeClass : tab.idleClass}`}
                    >
                        <tab.icon className="h-4 w-4" />
                        {tab.label}
                    </Button>
                ))}
            </div>

            {/* SECONDARY SOURCE SUB-TABS — shown only when Sources is active */}
            {activeTab === 'sources' && (
                <div className="flex flex-wrap gap-1.5 border-b border-neutral-100 pb-2 -mt-1">
                    {[
                        { id: 'the-new-yorker',      label: 'New Yorker',         emoji: '🗽', color: 'bg-neutral-900 text-white',           idle: 'text-neutral-500 hover:bg-neutral-100' },
                        { id: 'the-atlantic',        label: 'The Atlantic',       emoji: '🌊', color: 'bg-[#e02727] text-white',             idle: 'text-[#e02727] hover:bg-red-50' },
                        { id: 'aeon',                label: 'Aeon',               emoji: '🏛️', color: 'bg-neutral-800 text-white',           idle: 'text-neutral-700 hover:bg-neutral-100' },
                        { id: 'new-scientist',       label: 'New Scientist',      emoji: '🔬', color: 'bg-[#e4002b] text-white',             idle: 'text-[#e4002b] hover:bg-red-50' },
                        { id: 'reddit',              label: 'Reddit',             emoji: '🤖', color: 'bg-[#FF4500] text-white',             idle: 'text-[#FF4500] hover:bg-orange-50' },
                    ].map((s) => (
                        <button
                            key={s.id}
                            onClick={() => setActiveSource(s.id)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                                activeSource === s.id ? s.color : s.idle
                            }`}
                        >
                            <span>{s.emoji}</span>
                            <span>{s.label}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Overview Tab */}
            {activeTab === 'overview' && stats && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-neutral-500 flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    Total Users
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">{stats.totalUsers}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-neutral-500 flex items-center gap-2">
                                    <BookOpen className="h-4 w-4" />
                                    Articles
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">{stats.totalArticles}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-neutral-500 flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4" />
                                    Scenarios
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">{stats.totalScenarios}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-neutral-500 flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Saved Phrases
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">{stats.totalPhrases}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-neutral-500 flex items-center gap-2">
                                    <Coins className="h-4 w-4" />
                                    Tokens Used
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">{stats.totalTokens.toLocaleString()}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-neutral-500 flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4" />
                                    Posts
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">{stats.totalPosts}</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-emerald-50 border-emerald-200">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-emerald-600 flex items-center gap-2">
                                    <Coins className="h-4 w-4" />
                                    Est. Cost (DeepSeek)
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold text-emerald-700">
                                    ${tokenUsageStats ? (
                                        (tokenUsageStats.deepseekPromptTokens / 1000000) * 0.28 +
                                        (tokenUsageStats.deepseekCompletionTokens / 1000000) * 0.42
                                    ).toFixed(4) : '0.0000'}
                                </p>
                                <p className="text-xs text-emerald-500 mt-1">$0.28/1M in • $0.42/1M out</p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
                <Card>
                    <CardHeader>
                        <CardTitle>All Users ({users.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loadingData ? (
                            <p className="text-neutral-500">Loading...</p>
                        ) : (
                            <div className="space-y-3">
                                {users.map((u) => (
                                    <div
                                        key={u.uid}
                                        onClick={() => handleUserClick(u)}
                                        className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100 cursor-pointer transition-colors"
                                    >
                                        <div>
                                            <p className="font-medium">{u.displayName}</p>
                                            <p className="text-sm text-neutral-500">@{u.username} · {u.email}</p>
                                        </div>
                                        <Badge variant="secondary">
                                            {u.subscription?.status || 'free'}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Posts Tab */}
            {activeTab === 'posts' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-semibold">Posts ({posts.filter(p => !p.isArticle).length})</h2>
                        <div className="flex gap-2">
                            <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={async () => {
                                    const postCount = posts.filter(p => !p.isArticle).length;
                                    if (postCount === 0) {
                                        alert('No posts to delete.');
                                        return;
                                    }
                                    const confirmed = confirm(`⚠️ Are you ABSOLUTELY sure you want to delete ALL ${postCount} posts? This cannot be undone!`);
                                    if (!confirmed) return;

                                    const doubleConfirm = prompt('Type "DELETE ALL POSTS" to confirm:');
                                    if (doubleConfirm !== 'DELETE ALL POSTS') {
                                        alert('Deletion cancelled.');
                                        return;
                                    }

                                    try {
                                        const result = await bulkDeleteAllPosts();
                                        alert(`✅ Deleted ${result.deleted} posts${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''}`);
                                        loadStats();
                                    } catch (error) {
                                        alert(error instanceof Error ? error.message : 'Failed to delete posts');
                                    }
                                }}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete All Posts
                            </Button>
                            <Button onClick={() => setShowPostForm(!showPostForm)}>
                                <Plus className="h-4 w-4 mr-2" />
                                Create Post
                            </Button>
                        </div>
                    </div>

                    {/* Create Post Form */}
                    {showPostForm && (
                        <Card className="border-blue-200 bg-blue-50/30">
                            <CardHeader>
                                <CardTitle className="text-lg">Create New Post</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium">Content *</label>
                                    <Textarea
                                        value={postForm.content}
                                        onChange={(e) => setPostForm({ ...postForm, content: e.target.value })}
                                        placeholder="Write your post content here..."
                                        rows={4}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium">Highlighted Phrases (comma-separated)</label>
                                        <Input
                                            value={postPhrasesInput}
                                            onChange={(e) => setPostPhrasesInput(e.target.value)}
                                            placeholder="phrase one, phrase two"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">Source</label>
                                        <select
                                            value={postSource}
                                            onChange={(e) => setPostSource(e.target.value)}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <option value="admin">@admin</option>
                                            <option value="reddit">@reddit</option>
                                            <option value="substack">@substack</option>
                                            <option value="medium">@medium</option>
                                            <option value="thenewyorker">@thenewyorker</option>
                                            <option value="theatlantic">@theatlantic</option>
                                            <option value="theconomist">@theconomist</option>
                                            <option value="wired">@wired</option>
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-sm font-medium">Original URL</label>
                                        <Input
                                            value={postForm.originalUrl}
                                            onChange={(e) => setPostForm({ ...postForm, originalUrl: e.target.value })}
                                            placeholder="https://..."
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={handleCreatePost}>
                                        Create Post
                                    </Button>
                                    <Button variant="outline" onClick={() => setShowPostForm(false)}>
                                        Cancel
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Posts List */}
                    <Card>
                        <CardContent className="pt-6">
                            {loadingData ? (
                                <p className="text-neutral-500">Loading...</p>
                            ) : (
                                <div className="space-y-3">
                                    {posts.filter(p => !p.isArticle).map((post) => (
                                        <div key={post.id} className="flex items-start justify-between p-3 bg-neutral-50 rounded-lg">
                                            <div className="flex-1">
                                                <p className="text-sm">{post.content.slice(0, 100)}...</p>
                                                <p className="text-xs text-neutral-500 mt-1">
                                                    By {post.authorName} · {formatDate(post.createdAt)} · {post.commentCount} comments
                                                </p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                onClick={() => handleDeletePost(post.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Articles Tab */}
            {activeTab === 'articles' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-semibold">Articles ({posts.filter(p => p.isArticle).length})</h2>
                        <div className="flex gap-2">
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={async () => {
                                    const articleCount = posts.filter(p => p.isArticle).length;
                                    if (articleCount === 0) {
                                        alert('No articles to delete.');
                                        return;
                                    }
                                    const confirmed = confirm(`⚠️ Are you sure you want to delete ALL ${articleCount} articles? This cannot be undone!`);
                                    if (!confirmed) return;

                                    const doubleConfirm = prompt('Type "DELETE ALL ARTICLES" to confirm:');
                                    if (doubleConfirm !== 'DELETE ALL ARTICLES') {
                                        alert('Deletion cancelled.');
                                        return;
                                    }

                                    try {
                                        const result = await bulkDeleteAllArticles();
                                        alert(`✅ Deleted ${result.deleted} articles${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''}`);
                                        loadStats();
                                    } catch (error) {
                                        alert(error instanceof Error ? error.message : 'Failed to delete articles');
                                    }
                                }}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete All Articles
                            </Button>
                            <Button onClick={() => setActiveTab('import')} variant="outline">
                                <Upload className="h-4 w-4 mr-2" />
                                Import Articles (CSV)
                            </Button>
                        </div>
                    </div>



                    <Card>
                        <CardContent className="pt-6">
                            {loadingData ? (
                                <p className="text-neutral-500">Loading...</p>
                            ) : (
                                <div className="space-y-3">
                                    {posts.filter(p => p.isArticle).map((article) => (
                                        <div key={article.id} className="flex items-start justify-between p-4 bg-neutral-50 rounded-lg">
                                            <div className="flex-1">
                                                <p className="font-medium">{article.title}</p>
                                                <p className="text-sm text-neutral-500 mt-1">
                                                    {formatDate(article.createdAt)} · {article.commentCount} comments
                                                </p>
                                                {article.highlightedPhrases && article.highlightedPhrases.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {article.highlightedPhrases.map((phrase, i) => (
                                                            <Badge key={i} variant="secondary" className="text-xs">
                                                                {phrase}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                onClick={() => handleDeletePost(article.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    {posts.filter(p => p.isArticle).length === 0 && (
                                        <p className="text-neutral-500 text-center py-8">No articles yet</p>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Learning Cycle Tab */}
            {activeTab === 'learning' && (
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="h-5 w-5" />
                                Spaced Repetition Settings
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {loadingData ? (
                                <p className="text-neutral-500">Loading...</p>
                            ) : (
                                <>
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                        <p className="text-sm text-blue-800">
                                            <strong>How it works:</strong> Users will see phrases again after the specified number of days.
                                            Each successful recall moves the phrase to the next interval. After completing all intervals,
                                            the phrase is marked as &quot;Mastered&quot;.
                                        </p>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium block mb-2">
                                            Review Intervals (days, comma-separated)
                                        </label>
                                        <Input
                                            value={intervalsInput}
                                            onChange={(e) => setIntervalsInput(e.target.value)}
                                            placeholder="1, 3, 7, 14, 30, 90"
                                        />
                                        <p className="text-xs text-neutral-500 mt-1">
                                            Example: &quot;1, 3, 7, 14, 30&quot; means: review after 1 day, then 3 days, then 7 days, etc.
                                        </p>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium block mb-2">
                                            Level Names (comma-separated, optional)
                                        </label>
                                        <Input
                                            value={levelNamesInput}
                                            onChange={(e) => setLevelNamesInput(e.target.value)}
                                            placeholder="New, Learning, Review, Familiar, Known, Mastered"
                                        />
                                        <p className="text-xs text-neutral-500 mt-1">
                                            Names shown to users for each level. Should match number of intervals.
                                        </p>
                                    </div>

                                    <div className="pt-4 border-t">
                                        <h3 className="font-medium mb-3">Current Settings Preview</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {learningSettings.intervals.map((days, i) => (
                                                <div key={i} className="flex items-center gap-2 bg-neutral-100 px-3 py-2 rounded-lg">
                                                    <span className="font-medium">{learningSettings.levelNames[i] || `Level ${i + 1}`}</span>
                                                    <Badge variant="secondary">{days} days</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <Button onClick={handleSaveLearningSettings} disabled={savingSettings}>
                                        <Save className="h-4 w-4 mr-2" />
                                        {savingSettings ? 'Saving...' : 'Save Settings'}
                                    </Button>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Import Tab */}
            {activeTab === 'import' && (
                <div className="space-y-6">
                    <ScrapeImportTab onImportComplete={loadStats} />
                </div>
            )}

            {/* UNIFIED SOURCES TAB — renders the active source's dedicated importer */}
            {activeTab === 'sources' && (
                <div className="space-y-6">
                    <ScrapeImportTab
                        key={activeSource}
                        onImportComplete={loadStats}
                        forceSourceId={activeSource}
                    />
                </div>
            )}

            {/* Decks Tab */}
            {activeTab === 'decks' && (
                <DecksManagementTab />
            )}

            {activeTab === 'tokens' && (
                <div className="space-y-6">
                    {/* Time Filter */}
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-neutral-500">Time period:</span>
                        <div className="flex gap-2">
                            {[7, 30, 90].map((days) => (
                                <Button
                                    key={days}
                                    variant={tokenDaysBack === days ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => {
                                        setTokenDaysBack(days);
                                        loadTokenUsageStats(days);
                                    }}
                                >
                                    {days}d
                                </Button>
                            ))}
                        </div>
                        <Button onClick={() => loadTokenUsageStats(tokenDaysBack)} variant="ghost" size="sm">
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </div>

                    {loadingData ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="h-6 w-6 animate-spin" />
                        </div>
                    ) : tokenUsageStats ? (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm text-neutral-500">Total Tokens</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-2xl font-bold">{tokenUsageStats.totalTokens.toLocaleString()}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm text-neutral-500">Total Calls</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-2xl font-bold">{tokenUsageStats.totalCalls.toLocaleString()}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm text-neutral-500">Avg Tokens/Call</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-2xl font-bold">{tokenUsageStats.avgTokensPerCall.toLocaleString()}</p>
                                    </CardContent>
                                </Card>
                                <Card className="bg-emerald-50 border-emerald-200">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm text-emerald-600">Est. Cost (DeepSeek)</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-2xl font-bold text-emerald-700">
                                            ${(
                                                (tokenUsageStats.deepseekPromptTokens / 1000000) * 0.28 +
                                                (tokenUsageStats.deepseekCompletionTokens / 1000000) * 0.42
                                            ).toFixed(4)}
                                        </p>
                                        <p className="text-xs text-emerald-500 mt-1">$0.28/1M in • $0.42/1M out</p>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* By Endpoint */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Usage by Endpoint</CardTitle>
                                    <p className="text-xs text-neutral-500">DeepSeek: $0.28/1M input, $0.42/1M output</p>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {tokenUsageStats.endpointStats.filter(ep => ep.isDeepSeek).map((ep) => {
                                                const costEstimate = ep.isDeepSeek ? (
                                                    (ep.promptTokens / 1000000) * 0.28 +
                                                    (ep.completionTokens / 1000000) * 0.42
                                                ) : 0;
                                                const avgCost = ep.isDeepSeek && ep.callCount > 0 ? costEstimate / ep.callCount : 0;
                                                const avgInput = ep.callCount > 0 ? Math.round(ep.promptTokens / ep.callCount) : 0;
                                                const avgOutput = ep.callCount > 0 ? Math.round(ep.completionTokens / ep.callCount) : 0;

                                                return (
                                                    <Card key={ep.endpoint} className={`border ${ep.isDeepSeek ? 'border-indigo-100 bg-indigo-50/20' : 'border-blue-100 bg-blue-50/20'}`}>
                                                        <CardContent className="p-4 space-y-4">
                                                            {/* Header */}
                                                            <div className="flex items-start justify-between">
                                                                <div>
                                                                    <p className="font-semibold text-sm font-mono text-neutral-900 break-all">{ep.endpoint}</p>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${ep.isDeepSeek ? 'text-indigo-600 border-indigo-200 bg-indigo-50' : 'text-blue-600 border-blue-200 bg-blue-50'}`}>
                                                                            {ep.isDeepSeek ? 'DeepSeek' : 'Gemini'}
                                                                        </Badge>
                                                                        <span className="text-xs text-neutral-500">{ep.callCount} calls</span>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="font-bold text-lg">{ep.totalTokens.toLocaleString()}</p>
                                                                    <p className="text-[10px] uppercase tracking-wide text-neutral-400">Total Tokens</p>
                                                                </div>
                                                            </div>

                                                            {/* Detailed Breakdown */}
                                                            <div className="grid grid-cols-3 gap-2 py-3 border-t border-b border-black/5">
                                                                <div className="text-center">
                                                                    <p className="text-[10px] text-neutral-500 uppercase">Avg Total</p>
                                                                    <p className="font-medium text-neutral-900">{ep.avgTokensPerCall.toLocaleString()}</p>
                                                                </div>
                                                                <div className="text-center border-l border-r border-black/5 px-2">
                                                                    <p className="text-[10px] text-neutral-500 uppercase">Avg Input</p>
                                                                    <p className="font-medium text-neutral-900">{avgInput.toLocaleString()}</p>
                                                                </div>
                                                                <div className="text-center">
                                                                    <p className="text-[10px] text-neutral-500 uppercase">Avg Output</p>
                                                                    <p className="font-medium text-neutral-900">{avgOutput.toLocaleString()}</p>
                                                                </div>
                                                            </div>

                                                            {/* Cost Info */}
                                                            <div className="flex items-center justify-between pt-1">
                                                                {ep.isDeepSeek ? (
                                                                    <>
                                                                        <div>
                                                                            <p className="text-[10px] text-neutral-500 uppercase">Total Cost</p>
                                                                            <p className="text-sm font-medium text-emerald-600">${costEstimate.toFixed(4)}</p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-[10px] text-neutral-500 uppercase">Avg Cost/Call</p>
                                                                            <p className="text-sm font-medium text-emerald-600">${avgCost.toFixed(5)}</p>
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <div className="w-full text-center">
                                                                        <span className="text-xs font-medium text-blue-500 px-2 py-1 bg-blue-50 rounded-full">
                                                                            Free Tier (Gemini)
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                );
                                            })}
                                        </div>
                                        {tokenUsageStats.endpointStats.length === 0 && (
                                            <p className="text-neutral-500 text-center py-4">No data yet</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* By User */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Usage by User ({tokenUsageStats.userStats.length} users)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                        {tokenUsageStats.userStats.map((u, i) => {
                                            const maxTokens = tokenUsageStats.userStats[0]?.totalTokens || 1;
                                            const percentage = (u.totalTokens / maxTokens) * 100;

                                            return (
                                                <div key={`${u.userId}-${i}`} className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-8 w-8 rounded-full bg-neutral-100 flex items-center justify-center text-xs font-medium text-neutral-600 border border-neutral-200">
                                                                {u.userEmail.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <p className="font-medium text-sm text-neutral-900">{u.userEmail}</p>
                                                                <p className="text-[10px] text-neutral-500">{u.callCount} calls • {u.avgTokensPerCall} avg</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="font-bold text-sm">{u.totalTokens.toLocaleString()}</p>
                                                            <p className="text-[10px] text-neutral-400 uppercase">tokens</p>
                                                        </div>
                                                    </div>
                                                    {/* Usage Bar */}
                                                    <div className="h-1.5 w-full bg-neutral-50 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-neutral-900 rounded-full opacity-80"
                                                            style={{ width: `${percentage}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {tokenUsageStats.userStats.length === 0 && (
                                            <p className="text-neutral-500 text-center py-4">No data yet</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Detailed Logs */}
                            <Card className="col-span-1 md:col-span-2 lg:col-span-3">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle>Today's API Calls ({detailedTokenLogs.length})</CardTitle>
                                    <Badge variant="outline" className="font-normal text-neutral-500">
                                        UTC Time
                                    </Badge>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-0 border rounded-lg overflow-hidden">
                                        {detailedTokenLogs.map((log, index) => {
                                            const isDeepSeek = log.model.includes('deepseek');
                                            return (
                                                <div
                                                    key={log.id}
                                                    className={`flex items-center justify-between p-3 text-sm border-b last:border-0 hover:bg-neutral-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-neutral-50/30'
                                                        }`}
                                                >
                                                    <div className="flex-1 min-w-0 pr-4">
                                                        <div className="flex items-center gap-3">
                                                            <Badge
                                                                variant="secondary"
                                                                className={`text-[10px] px-1.5 h-5 font-mono font-medium border ${isDeepSeek
                                                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                                                    : 'bg-blue-50 text-blue-700 border-blue-100'
                                                                    }`}
                                                            >
                                                                {log.endpoint}
                                                            </Badge>
                                                            <span className="text-xs text-neutral-400 font-mono truncate max-w-[120px]">{log.model}</span>
                                                        </div>
                                                        <p className="text-xs text-neutral-600 mt-1 truncate pl-0.5">
                                                            {log.userEmail}
                                                        </p>
                                                    </div>

                                                    <div className="flex items-center gap-6 shrink-0">
                                                        <div className="hidden sm:block text-right">
                                                            <div className="flex items-center justify-end gap-1.5 text-xs text-neutral-500 mb-0.5">
                                                                <span>in: {log.promptTokens}</span>
                                                                <span className="text-neutral-300">|</span>
                                                                <span>out: {log.completionTokens}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right w-24">
                                                            <p className="font-bold text-neutral-900">{log.totalTokens.toLocaleString()}</p>
                                                            <p className="text-[10px] text-neutral-400">tokens</p>
                                                        </div>
                                                        <div className="text-right w-16 text-xs text-neutral-500 font-mono">
                                                            {log.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {detailedTokenLogs.length === 0 && (
                                            <div className="p-8 text-center text-neutral-500 bg-neutral-50">
                                                <p>No API calls logged today</p>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    ) : (
                        <Card>
                            <CardContent className="py-12 text-center text-neutral-500">
                                <Coins className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No token usage data yet.</p>
                                <p className="text-sm">Usage will appear here as users interact with AI features.</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* User Detail Dialog */}
            <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3">
                            <div>
                                <span className="text-lg">{selectedUser?.displayName || 'User'}</span>
                                <p className="text-sm font-normal text-neutral-500">
                                    @{selectedUser?.username} · {selectedUser?.email}
                                </p>
                            </div>
                            <Badge variant="secondary" className="ml-auto">
                                {selectedUser?.subscription?.status || 'free'}
                            </Badge>
                        </DialogTitle>
                    </DialogHeader>

                    {userDetailLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
                        </div>
                    ) : (
                        <Tabs value={userDetailTab} onValueChange={(v) => setUserDetailTab(v as typeof userDetailTab)}>
                            <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="phrases">Phrases ({userPhrases.length})</TabsTrigger>
                                <TabsTrigger value="scenarios">Scenarios ({userScenarios.length})</TabsTrigger>
                                <TabsTrigger value="posts">Posts ({userPostsList.length})</TabsTrigger>
                                <TabsTrigger value="tokens">Tokens</TabsTrigger>
                            </TabsList>

                            <TabsContent value="phrases" className="mt-4 space-y-2 max-h-[400px] overflow-y-auto">
                                {userPhrases.length === 0 ? (
                                    <p className="text-neutral-500 text-center py-8">No saved phrases yet.</p>
                                ) : (
                                    userPhrases.map((p) => (
                                        <div key={p.id} className="p-3 bg-neutral-50 rounded-lg">
                                            <p className="font-medium">{p.phrase}</p>
                                            <p className="text-sm text-neutral-500">{p.meaning}</p>
                                            <p className="text-xs text-neutral-400 mt-1">
                                                Used {p.usageCount}x · Added {p.createdAt.toLocaleDateString()}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </TabsContent>

                            <TabsContent value="scenarios" className="mt-4 space-y-2 max-h-[400px] overflow-y-auto">
                                {userScenarios.length === 0 ? (
                                    <p className="text-neutral-500 text-center py-8">No scenarios yet.</p>
                                ) : (
                                    userScenarios.map((s) => (
                                        <div key={s.id} className="p-3 bg-neutral-50 rounded-lg">
                                            <p className="font-medium">{s.scenario}</p>
                                            <div className="flex gap-3 text-xs text-neutral-500 mt-1">
                                                <span>{s.turnsCount} turns</span>
                                                <span>·</span>
                                                <span>{s.phrasesNatural}/{s.phrasesTotal} natural</span>
                                                <span>·</span>
                                                <span>{s.createdAt.toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </TabsContent>

                            <TabsContent value="posts" className="mt-4 space-y-2 max-h-[400px] overflow-y-auto">
                                {userPostsList.length === 0 ? (
                                    <p className="text-neutral-500 text-center py-8">No posts created.</p>
                                ) : (
                                    userPostsList.map((post) => (
                                        <div key={post.id} className="p-3 bg-neutral-50 rounded-lg">
                                            <p className="font-medium">{post.title || post.content.slice(0, 50) + '...'}</p>
                                            <div className="flex gap-3 text-xs text-neutral-500 mt-1">
                                                <span>{post.isArticle ? 'Article' : 'Post'}</span>
                                                <span>·</span>
                                                <span>{post.commentCount} comments · {post.repostCount} reposts</span>
                                                <span>·</span>
                                                <span>{post.createdAt.toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </TabsContent>

                            <TabsContent value="tokens" className="mt-4">
                                {userTokens ? (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <Card>
                                                <CardContent className="pt-4 text-center">
                                                    <div className="text-2xl font-bold">{userTokens.total.toLocaleString()}</div>
                                                    <div className="text-xs text-neutral-500">Total Tokens</div>
                                                </CardContent>
                                            </Card>
                                            <Card>
                                                <CardContent className="pt-4 text-center">
                                                    <div className="text-2xl font-bold">{userTokens.calls}</div>
                                                    <div className="text-xs text-neutral-500">API Calls</div>
                                                </CardContent>
                                            </Card>
                                        </div>
                                        {userTokens.byEndpoint.length > 0 && (
                                            <div className="space-y-2">
                                                <p className="text-sm font-medium">By Endpoint</p>
                                                {userTokens.byEndpoint.map((e) => (
                                                    <div key={e.endpoint} className="flex justify-between text-sm p-2 bg-neutral-50 rounded">
                                                        <span className="text-neutral-600">{e.endpoint}</span>
                                                        <span className="text-neutral-500">{e.totalTokens.toLocaleString()} tokens ({e.callCount} calls)</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-neutral-500 text-center py-8">No token usage data.</p>
                                )}
                            </TabsContent>
                        </Tabs>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

