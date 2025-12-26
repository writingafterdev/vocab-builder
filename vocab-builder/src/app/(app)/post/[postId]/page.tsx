'use client';

import { useEffect, useState } from 'react';
import { getPost, getComments, Post, Comment, addComment, repostPost, hasUserReposted, getReplies, updateComment, deleteComment, updatePost, saveArticle, unsaveArticle, isArticleSaved, likeComment, getBatchUserLikes } from '@/lib/firestore';
import { ArrowLeft, MessageCircle, Heart, Share2, FileText, Repeat2, MoreHorizontal, MoreVertical, Trash2, Loader2, Bookmark } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-context';
import TextHighlighter from '@/components/text-highlighter';
import { getSourceLogo } from '@/lib/sources';
import { useConfirm } from '@/components/confirm-dialog';

function formatTimeAgo(date: Date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

// Helper to format article content
function formatContent(content: string) {
    if (!content) return '';
    return content;
}

import { useParams } from 'next/navigation';

export default function PostPage() {
    const params = useParams();
    const postId = params.postId as string;
    const { user, profile } = useAuth();
    const [post, setPost] = useState<Post | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [reposted, setReposted] = useState(false);
    const [repostCount, setRepostCount] = useState(0);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    // Edit/Delete state
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editCommentText, setEditCommentText] = useState('');
    const [language, setLanguage] = useState<'en' | 'vi'>('en');
    const [translating, setTranslating] = useState(false);
    // Bookmark state
    const [bookmarked, setBookmarked] = useState(false);
    const [bookmarking, setBookmarking] = useState(false);
    // Like state
    const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
    // Confirm dialog
    const { confirm, DialogComponent } = useConfirm();

    useEffect(() => {
        const loadData = async () => {
            if (!postId) return;
            try {
                const [fetchedPost, fetchedComments] = await Promise.all([
                    getPost(postId),
                    getComments(postId)
                ]);
                setPost(fetchedPost);

                // Fetch replies for each comment
                const commentsWithReplies = await Promise.all(
                    fetchedComments.map(async (c) => {
                        const replies = await getReplies(c.id);
                        return { ...c, replies };
                    })
                );
                setComments(commentsWithReplies as Comment[]);
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [postId]);

    // Check repost status
    useEffect(() => {
        const checkRepost = async () => {
            if (user && post) {
                const hasReposted = await hasUserReposted(post.id, user.uid);
                setReposted(hasReposted);
                setRepostCount(post.repostCount || 0);
            }
        };
        checkRepost();
    }, [user, post]);

    // Check bookmark status (for articles)
    useEffect(() => {
        const checkBookmark = async () => {
            if (user && post && post.isArticle) {
                const saved = await isArticleSaved(user.uid, post.id);
                setBookmarked(saved);
            }
        };
        checkBookmark();
    }, [user, post]);

    // Toggle bookmark
    const handleBookmark = async () => {
        if (!user || !post) return;
        setBookmarking(true);
        try {
            if (bookmarked) {
                await unsaveArticle(user.uid, post.id);
                setBookmarked(false);
                toast.info('Article removed from saved');
            } else {
                await saveArticle(user.uid, post.id);
                setBookmarked(true);
                toast.success('Article saved for later!');
            }
        } catch (error) {
            console.error('Bookmark error:', error);
            toast.error('Failed to update bookmark');
        }
        setBookmarking(false);
    };

    // Check liked comments
    useEffect(() => {
        const loadLikedComments = async () => {
            if (user && comments.length > 0) {
                // Get all comment IDs including replies
                const allCommentIds: string[] = [];
                comments.forEach(c => {
                    allCommentIds.push(c.id);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ((c as any).replies || []).forEach((r: Comment) => allCommentIds.push(r.id));
                });
                const liked = await getBatchUserLikes(allCommentIds, user.uid);
                setLikedComments(liked);
            }
        };
        loadLikedComments();
    }, [user, comments]);

    // Handle like/unlike comment
    const handleLikeComment = async (commentId: string) => {
        if (!user) {
            toast.error('Please sign in to like comments');
            return;
        }

        // Optimistic update
        const isLiked = likedComments.has(commentId);
        const newLikedComments = new Set(likedComments);
        if (isLiked) {
            newLikedComments.delete(commentId);
        } else {
            newLikedComments.add(commentId);
        }
        setLikedComments(newLikedComments);

        // Update comment like count in state
        const updateLikeCount = (cmts: Comment[]): Comment[] => {
            return cmts.map(c => {
                if (c.id === commentId) {
                    return { ...c, likeCount: c.likeCount + (isLiked ? -1 : 1) };
                }
                // Check replies
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((c as any).replies) {
                    return {
                        ...c,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        replies: ((c as any).replies || []).map((r: Comment) =>
                            r.id === commentId ? { ...r, likeCount: r.likeCount + (isLiked ? -1 : 1) } : r
                        )
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    } as any;
                }
                return c;
            });
        };
        setComments(updateLikeCount(comments));

        // Persist to database
        try {
            await likeComment(commentId, user.uid);
        } catch (error) {
            console.error('Error liking comment:', error);
            // Revert optimistic update
            setLikedComments(likedComments);
            toast.error('Failed to update like');
        }
    };

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto py-8 px-4 font-sans">
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-neutral-200 rounded w-1/4"></div>
                    <div className="h-32 bg-neutral-200 rounded"></div>
                </div>
            </div>
        );
    }

    if (!post) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4 text-center font-sans">
                <div className="bg-neutral-50 rounded-xl p-8 border border-neutral-200">
                    <h1 className="text-xl font-bold mb-2">Post Unavailable</h1>
                    <p className="text-neutral-500 mb-6">This post has been deleted or does not exist.</p>
                    <Link href="/feed">
                        <Button variant="outline">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Feed
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    const handleSubmitComment = async () => {
        if (!user || !comment.trim() || !profile) return;
        setSubmitting(true);
        try {
            await addComment(post.id, user.uid, profile.displayName || 'User', profile.username || 'user', profile.photoURL, comment);
            setComment('');
            // Optimistic update or refetch
            const newComments = await getComments(post.id);
            setComments(newComments);
        } catch (error) {
            console.error('Error posting comment:', error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRepost = async () => {
        if (!user || !post) return;
        try {
            await repostPost(post.id, user.uid);
            setReposted(!reposted);
            setRepostCount(prev => reposted ? prev - 1 : prev + 1);
        } catch (error) {
            console.error('Error reposting:', error);
        }
    };

    const handleSubmitReply = async (parentId: string) => {
        if (!user || !replyText.trim() || !profile || !post) return;
        try {
            await addComment(post.id, user.uid, profile.displayName || 'User', profile.username || 'user', profile.photoURL, replyText, parentId);
            setReplyText('');
            setReplyingTo(null);
            // Refetch comments with replies
            const newComments = await getComments(post.id);
            const commentsWithReplies = await Promise.all(
                newComments.map(async (c) => {
                    const replies = await getReplies(c.id);
                    return { ...c, replies };
                })
            );
            setComments(commentsWithReplies as Comment[]);
        } catch (error) {
            console.error('Error posting reply:', error);
        }
    };

    const handleUpdateComment = async (commentId: string) => {
        if (!editCommentText.trim()) return;
        try {
            await updateComment(commentId, editCommentText);
            setEditingCommentId(null);
            setEditCommentText('');
            // Optimistic update
            const newComments = await getComments(post?.id || '');
            const commentsWithReplies = await Promise.all(
                newComments.map(async (c) => {
                    const replies = await getReplies(c.id);
                    return { ...c, replies };
                })
            );
            setComments(commentsWithReplies as Comment[]);
            toast.success('Comment updated');
        } catch (error) {
            console.error('Error updating comment:', error);
            toast.error('Failed to update comment');
        }
    };

    const handleDeleteComment = async (commentId: string, parentId?: string) => {
        const confirmed = await confirm({
            title: 'Delete Comment',
            description: 'Are you sure you want to delete this comment? This action cannot be undone.',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            destructive: true,
        });
        if (!confirmed) return;
        try {
            await deleteComment(commentId, post?.id || '', parentId);
            // Optimistic update
            const newComments = await getComments(post?.id || '');
            const commentsWithReplies = await Promise.all(
                newComments.map(async (c) => {
                    const replies = await getReplies(c.id);
                    return { ...c, replies };
                })
            );
            setComments(commentsWithReplies as Comment[]);
            toast.success('Comment deleted');
        } catch (error) {
            console.error('Error deleting comment:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast.error(`Failed to delete comment: ${message.substring(0, 100)}`);
        }
    };

    // Calculate total comment count including replies
    const getTotalCommentCount = () => {
        return comments.reduce((total, cmt) => {
            const repliesCount = (cmt as any).replies?.length || 0;
            return total + 1 + repliesCount;
        }, 0);
    };

    // Check if translation is available
    const hasTranslation = post.translatedContent && post.translatedContent.length > 0;

    // Check if user can translate (logged in + no existing translation)
    const canTranslate = user && !hasTranslation;

    // Handle on-demand translation
    const handleTranslate = async () => {
        if (!post || !user) return;

        setTranslating(true);
        try {
            const response = await fetch('/api/user/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': user.email || '',
                },
                body: JSON.stringify({
                    text: post.content,
                    title: post.title || undefined,
                }),
            });

            if (!response.ok) {
                throw new Error('Translation failed');
            }

            const data = await response.json();

            // Update post in database - only include fields with values
            const updateData: Record<string, string> = {};
            if (data.translatedContent) updateData.translatedContent = data.translatedContent;
            if (data.translatedTitle) updateData.translatedTitle = data.translatedTitle;

            if (Object.keys(updateData).length > 0) {
                await updatePost(post.id, updateData);
            }

            // Update local state
            setPost({
                ...post,
                translatedContent: data.translatedContent || post.translatedContent,
                translatedTitle: data.translatedTitle || post.translatedTitle,
            });

            toast.success('Translation complete!');
            setLanguage('vi'); // Switch to Vietnamese view
        } catch (error) {
            console.error('Translation error:', error);
            toast.error('Failed to translate. Please try again.');
        } finally {
            setTranslating(false);
        }
    };

    // Get current title based on language
    const displayTitle = language === 'vi' && post.translatedTitle ? post.translatedTitle : post.title;

    // Get current content based on language
    const displayContent = language === 'vi' && post.translatedContent ? post.translatedContent : post.content;

    // Bold highlighted phrases in content (only for English)
    const formattedContent = () => {
        const content = displayContent;

        // Only highlight phrases in English mode
        if (language === 'vi' || !post.highlightedPhrases || post.highlightedPhrases.length === 0) {
            return content;
        }

        let highlightedContent = content;
        post.highlightedPhrases.forEach(phrase => {
            // Escape special regex characters in phrase
            const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b(${escapedPhrase})\\b`, 'gi');
            highlightedContent = highlightedContent.replace(regex, '<strong class="font-bold text-neutral-900 bg-yellow-100/50 px-0.5 rounded">$1</strong>');
        });
        return highlightedContent;
    };


    // Article View - now uses same layout as regular posts
    if (post.isArticle) {
        return (
            <TextHighlighter
                userId={user?.uid}
                userEmail={user?.email || undefined}
                userName={profile?.displayName}
                userUsername={profile?.username}
            >
                {DialogComponent}
                <div className="max-w-3xl mx-auto py-6 px-4 font-sans">
                    <Link href="/feed" className="inline-block mb-6">
                        <Button variant="ghost" size="sm" className="text-neutral-500">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back
                        </Button>
                    </Link>

                    <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
                        {/* Header */}
                        <div className="flex items-center gap-3 mb-4">
                            {post.source === 'ai-generated' ? (
                                <img
                                    src="/ai-avatar.png"
                                    alt="AI Generated"
                                    className="w-10 h-10 rounded-full object-contain"
                                />
                            ) : getSourceLogo(post.source) ? (
                                <img
                                    src={getSourceLogo(post.source)!}
                                    alt={post.source || 'source'}
                                    className="w-10 h-10 rounded-full object-contain bg-white p-1 border border-neutral-100"
                                />
                            ) : (
                                <Avatar className="h-10 w-10 border border-neutral-100">
                                    <AvatarImage src={post.authorPhotoURL} />
                                    <AvatarFallback className="bg-neutral-100 text-neutral-400 text-sm">
                                        {post.authorUsername?.[0]?.toUpperCase() || '?'}
                                    </AvatarFallback>
                                </Avatar>
                            )}
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-neutral-400">@{post.authorUsername || 'user'}</span>
                                <span className="text-neutral-300">·</span>
                                <span className="text-xs text-neutral-400">
                                    {post.createdAt ? formatTimeAgo(post.createdAt.toDate()) : 'Just now'}
                                </span>
                            </div>
                        </div>

                        {/* Language Toggle - always visible for logged in users */}
                        {user && (
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-xs text-neutral-400">Language:</span>
                                <div className="flex rounded-lg border border-neutral-200 overflow-hidden">
                                    <button
                                        onClick={() => setLanguage('en')}
                                        disabled={translating}
                                        className={`px-3 py-1 text-xs font-medium transition-colors ${language === 'en'
                                            ? 'bg-neutral-900 text-white'
                                            : 'bg-white text-neutral-600 hover:bg-neutral-50'
                                            } ${translating ? 'opacity-50' : ''}`}
                                    >
                                        EN
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!hasTranslation) {
                                                // Trigger translation first
                                                await handleTranslate();
                                            } else {
                                                setLanguage('vi');
                                            }
                                        }}
                                        disabled={translating}
                                        className={`px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1 ${language === 'vi'
                                            ? 'bg-neutral-900 text-white'
                                            : 'bg-white text-neutral-600 hover:bg-neutral-50'
                                            } ${translating ? 'opacity-50' : ''}`}
                                    >
                                        {translating && <Loader2 className="h-3 w-3 animate-spin" />}
                                        VI
                                    </button>
                                </div>

                                {/* Bookmark button */}
                                <button
                                    onClick={handleBookmark}
                                    disabled={bookmarking}
                                    className={`ml-auto p-2 rounded-lg transition-colors ${bookmarked
                                        ? 'bg-amber-100 text-amber-600'
                                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                                        } ${bookmarking ? 'opacity-50' : ''}`}
                                    title={bookmarked ? 'Remove from saved' : 'Save for later'}
                                >
                                    {bookmarking ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Bookmark className={`h-4 w-4 ${bookmarked ? 'fill-current' : ''}`} />
                                    )}
                                </button>
                            </div>
                        )}

                        {/* Title (for articles) */}
                        {displayTitle && (
                            <h1 className="text-2xl font-bold text-neutral-900 mb-4 font-sans">
                                {displayTitle}
                            </h1>
                        )}

                        {/* Cover Image */}
                        {post.coverImage && (
                            <div className="mb-6">
                                <img
                                    src={post.coverImage}
                                    alt={displayTitle || 'Article cover'}
                                    className="w-full h-auto rounded-lg object-cover max-h-[400px]"
                                />
                            </div>
                        )}

                        {/* Content */}
                        <div
                            className="prose prose-xl prose-neutral max-w-none font-serif mb-6 prose-headings:font-sans prose-headings:font-bold prose-h2:text-2xl prose-h3:text-xl prose-blockquote:border-l-4 prose-blockquote:border-neutral-300 prose-blockquote:italic prose-blockquote:text-neutral-600 prose-a:text-blue-600 prose-a:underline"
                            dangerouslySetInnerHTML={{ __html: formattedContent() }}
                        />

                        {/* Action Bar */}
                        <div className="flex items-center gap-6 py-4 border-t border-b border-neutral-100 mb-6">
                            <button
                                onClick={handleRepost}
                                className={`flex items-center gap-2 text-sm font-medium transition-colors ${reposted ? 'text-green-500' : 'text-neutral-500 hover:text-green-500'}`}
                            >
                                <Repeat2 className="h-4 w-4" />
                                <span>{reposted ? 'Reposted' : 'Repost'}</span>
                                {repostCount > 0 && <span className="opacity-70">({repostCount})</span>}
                            </button>
                            <button className="flex items-center gap-2 text-neutral-500 hover:text-blue-500 text-sm font-medium transition-colors">
                                <MessageCircle className="h-4 w-4" />
                                <span>{getTotalCommentCount()} Comments</span>
                            </button>
                        </div>

                        {/* Comment Input */}
                        {user ? (
                            <div className="flex gap-3 mb-6">
                                <Avatar className="h-9 w-9 border border-neutral-100">
                                    <AvatarImage src={profile?.photoURL} />
                                    <AvatarFallback className="bg-neutral-100 text-neutral-500">
                                        {profile?.username?.[0]?.toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-2">
                                    <Textarea
                                        placeholder="Write a comment..."
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        className="min-h-[80px] resize-none border-neutral-200 focus:border-neutral-400 focus:ring-0 text-sm p-3 rounded-lg"
                                    />
                                    <div className="flex justify-end">
                                        <Button
                                            onClick={handleSubmitComment}
                                            disabled={!comment.trim() || submitting}
                                            size="sm"
                                            className="bg-neutral-900 text-white hover:bg-neutral-800 rounded-full px-4"
                                        >
                                            {submitting ? 'Posting...' : 'Comment'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-neutral-50 rounded-lg p-4 text-center mb-6">
                                <p className="text-neutral-600 text-sm mb-2">Sign in to comment</p>
                                <Link href="/login">
                                    <Button variant="outline" size="sm" className="rounded-full">Sign In</Button>
                                </Link>
                            </div>
                        )}

                        {/* Comments List */}
                        <div className="space-y-6">
                            <h3 className="font-semibold text-lg">Comments</h3>

                            {comments.length === 0 ? (
                                <p className="text-neutral-500 text-center py-8 bg-neutral-50 rounded-lg">
                                    No comments yet. Be the first to share your thoughts!
                                </p>
                            ) : (
                                <div className="space-y-6">
                                    {comments.map((cmt) => (
                                        <div key={cmt.id} className="flex gap-4">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={cmt.authorPhotoURL} />
                                                <AvatarFallback>{cmt.authorUsername[0]?.toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1">
                                                <div className="bg-neutral-50 rounded-lg p-3">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="font-semibold text-sm">@{cmt.authorUsername}</span>
                                                        <span className="text-xs text-neutral-400">
                                                            {formatTimeAgo(cmt.createdAt.toDate())}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-neutral-800">{cmt.content}</div>
                                                </div>
                                                <div className="flex gap-4 mt-1 ml-1">
                                                    <button
                                                        className={`text-xs font-medium flex items-center gap-1 ${likedComments.has(cmt.id) ? 'text-red-500' : 'text-neutral-500 hover:text-red-500'}`}
                                                        onClick={() => handleLikeComment(cmt.id)}
                                                    >
                                                        <Heart className={`h-3 w-3 ${likedComments.has(cmt.id) ? 'fill-current' : ''}`} />
                                                        {cmt.likeCount > 0 ? cmt.likeCount : 'Like'}
                                                    </button>
                                                    <button
                                                        className={`text-xs font-medium ${replyingTo === cmt.id ? 'text-blue-500' : 'text-neutral-500 hover:text-blue-500'}`}
                                                        onClick={() => setReplyingTo(replyingTo === cmt.id ? null : cmt.id)}
                                                    >
                                                        Reply
                                                    </button>
                                                </div>

                                                {/* Reply Input */}
                                                {replyingTo === cmt.id && user && (
                                                    <div className="mt-2 flex gap-2">
                                                        <Textarea
                                                            placeholder={`Reply to @${cmt.authorUsername}...`}
                                                            value={replyText}
                                                            onChange={(e) => setReplyText(e.target.value)}
                                                            className="min-h-[60px] text-sm resize-none"
                                                        />
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleSubmitReply(cmt.id)}
                                                            disabled={!replyText.trim()}
                                                            className="self-end"
                                                        >
                                                            Send
                                                        </Button>
                                                    </div>
                                                )}

                                                {/* Display Replies */}
                                                {(cmt as any).replies && (cmt as any).replies.length > 0 && (
                                                    <div className="mt-3 space-y-2 pl-4 border-l-2 border-neutral-200">
                                                        {(cmt as any).replies.map((reply: any) => (
                                                            <div key={reply.id} className="flex gap-2">
                                                                <Avatar className="h-6 w-6">
                                                                    <AvatarImage src={reply.authorPhotoURL} />
                                                                    <AvatarFallback className="text-xs">{reply.authorName?.charAt(0) || '?'}</AvatarFallback>
                                                                </Avatar>
                                                                <div className="flex-1">
                                                                    <div className="bg-neutral-100 rounded-lg px-3 py-2">
                                                                        <span className="font-medium text-xs">@{reply.authorUsername || reply.authorName}</span>
                                                                        <p className="text-xs text-neutral-700">{reply.content}</p>
                                                                    </div>
                                                                    <button
                                                                        className="text-xs text-neutral-500 hover:text-blue-500 mt-1 ml-2"
                                                                        onClick={() => {
                                                                            setReplyingTo(cmt.id);
                                                                            setReplyText(`@${reply.authorUsername || reply.authorName} `);
                                                                        }}
                                                                    >
                                                                        Reply
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </TextHighlighter>
        );
    }

    // Regular Post View
    return (
        <TextHighlighter
            userId={user?.uid}
            userEmail={user?.email || undefined}
            userName={profile?.displayName}
            userUsername={profile?.username}
        >
            {DialogComponent}
            <div className="max-w-2xl mx-auto py-6 px-4 font-sans">
                <Link href="/feed" className="inline-block mb-6">
                    <Button variant="ghost" size="sm" className="text-neutral-500">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                    </Button>
                </Link>

                <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        {post.source === 'ai-generated' ? (
                            <img
                                src="/ai-avatar.png"
                                alt="AI Generated"
                                className="w-10 h-10 rounded-full object-contain"
                            />
                        ) : getSourceLogo(post.source) ? (
                            <img
                                src={getSourceLogo(post.source)!}
                                alt={post.source || 'source'}
                                className="w-10 h-10 rounded-full object-contain bg-white p-1 border border-neutral-100"
                            />
                        ) : (
                            <div className="h-10 w-10 rounded-full bg-neutral-100 flex items-center justify-center text-sm text-neutral-400">
                                {post.authorUsername?.[0]?.toUpperCase() || '?'}
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-neutral-400">@{post.authorUsername || 'user'}</span>
                            <span className="text-neutral-300">·</span>
                            <span className="text-xs text-neutral-400">
                                {post.createdAt ? formatTimeAgo(post.createdAt.toDate()) : 'Just now'}
                            </span>
                        </div>
                    </div>

                    {/* Language Toggle - always visible for logged in users */}
                    {user && (
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-xs text-neutral-400">Language:</span>
                            <div className="flex rounded-lg border border-neutral-200 overflow-hidden">
                                <button
                                    onClick={() => setLanguage('en')}
                                    disabled={translating}
                                    className={`px-3 py-1 text-xs font-medium transition-colors ${language === 'en'
                                        ? 'bg-neutral-900 text-white'
                                        : 'bg-white text-neutral-600 hover:bg-neutral-50'
                                        } ${translating ? 'opacity-50' : ''}`}
                                >
                                    EN
                                </button>
                                <button
                                    onClick={async () => {
                                        if (!hasTranslation) {
                                            await handleTranslate();
                                        } else {
                                            setLanguage('vi');
                                        }
                                    }}
                                    disabled={translating}
                                    className={`px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1 ${language === 'vi'
                                        ? 'bg-neutral-900 text-white'
                                        : 'bg-white text-neutral-600 hover:bg-neutral-50'
                                        } ${translating ? 'opacity-50' : ''}`}
                                >
                                    {translating && <Loader2 className="h-3 w-3 animate-spin" />}
                                    VI
                                </button>
                            </div>
                        </div>
                    )}

                    <div
                        className="text-lg leading-relaxed whitespace-pre-wrap text-neutral-800 font-sans mb-6"
                        dangerouslySetInnerHTML={{ __html: formattedContent() }}
                    />

                    {/* Action Bar */}
                    <div className="flex items-center gap-6 py-4 border-t border-b border-neutral-100 mb-6">
                        <button
                            onClick={handleRepost}
                            className={`flex items-center gap-2 text-sm font-medium transition-colors ${reposted ? 'text-green-500' : 'text-neutral-500 hover:text-green-500'}`}
                        >
                            <Repeat2 className="h-4 w-4" />
                            <span>{reposted ? 'Reposted' : 'Repost'}</span>
                            {repostCount > 0 && <span className="opacity-70">({repostCount})</span>}
                        </button>
                        <button className="flex items-center gap-2 text-neutral-500 hover:text-blue-500 text-sm font-medium transition-colors">
                            <MessageCircle className="h-4 w-4" />
                            <span>{getTotalCommentCount()} Comments</span>
                        </button>
                    </div>

                    {/* Comment Input */}
                    {user ? (
                        <div className="flex gap-3 mb-6">
                            <Avatar className="h-9 w-9 border border-neutral-100">
                                <AvatarImage src={profile?.photoURL} />
                                <AvatarFallback className="bg-neutral-100 text-neutral-500">
                                    {profile?.username?.[0]?.toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 space-y-2">
                                <Textarea
                                    placeholder="Write a comment..."
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    className="min-h-[80px] resize-none border-neutral-200 focus:border-neutral-400 focus:ring-0 text-sm p-3 rounded-lg"
                                />
                                <div className="flex justify-end">
                                    <Button
                                        onClick={handleSubmitComment}
                                        disabled={!comment.trim() || submitting}
                                        size="sm"
                                        className="bg-neutral-900 text-white hover:bg-neutral-800 rounded-full px-4"
                                    >
                                        {submitting ? 'Posting...' : 'Comment'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-neutral-50 rounded-lg p-4 text-center mb-6">
                            <p className="text-neutral-600 text-sm mb-2">Sign in to comment</p>
                            <Link href="/login">
                                <Button variant="outline" size="sm" className="rounded-full">Sign In</Button>
                            </Link>
                        </div>
                    )}

                    {/* Comments List */}
                    <div className="space-y-6">
                        <h3 className="font-semibold text-lg">Comments</h3>

                        {comments.length === 0 ? (
                            <p className="text-neutral-500 text-center py-8 bg-neutral-50 rounded-lg">
                                No comments yet. Be the first to share your thoughts!
                            </p>
                        ) : (
                            <div className="space-y-6">
                                {comments.map((cmt) => (
                                    <div key={cmt.id} className="flex gap-4 group/comment">
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={cmt.authorPhotoURL} />
                                            <AvatarFallback>{cmt.authorUsername[0]?.toUpperCase()}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <div className="bg-neutral-50 rounded-lg p-3 relative group">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="font-semibold text-sm">@{cmt.authorUsername}</span>
                                                    <span className="text-xs text-neutral-400">
                                                        {formatTimeAgo(cmt.createdAt.toDate())}
                                                    </span>
                                                </div>

                                                {editingCommentId === cmt.id ? (
                                                    <div className="mt-1">
                                                        <Textarea
                                                            value={editCommentText}
                                                            onChange={(e) => setEditCommentText(e.target.value)}
                                                            className="min-h-[60px] text-sm resize-none bg-white mb-2"
                                                        />
                                                        <div className="flex gap-2 justify-end">
                                                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                                                            <Button size="sm" className="h-7 text-xs" onClick={() => handleUpdateComment(cmt.id)}>Save</Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="text-sm text-neutral-800">{cmt.content}</div>
                                                )}

                                                {/* Edit/Delete Menu */}
                                                {user && cmt.authorId === user.uid && !editingCommentId && (
                                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full hover:bg-neutral-200">
                                                                    <MoreHorizontal className="h-3 w-3 text-neutral-500" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={() => {
                                                                    setEditingCommentId(cmt.id);
                                                                    setEditCommentText(cmt.content);
                                                                }}>
                                                                    <span className="text-xs">Edit</span>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteComment(cmt.id)}>
                                                                    <span className="text-xs">Delete</span>
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-4 mt-1 ml-1">
                                                <button
                                                    className={`text-xs font-medium flex items-center gap-1 ${likedComments.has(cmt.id) ? 'text-red-500' : 'text-neutral-500 hover:text-red-500'}`}
                                                    onClick={() => handleLikeComment(cmt.id)}
                                                >
                                                    <Heart className={`h-3 w-3 ${likedComments.has(cmt.id) ? 'fill-current' : ''}`} />
                                                    {cmt.likeCount > 0 ? cmt.likeCount : 'Like'}
                                                </button>
                                                <button
                                                    className={`text-xs font-medium ${replyingTo === cmt.id ? 'text-blue-500' : 'text-neutral-500 hover:text-blue-500'}`}
                                                    onClick={() => setReplyingTo(replyingTo === cmt.id ? null : cmt.id)}
                                                >
                                                    Reply
                                                </button>
                                            </div>

                                            {/* Reply Input */}
                                            {replyingTo === cmt.id && user && (
                                                <div className="mt-2 flex gap-2">
                                                    <Textarea
                                                        placeholder={`Reply to @${cmt.authorUsername}...`}
                                                        value={replyText}
                                                        onChange={(e) => setReplyText(e.target.value)}
                                                        className="min-h-[60px] text-sm resize-none"
                                                    />
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleSubmitReply(cmt.id)}
                                                        disabled={!replyText.trim()}
                                                        className="self-end"
                                                    >
                                                        Send
                                                    </Button>
                                                </div>
                                            )}

                                            {/* Display Replies */}
                                            {(cmt as any).replies && (cmt as any).replies.length > 0 && (
                                                <div className="mt-3 space-y-2 pl-4 border-l-2 border-neutral-200">
                                                    {(cmt as any).replies.map((reply: any) => (
                                                        <div key={reply.id} className="flex gap-2 relative group/reply">
                                                            <Avatar className="h-6 w-6">
                                                                <AvatarImage src={reply.authorPhotoURL} />
                                                                <AvatarFallback className="text-xs">{reply.authorName?.charAt(0) || '?'}</AvatarFallback>
                                                            </Avatar>
                                                            <div className="flex-1">
                                                                <div className="bg-neutral-100 rounded-lg px-3 py-2 relative">
                                                                    <span className="font-medium text-xs">@{reply.authorUsername || reply.authorName}</span>

                                                                    {editingCommentId === reply.id ? (
                                                                        <div className="mt-1">
                                                                            <Textarea
                                                                                value={editCommentText}
                                                                                onChange={(e) => setEditCommentText(e.target.value)}
                                                                                className="min-h-[60px] text-xs resize-none bg-white mb-2"
                                                                            />
                                                                            <div className="flex gap-2 justify-end">
                                                                                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                                                                                <Button size="sm" className="h-6 text-xs" onClick={() => handleUpdateComment(reply.id)}>Save</Button>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <p className="text-xs text-neutral-700">{reply.content}</p>
                                                                    )}

                                                                    {/* Reply Edit/Delete Menu */}
                                                                    {user && reply.authorId === user.uid && !editingCommentId && (
                                                                        <div className="absolute top-1 right-1 opacity-0 group-hover/reply:opacity-100 transition-opacity">
                                                                            <DropdownMenu>
                                                                                <DropdownMenuTrigger asChild>
                                                                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full hover:bg-neutral-200">
                                                                                        <MoreHorizontal className="h-3 w-3 text-neutral-500" />
                                                                                    </Button>
                                                                                </DropdownMenuTrigger>
                                                                                <DropdownMenuContent align="end">
                                                                                    <DropdownMenuItem onClick={() => {
                                                                                        setEditingCommentId(reply.id);
                                                                                        setEditCommentText(reply.content);
                                                                                    }}>
                                                                                        <span className="text-xs">Edit</span>
                                                                                    </DropdownMenuItem>
                                                                                    <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteComment(reply.id, cmt.id)}>
                                                                                        <span className="text-xs">Delete</span>
                                                                                    </DropdownMenuItem>
                                                                                </DropdownMenuContent>
                                                                            </DropdownMenu>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <button
                                                                    className="text-xs text-neutral-500 hover:text-blue-500 mt-1 ml-2"
                                                                    onClick={() => {
                                                                        setReplyingTo(cmt.id);
                                                                        setReplyText(`@${reply.authorUsername || reply.authorName} `);
                                                                    }}
                                                                >
                                                                    Reply
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </TextHighlighter>
    );
}
