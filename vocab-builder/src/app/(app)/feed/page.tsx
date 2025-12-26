'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageCircle,
    Repeat2,
    ChevronDown,
    ChevronUp,
    Heart,
    Reply,
    Send,
    Sparkles,
    FileText,
    X,
    Share2,
    Search,
    MoreHorizontal,
    MoreVertical,
    Trash2
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import Link from 'next/link';
import Image from 'next/image';
import TextHighlighter from '@/components/text-highlighter';
import { getSourceLogo } from '@/lib/sources';
import {
    getPosts,
    getComments,
    getReplies,
    createPost,
    createPostWithComments,
    repostPost,
    likeComment,
    addComment,
    Post as PostType,
    Comment as CommentType,
    getBatchUserReposts,
    getBatchUserLikes,
    updateComment,
    deleteComment
} from '@/lib/firestore';
import { Timestamp } from 'firebase/firestore';

interface PostWithComments extends PostType {
    comments: CommentType[];
    userHasReposted?: boolean;
}

interface CommentWithLiked extends CommentType {
    userHasLiked?: boolean;
    replies?: CommentWithLiked[];
}


function PostCard({ post, userId, userProfile, onUpdate }: {
    post: PostWithComments;
    userId?: string;
    userProfile?: {
        displayName: string;
        username: string;
        photoURL?: string;
    };
    onUpdate: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [comment, setComment] = useState('');
    const [comments, setComments] = useState<CommentWithLiked[]>([]);
    const [loading, setLoading] = useState(false);
    const [reposted, setReposted] = useState(post.userHasReposted || false);

    const [repostCount, setRepostCount] = useState(post.repostCount);
    const [commentCount, setCommentCount] = useState(post.commentCount);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');

    // Edit/Delete state
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editCommentText, setEditCommentText] = useState('');

    const isLongPost = post.content.length > 280;
    const displayContent = isLongPost && !expanded
        ? post.content.slice(0, 280) + '...'
        : post.content;

    // Router for programmatic navigation
    const router = useRouter();

    // Click handler that only navigates if no text is selected
    const handleContentClick = () => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
            // Text is selected, don't navigate
            return;
        }
        router.push(`/post/${post.id}`);
    };

    // Article helpers
    const cleanContent = post.content.replace(/<[^>]*>?/gm, '');
    const previewText = cleanContent.split('\n').slice(0, 3).join(' ').slice(0, 150) + '...';
    const readingTime = Math.max(1, Math.ceil(post.content.length / 1000));

    const formatTime = (timestamp: Timestamp | Date | null | undefined) => {
        if (!timestamp) return 'Just now';
        const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
        const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
        if (hours < 1) return 'Just now';
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    const loadComments = async () => {
        if (!showComments) return;
        setLoading(true);
        try {
            const fetchedComments = await getComments(post.id);

            // Fetch all replies in parallel
            const repliesPromises = fetchedComments.map(c => getReplies(c.id));
            const allReplies = await Promise.all(repliesPromises);

            // Collect all comment IDs (including replies) for batch like check
            const allCommentIds = fetchedComments.map(c => c.id);
            allReplies.forEach(replies => {
                replies.forEach(r => allCommentIds.push(r.id));
            });

            // Single batch query for all likes (instead of N queries)
            const likedIds = userId ? await getBatchUserLikes(allCommentIds, userId) : new Set<string>();

            // Build comments with like status
            const commentsWithStatus = fetchedComments.map((c, i) => ({
                ...c,
                userHasLiked: likedIds.has(c.id),
                replies: (allReplies[i] as CommentWithLiked[]).map(r => ({
                    ...r,
                    userHasLiked: likedIds.has(r.id)
                }))
            }));

            setComments(commentsWithStatus as CommentWithLiked[]);

            // Update comment count to include replies
            const totalCount = commentsWithStatus.reduce((total, c) => {
                return total + 1 + (c.replies?.length || 0);
            }, 0);
            setCommentCount(totalCount);
        } catch (error) {
            // Silent fail in production
        }
        setLoading(false);
    };

    const handleUpdateComment = async (commentId: string) => {
        if (!editCommentText.trim()) return;
        try {
            await updateComment(commentId, editCommentText);
            setEditingCommentId(null);
            setEditCommentText('');
            loadComments(); // Reload to show changes
            toast.success('Comment updated');
        } catch (error) {
            console.error('Error updating comment:', error);
            toast.error('Failed to update comment');
        }
    };

    const handleDeleteComment = async (commentId: string, parentId?: string) => {
        if (!confirm('Are you sure you want to delete this comment?')) return;
        try {
            await deleteComment(commentId, post.id, parentId);
            loadComments(); // Reload to show changes
            setCommentCount(prev => Math.max(0, prev - 1));
            toast.success('Comment deleted');
        } catch (error) {
            console.error('Error deleting comment:', error);
            toast.error('Failed to delete comment');
        }
    };



    useEffect(() => {
        loadComments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showComments]);

    const handleSubmitComment = async () => {
        if (!userId || !comment.trim() || !userProfile) return;

        try {
            await addComment(
                post.id,
                userId,
                userProfile.displayName || 'User',
                userProfile.username || 'user',
                userProfile.photoURL,
                comment
            );
            setComment('');
            setCommentCount(prev => prev + 1);
            loadComments();
            onUpdate();
        } catch (error) {
            console.error('Error adding comment:', error);
        }
    };

    const handleRepost = async () => {
        if (!userId) return;
        try {
            await repostPost(post.id, userId);
            setReposted(!reposted);
            setRepostCount(prev => reposted ? prev - 1 : prev + 1);
        } catch (error) {
            console.error('Error reposting:', error);
        }
    };

    const handleLikeComment = async (commentId: string) => {
        if (!userId) return;
        try {
            await likeComment(commentId, userId);
            setComments(prev => prev.map(c => {
                if (c.id === commentId) {
                    return {
                        ...c,
                        userHasLiked: !c.userHasLiked,
                        likeCount: c.userHasLiked ? c.likeCount - 1 : c.likeCount + 1
                    };
                }
                return c;
            }));
        } catch (error) {
            console.error('Error liking comment:', error);
        }
    };

    const handleSubmitReply = async (parentId: string) => {
        if (!userId || !replyText.trim() || !userProfile) return;
        try {
            await addComment(
                post.id,
                userId,
                userProfile.displayName || 'User',
                userProfile.username || 'user',
                userProfile.photoURL,
                replyText,
                parentId
            );
            setReplyText('');
            setReplyingTo(null);
            loadComments();
        } catch (error) {
            console.error('Error adding reply:', error);
        }
    };

    // Bold phrases in content
    const formattedContent = () => {
        if (!post.highlightedPhrases || post.highlightedPhrases.length === 0) return displayContent;

        let content = displayContent;
        post.highlightedPhrases.forEach(phrase => {
            const regex = new RegExp(`(${phrase})`, 'gi');
            content = content.replace(regex, '<strong class="font-bold text-neutral-900">$1</strong>');
        });
        return content;
    };

    return (
        <div className="group py-5 border-b border-neutral-200">
            {/* Header: Source + Date */}
            <Link href={`/post/${post.id}`} className="block">
                <div className="flex items-center gap-2 mb-2 font-sans">
                    {post.source === 'ai-generated' ? (
                        <img
                            src="/ai-avatar.png"
                            alt="AI Generated"
                            className="w-5 h-5 rounded-full object-contain"
                        />
                    ) : getSourceLogo(post.source) ? (
                        <img
                            src={getSourceLogo(post.source)!}
                            alt={post.source || 'source'}
                            className="w-5 h-5 rounded-full object-contain bg-white p-0.5"
                        />
                    ) : (
                        <div className="w-5 h-5 rounded-full bg-neutral-200 flex items-center justify-center text-[10px] text-neutral-400">
                            {(post.authorUsername || post.authorName || 'U')[0].toUpperCase()}
                        </div>
                    )}
                    <span className="text-xs text-neutral-400">@{post.authorUsername || 'user'}</span>
                    <span className="text-neutral-300">·</span>
                    <span className="text-neutral-400 text-xs">{formatTime(post.createdAt)}</span>
                </div>
            </Link>

            {/* Content Switch: Article vs Text */}
            {post.isArticle ? (
                <div className="mb-4">
                    {/* Caption - Author's thoughts about the article */}
                    {post.caption && (
                        <p className="text-[15px] mb-3 leading-relaxed font-sans">
                            {post.caption}
                        </p>
                    )}

                    {/* Link Preview Card */}
                    <Link href={`/post/${post.id}`} className="block group/card">
                        <div className="border border-border rounded-xl bg-neutral-50/50 overflow-hidden hover:bg-neutral-50 hover:border-neutral-300 transition-all duration-200">
                            {post.coverImage && (
                                <div className="w-full h-[240px] overflow-hidden border-b border-border/50">
                                    <img
                                        src={post.coverImage}
                                        alt={post.title || 'Article cover'}
                                        className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500"
                                    />
                                </div>
                            )}
                            <div className="p-4">
                                {/* Title - Hero element */}
                                <h3 className="text-lg font-semibold mb-2 line-clamp-2 text-foreground leading-snug font-sans group-hover/card:text-coral transition-colors">
                                    {post.title || 'Untitled Article'}
                                </h3>

                                {/* Preview text */}
                                <p className="text-muted-foreground text-[14px] line-clamp-2 leading-relaxed mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
                                    {previewText}
                                </p>

                                {/* Reading time */}
                                <div className="flex items-center gap-2">
                                    {post.source && (
                                        <>
                                            {getSourceLogo(post.source) ? (
                                                <img
                                                    src={getSourceLogo(post.source)!}
                                                    alt={post.source}
                                                    className="h-4 w-4 rounded-full object-contain bg-white p-0.5"
                                                />
                                            ) : (
                                                <div className="h-4 w-4 rounded-full bg-neutral-200 flex items-center justify-center text-[8px] text-neutral-500 font-bold">
                                                    {post.source[0]?.toUpperCase()}
                                                </div>
                                            )}
                                            <span className="text-muted-foreground text-xs font-sans uppercase tracking-wider">{post.source}</span>
                                            <span className="text-neutral-300">·</span>
                                        </>
                                    )}
                                    <span className="text-muted-foreground text-xs font-sans">{readingTime} min read</span>
                                </div>
                            </div>
                        </div>
                    </Link>
                </div>
            ) : (
                <>
                    {/* Text Content */}
                    <div
                        onClick={handleContentClick}
                        className="text-[15px] leading-relaxed whitespace-pre-wrap text-foreground mb-4 font-sans hover:text-neutral-600 transition-colors cursor-pointer select-text"
                        dangerouslySetInnerHTML={{ __html: formattedContent() }}
                    />

                    {/* Show more for long posts */}
                    {isLongPost && (
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="text-muted-foreground hover:text-foreground text-sm mb-4 font-sans"
                        >
                            {expanded ? 'Show less' : 'Read more'}
                        </button>
                    )}
                </>
            )}

            {/* Actions - Substack style */}
            <div className="flex items-center gap-5 text-neutral-400 font-sans">
                <button
                    className="flex items-center gap-1.5 text-neutral-500 hover:text-blue-500 transition-colors cursor-pointer"
                    onClick={() => setShowComments(!showComments)}
                >
                    <MessageCircle className="h-4 w-4" />
                    <span className="text-sm">{commentCount}</span>
                </button>
                <button
                    className={`flex items-center gap-1.5 transition-colors cursor-pointer ${reposted ? 'text-green-500' : 'text-neutral-500 hover:text-green-500'}`}
                    onClick={handleRepost}
                >
                    <Repeat2 className="h-4 w-4" />
                    <span className="text-sm">{repostCount}</span>
                </button>
            </div>

            {/* Comments Section */}
            <AnimatePresence>
                {showComments && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 pt-2"
                    >
                        <Separator />

                        {loading && (
                            <div className="text-sm text-neutral-500">Loading comments...</div>
                        )}

                        {comments.length > 0 && (
                            <div className="space-y-3">
                                {comments.map((c) => (
                                    <div key={c.id} className="flex gap-3 group">
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={c.authorPhotoURL} />
                                            <AvatarFallback className="bg-neutral-200 text-sm">{c.authorUsername?.charAt(0)?.toUpperCase() || c.authorName.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <div className="bg-neutral-100 rounded-2xl px-4 py-2 font-sans relative group/comment">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-sm text-neutral-900">@{c.authorUsername || c.authorName}</span>
                                                    <span className="text-xs text-neutral-500">{formatTime(c.createdAt)}</span>
                                                </div>

                                                {editingCommentId === c.id ? (
                                                    <div className="mt-1">
                                                        <Textarea
                                                            value={editCommentText}
                                                            onChange={(e) => setEditCommentText(e.target.value)}
                                                            className="min-h-[60px] text-sm resize-none bg-white mb-2"
                                                        />
                                                        <div className="flex gap-2 justify-end">
                                                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                                                            <Button size="sm" className="h-7 text-xs" onClick={() => handleUpdateComment(c.id)}>Save</Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-neutral-800">{c.content}</p>
                                                )}

                                                {/* Edit/Delete Menu */}
                                                {userId && c.authorId === userId && !editingCommentId && (
                                                    <div className="absolute top-2 right-2 opacity-0 group-hover/comment:opacity-100 transition-opacity">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full hover:bg-neutral-200">
                                                                    <MoreHorizontal className="h-3 w-3 text-neutral-500" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onClick={() => {
                                                                    setEditingCommentId(c.id);
                                                                    setEditCommentText(c.content);
                                                                }}>
                                                                    <span className="text-xs">Edit</span>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteComment(c.id)}>
                                                                    <span className="text-xs">Delete</span>
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 px-2 font-sans">
                                                <button
                                                    className={`text-xs ${c.userHasLiked ? 'text-red-500' : 'text-neutral-500 hover:text-red-500'}`}
                                                    onClick={() => handleLikeComment(c.id)}
                                                >
                                                    {c.likeCount} likes
                                                </button>
                                                <button
                                                    className={`text-xs ${replyingTo === c.id ? 'text-blue-500' : 'text-neutral-500 hover:text-blue-500'}`}
                                                    onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                                                >
                                                    Reply
                                                </button>
                                            </div>

                                            {/* Reply input */}
                                            {replyingTo === c.id && userId && (
                                                <div className="mt-2 flex gap-2">
                                                    <Textarea
                                                        placeholder={`Reply to @${c.authorUsername || c.authorName}...`}
                                                        value={replyText}
                                                        onChange={(e) => setReplyText(e.target.value)}
                                                        className="min-h-[40px] text-sm resize-none font-sans"
                                                    />
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleSubmitReply(c.id)}
                                                        disabled={!replyText.trim()}
                                                    >
                                                        <Send className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            )}

                                            {/* Replies */}
                                            {c.replies && c.replies.length > 0 && (
                                                <div className="mt-2 space-y-2 pl-4 border-l-2 border-neutral-200 font-sans">
                                                    {c.replies.map((reply) => (
                                                        <div key={reply.id} className="flex gap-2 group">
                                                            <Avatar className="h-6 w-6">
                                                                <AvatarImage src={reply.authorPhotoURL} />
                                                                <AvatarFallback className="text-xs bg-neutral-200">{reply.authorUsername?.charAt(0)?.toUpperCase() || reply.authorName.charAt(0)}</AvatarFallback>
                                                            </Avatar>
                                                            <div className="flex-1">
                                                                <div className="bg-neutral-100 rounded-xl px-3 py-1.5 relative group">
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
                                                                        <p className="text-xs">{reply.content}</p>
                                                                    )}

                                                                    {/* Reply Edit/Delete Menu */}
                                                                    {userId && reply.authorId === userId && !editingCommentId && (
                                                                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                                                                    <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteComment(reply.id, c.id)}>
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
                                                                        setReplyingTo(c.id);
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

                        {!loading && comments.length === 0 && (
                            <p className="text-sm text-neutral-500">No comments yet</p>
                        )}

                        {/* Add comment */}
                        {userId && (
                            <div className="flex gap-3">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={userProfile?.photoURL} />
                                    <AvatarFallback className="bg-neutral-200">U</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 flex gap-2">
                                    <Textarea
                                        placeholder="Post your reply"
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        className="min-h-[40px] resize-none font-sans"
                                    />
                                    <Button onClick={handleSubmitComment} disabled={!comment.trim()}>
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}

function DailyReviewCard({ userId, userProfile, onReviewComplete }: { userId: string, userProfile: any, onReviewComplete: () => void }) {
    const [loading, setLoading] = useState(false);
    const [duePhrases, setDuePhrases] = useState<any[]>([]);

    useEffect(() => {
        const loadDuePhrases = async () => {
            const { getDuePhrases } = await import('@/lib/firestore');
            const phrases = await getDuePhrases(userId, 10);
            setDuePhrases(phrases);
        };
        loadDuePhrases();
    }, [userId]);

    const router = useRouter();

    const handleStartReview = async () => {
        setLoading(true);
        try {
            toast.info(`Preparing debate for ${duePhrases.length} phrases...`);

            // Step 1: Cluster phrases by topic
            const clusterResponse = await fetch('/api/user/cluster-phrases', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userProfile?.email || '',
                },
                body: JSON.stringify({
                    phrases: duePhrases.map(p => ({
                        phraseId: p.id,
                        phrase: p.phrase,
                        meaning: p.meaning,
                    })),
                }),
            });

            let cluster = {
                topic: 'Daily Review',
                phrases: duePhrases.map(p => ({
                    phraseId: p.id,
                    phrase: p.phrase,
                    meaning: p.meaning,
                })),
            };

            if (clusterResponse.ok) {
                const clusterData = await clusterResponse.json();
                if (clusterData.clusters && clusterData.clusters.length > 0) {
                    // Take the first cluster for simplicity
                    cluster = clusterData.clusters[0];
                }
            }

            // Step 2: Start debate
            const response = await fetch('/api/user/start-debate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userProfile?.email || '',
                },
                body: JSON.stringify({
                    userId,
                    phrases: cluster.phrases,
                    topicAngle: cluster.topic.toLowerCase(),
                    isScheduled: true, // SRS review = true
                }),
            });

            if (response.ok) {
                const data = await response.json();
                sessionStorage.setItem('debateData', JSON.stringify(data));
                router.push(`/practice/debate/${data.debateId}`);
            } else {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                console.error('API error:', response.status, errorData);
                toast.error(`Failed to start debate: ${errorData.error || response.statusText}`);
            }
        } catch (error) {
            console.error('Debate start failed:', error);
            toast.error('Failed to start debate.');
        } finally {
            setLoading(false);
        }
    };

    if (duePhrases.length === 0) return null;

    return (
        <Card className="mb-6 border-neutral-200 bg-neutral-50 dark:bg-neutral-900/20 dark:border-neutral-800 font-sans">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-full">
                            <Sparkles className="w-5 h-5 text-black dark:text-neutral-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Daily Review Ready</h3>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                {duePhrases.length} phrases are due for review today.
                            </p>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-2 mb-4">
                    {duePhrases.slice(0, 3).map((p, i) => (
                        <Badge key={i} variant="secondary" className="bg-white border-neutral-200 text-neutral-700">
                            {p.phrase}
                        </Badge>
                    ))}
                    {duePhrases.length > 3 && (
                        <span className="text-xs text-muted-foreground flex items-center">+{duePhrases.length - 3} more</span>
                    )}
                </div>
                <Button
                    onClick={handleStartReview}
                    disabled={loading}
                    className="w-full bg-black hover:bg-neutral-800 text-white"
                >
                    {loading ? 'Generating...' : 'Start Daily Review'}
                </Button>
            </CardContent>
        </Card>
    );
}

function PostSkeleton() {
    return (
        <Card className="bg-white border-neutral-200">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
            </CardContent>
        </Card>
    );
}

export default function FeedPage() {
    const { profile, user } = useAuth();
    const [posts, setPosts] = useState<PostWithComments[]>([]);
    const [loading, setLoading] = useState(true);

    const loadPosts = async () => {
        setLoading(true);
        try {
            // Pass userId to filter AI-generated posts (only show user's own)
            const fetchedPosts = await getPosts(20, user?.uid);

            // BATCH query: get all repost statuses in ONE query (not N queries)
            const postIds = fetchedPosts.map(p => p.id);
            const repostedSet = user
                ? await getBatchUserReposts(postIds, user.uid)
                : new Set<string>();

            const postsWithStatus = fetchedPosts.map(p => ({
                ...p,
                comments: [],
                userHasReposted: repostedSet.has(p.id)
            }));
            setPosts(postsWithStatus);
        } catch {
            // Silent fail in production
        }
        setLoading(false);
    };

    useEffect(() => {
        loadPosts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const handlePhraseSaved = (_data: { phrase: string; context: string; meaning: string }) => {
        // Phrase saved callback - could show toast or refresh
    };



    return (
        <TextHighlighter
            userId={user?.uid}
            userEmail={user?.email || undefined}
            userName={profile?.displayName}
            userUsername={profile?.username}
            onPhraseSaved={handlePhraseSaved}
        >
            <div className="space-y-4 py-4">
                {/* Daily Review Card */}
                <DailyReviewCard
                    userId={user?.uid || ''}
                    userProfile={profile}
                    onReviewComplete={loadPosts}
                />

                {loading ? (
                    <>
                        <PostSkeleton />
                        <PostSkeleton />
                        <PostSkeleton />
                    </>
                ) : posts.length === 0 ? (
                    <div className="py-12 text-center">
                        <p className="text-neutral-500">No posts yet. Check back soon!</p>
                    </div>
                ) : (
                    posts.map((post, index) => (
                        <motion.div
                            key={post.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                duration: 0.4,
                                delay: index * 0.08,
                                ease: [0.25, 0.1, 0.25, 1]
                            }}
                        >
                            <PostCard
                                post={post}
                                userId={user?.uid}
                                userProfile={profile ? {
                                    displayName: profile.displayName,
                                    username: profile.username,
                                    photoURL: profile.photoURL
                                } : undefined}
                                onUpdate={loadPosts}
                            />
                        </motion.div>
                    ))
                )}
            </div>
        </TextHighlighter>
    );
}
