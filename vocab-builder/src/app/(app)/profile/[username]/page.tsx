'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
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
import { motion } from 'framer-motion';
import {
    Edit2,
    MessageCircle,
    Repeat2,
    BookOpen,
    Flame
} from 'lucide-react';
import { getUserComments, getUserReposts, getPost, Repost, updateComment, deleteComment, getSavedArticles, unsaveArticle, SavedArticle } from '@/lib/firestore';
import { Timestamp } from 'firebase/firestore';
import Link from 'next/link';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { MoreHorizontal, Trash2, Bookmark } from 'lucide-react';
import { useConfirm } from '@/components/confirm-dialog';

interface CommentData {
    id: string;
    postId: string;
    content: string;
    likeCount: number;
    createdAt: Timestamp;
    post?: {
        authorName: string;
        authorUsername: string;
        content: string;
    };
}

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
    const [comments, setComments] = useState<CommentData[]>([]);
    const [reposts, setReposts] = useState<RepostWithPost[]>([]);
    const [savedArticles, setSavedArticles] = useState<Array<SavedArticle & { post?: { title?: string; content: string; authorName: string } }>>([]);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editCommentText, setEditCommentText] = useState('');
    // Confirm dialog
    const { confirm, DialogComponent } = useConfirm();

    const handleUpdateComment = async (commentId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!editCommentText.trim()) return;
        try {
            await updateComment(commentId, editCommentText);
            setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: editCommentText } : c));
            setEditingCommentId(null);
            toast.success('Comment updated');
        } catch (error) {
            toast.error('Failed to update comment');
        }
    };

    const handleDeleteComment = async (commentId: string, postId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const confirmed = await confirm({
            title: 'Delete Comment',
            description: 'Are you sure you want to delete this comment? This action cannot be undone.',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            destructive: true,
        });
        if (!confirmed) return;
        try {
            await deleteComment(commentId, postId);
            setComments(prev => prev.filter(c => c.id !== commentId));
            toast.success('Comment deleted');
        } catch (error) {
            console.error('Error deleting comment:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast.error(`Failed to delete comment: ${message.substring(0, 100)}`);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            if (!user) return;

            try {
                // Load user's comments
                const userComments = await getUserComments(user.uid);
                const commentsWithPosts = await Promise.all(
                    userComments.map(async (c) => {
                        const post = await getPost(c.postId);
                        return {
                            ...c,
                            post: post ? {
                                authorName: post.authorName,
                                authorUsername: post.authorUsername,
                                content: post.content,
                            } : undefined,
                        };
                    })
                );
                setComments(commentsWithPosts);

                // Load user's reposts with post data
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

                // Load user's saved articles
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
                            } : undefined,
                        };
                    })
                );
                setSavedArticles(savedWithPosts);
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
        return `${Math.floor(hours / 24)}d ago`;
    };

    const handleSaveBio = () => {
        // TODO: Save to Firestore
        setEditBioOpen(false);
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <Card className="bg-white border-neutral-200">
                    <CardContent className="py-8">
                        <div className="flex items-start gap-4">
                            <Skeleton className="h-20 w-20 rounded-full" />
                            <div className="space-y-2 flex-1">
                                <Skeleton className="h-6 w-40" />
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-4 w-full" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="text-center py-12">
                <p className="text-neutral-500">Profile not found</p>
            </div>
        );
    }

    return (
        <>
            {DialogComponent}
            <div className="space-y-6 font-sans">
                {/* Profile Header */}
                <Card className="bg-white border-neutral-200">
                    <CardContent className="py-8">
                        <div className="flex flex-col sm:flex-row items-start gap-6">
                            {/* Avatar */}
                            <Avatar className="h-20 w-20">
                                <AvatarImage src={profile.photoURL} alt={profile.displayName} />
                                <AvatarFallback className="text-2xl bg-neutral-200">
                                    {profile.displayName?.charAt(0) || 'U'}
                                </AvatarFallback>
                            </Avatar>

                            {/* Info */}
                            <div className="flex-1 space-y-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h1 className="text-2xl font-bold font-sans">{profile.displayName}</h1>
                                        <p className="text-neutral-500 font-sans">@{profile.username}</p>
                                    </div>
                                    {isOwnProfile && (
                                        <Dialog open={editBioOpen} onOpenChange={setEditBioOpen}>
                                            <DialogTrigger asChild>
                                                <Button
                                                    size="sm"
                                                    className="bg-neutral-900 text-white hover:bg-neutral-800 active:scale-95 transition-all"
                                                >
                                                    <Edit2 className="h-4 w-4 mr-2" />
                                                    Edit Profile
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="font-sans">
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
                                                <p className="text-xs text-neutral-500 text-right">
                                                    {bio.length}/160
                                                </p>
                                                <DialogFooter>
                                                    <Button variant="outline" onClick={() => setEditBioOpen(false)}>
                                                        Cancel
                                                    </Button>
                                                    <Button onClick={handleSaveBio}>Save</Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    )}
                                </div>

                                {/* Bio */}
                                <p className="text-sm font-sans">
                                    {profile.bio || (isOwnProfile ? 'Add a bio to tell others about yourself.' : 'No bio yet.')}
                                </p>

                                {/* Stats */}
                                <div className="flex flex-wrap gap-4 pt-2 font-sans">
                                    <div className="flex items-center gap-1.5 text-sm">
                                        <BookOpen className="h-4 w-4 text-neutral-400" />
                                        <span className="font-semibold">{profile.stats.totalPhrases}</span>
                                        <span className="text-neutral-500">phrases</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-sm">
                                        <MessageCircle className="h-4 w-4 text-neutral-400" />
                                        <span className="font-semibold">{comments.length}</span>
                                        <span className="text-neutral-500">comments</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-sm">
                                        <Repeat2 className="h-4 w-4 text-neutral-400" />
                                        <span className="font-semibold">{reposts.length}</span>
                                        <span className="text-neutral-500">reposts</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-sm">
                                        <Flame className="h-4 w-4 text-orange-500" />
                                        <span className="font-semibold">{profile.stats.currentStreak}</span>
                                        <span className="text-neutral-500">day streak</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Tabs */}
                <Tabs defaultValue="comments" className="w-full">
                    <TabsList className="w-full bg-neutral-100">
                        <TabsTrigger value="comments" className="flex-1 cursor-pointer">
                            <MessageCircle className="h-4 w-4 mr-2" />
                            Comments ({comments.length})
                        </TabsTrigger>
                        <TabsTrigger value="reposts" className="flex-1 cursor-pointer">
                            <Repeat2 className="h-4 w-4 mr-2" />
                            Reposts ({reposts.length})
                        </TabsTrigger>
                        <TabsTrigger value="saved" className="flex-1 cursor-pointer">
                            <Bookmark className="h-4 w-4 mr-2" />
                            Saved ({savedArticles.length})
                        </TabsTrigger>
                    </TabsList>

                    {/* Comments Tab */}
                    <TabsContent value="comments" className="mt-4 space-y-3">
                        {comments.length === 0 ? (
                            <Card className="py-8 bg-white border-neutral-200">
                                <CardContent className="text-center text-neutral-500">
                                    No comments yet. Start engaging with posts!
                                </CardContent>
                            </Card>
                        ) : (
                            comments.map((comment) => (
                                <motion.div
                                    key={comment.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    <Link href={`/post/${comment.postId}`} className="block">
                                        <Card className="hover:shadow-sm transition-shadow cursor-pointer bg-white border-neutral-200 relative group/card">
                                            <CardContent className="py-4">
                                                {/* Post Context */}
                                                {comment.post ? (
                                                    <div className="mb-3 p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-xs font-semibold text-neutral-900 font-sans">@{comment.post.authorUsername}</span>
                                                            <span className="text-xs text-neutral-400 font-sans">posted:</span>
                                                        </div>
                                                        <div
                                                            className="text-xs text-neutral-600 line-clamp-2 italic font-serif"
                                                            dangerouslySetInnerHTML={{ __html: comment.post.content }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="mb-3 p-2 bg-neutral-50/50 rounded-lg border border-neutral-100/50">
                                                        <p className="text-xs text-neutral-400 italic">Post unavailable</p>
                                                    </div>
                                                )}

                                                {editingCommentId === comment.id ? (
                                                    <div onClick={(e) => e.preventDefault()} className="mb-2">
                                                        <Textarea
                                                            value={editCommentText}
                                                            onChange={(e) => setEditCommentText(e.target.value)}
                                                            className="min-h-[80px] text-sm resize-none bg-white mb-2"
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        <div className="flex gap-2 justify-end">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 text-xs"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    setEditingCommentId(null);
                                                                }}
                                                            >
                                                                Cancel
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                className="h-7 text-xs"
                                                                onClick={(e) => handleUpdateComment(comment.id, e)}
                                                            >
                                                                Save
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-sm mb-2 font-sans font-medium text-neutral-800">{comment.content}</p>
                                                )}

                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4 text-xs text-neutral-500 font-sans">
                                                        <span>{formatTime(comment.createdAt)}</span>
                                                        <span>♡ {comment.likeCount} likes</span>
                                                    </div>

                                                    {/* Edit/Delete Menu - Only visible on hover and if own profile */}
                                                    {!editingCommentId && (
                                                        <div className="opacity-0 group-hover/card:opacity-100 transition-opacity" onClick={(e) => e.preventDefault()}>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0 rounded-full hover:bg-neutral-100"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <MoreHorizontal className="h-3 w-3 text-neutral-500" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setEditingCommentId(comment.id);
                                                                            setEditCommentText(comment.content);
                                                                        }}
                                                                    >
                                                                        <Edit2 className="h-3 w-3 mr-2" />
                                                                        Edit
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        className="text-red-600 focus:text-red-600"
                                                                        onClick={(e) => handleDeleteComment(comment.id, comment.postId, e)}
                                                                    >
                                                                        <Trash2 className="h-3 w-3 mr-2" />
                                                                        Delete
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                </motion.div>
                            ))
                        )}
                    </TabsContent>

                    {/* Reposts Tab */}
                    <TabsContent value="reposts" className="mt-4 space-y-3">
                        {reposts.length === 0 ? (
                            <Card className="py-8 bg-white border-neutral-200">
                                <CardContent className="text-center text-neutral-500">
                                    No reposts yet. Click the repost button on posts you like!
                                </CardContent>
                            </Card>
                        ) : (
                            reposts.map((repost) => (
                                <motion.div
                                    key={repost.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    <Card className="hover:shadow-sm transition-shadow cursor-pointer bg-white border-neutral-200">
                                        <CardContent className="py-4">
                                            <div className="flex items-center gap-2 text-sm text-green-600 mb-2">
                                                <Repeat2 className="h-4 w-4" />
                                                <span className="font-medium">Reposted</span>
                                            </div>
                                            {repost.post ? (
                                                <>
                                                    <p className="text-xs text-neutral-500 mb-1">
                                                        from @{repost.post.authorUsername}
                                                    </p>
                                                    <p className="text-sm line-clamp-2">{repost.post.content}</p>
                                                </>
                                            ) : (
                                                <p className="text-sm text-neutral-400 italic">Post no longer available</p>
                                            )}
                                            <p className="text-xs text-neutral-500 mt-2">
                                                {formatTime(repost.createdAt)}
                                            </p>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))
                        )}
                    </TabsContent>

                    {/* Saved Articles Tab */}
                    <TabsContent value="saved" className="mt-4 space-y-3">
                        {savedArticles.length === 0 ? (
                            <Card className="py-8 bg-white border-neutral-200">
                                <CardContent className="text-center text-neutral-500">
                                    No saved articles yet. Click the bookmark icon on articles to save them!
                                </CardContent>
                            </Card>
                        ) : (
                            savedArticles.map((saved) => (
                                <motion.div
                                    key={saved.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    <Link href={`/post/${saved.postId}`} className="block">
                                        <Card className="hover:shadow-sm transition-shadow cursor-pointer bg-white border-neutral-200 group">
                                            <CardContent className="py-4">
                                                <div className="flex items-center gap-2 text-sm text-amber-600 mb-2">
                                                    <Bookmark className="h-4 w-4 fill-current" />
                                                    <span className="font-medium">Saved Article</span>
                                                </div>
                                                {saved.post ? (
                                                    <>
                                                        {saved.post.title && (
                                                            <h3 className="font-semibold text-neutral-900 mb-1 line-clamp-1">
                                                                {saved.post.title}
                                                            </h3>
                                                        )}
                                                        <p className="text-xs text-neutral-500 mb-1">
                                                            by {saved.post.authorName}
                                                        </p>
                                                        <p className="text-sm text-neutral-600 line-clamp-2">
                                                            {saved.post.content.replace(/<[^>]*>/g, '').substring(0, 150)}...
                                                        </p>
                                                    </>
                                                ) : (
                                                    <p className="text-sm text-neutral-400 italic">Article no longer available</p>
                                                )}
                                                <div className="flex justify-between items-center mt-3">
                                                    <p className="text-xs text-neutral-400">
                                                        Saved {formatTime(saved.savedAt)}
                                                    </p>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-50"
                                                        onClick={async (e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            if (!user) return;
                                                            await unsaveArticle(user.uid, saved.postId);
                                                            setSavedArticles(prev => prev.filter(s => s.id !== saved.id));
                                                            toast.info('Article removed from saved');
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-1" />
                                                        Remove
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                </motion.div>
                            ))
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </>
    );
}
