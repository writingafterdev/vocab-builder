'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useRouter, usePathname } from 'next/navigation';
import { Post, ArticleSection, LexileLevel, Comment as FirestoreComment, RedditComment } from '@/lib/db/types';
import { updatePost } from '@/lib/db/admin';
import { getComments, getReplies } from '@/lib/db/comments';
import { ImmersedReader } from './ImmersedReader';
import { SwipeReader } from './SwipeReader';
import { LevelSwitcher } from './LevelSwitcher';
import { ArticleDock, ArticleDockGroup } from './ArticleDock';
import { FloatingDock, DockItem } from '@/components/ui/floating-dock';
import { VocabPopupCard } from './VocabPopupCard';
import { ArrowLeft, Volume2, Bookmark, ArrowLeftRight, Loader2, Sparkles, MessageSquare } from 'lucide-react';
import { BookOpen, BookmarkSimple, PencilSimple, SquaresFour, User, Gear } from '@phosphor-icons/react';

type ReadingMode = 'immersed' | 'swipe';

interface ArticleReadingModeProps {
    post: Post;
    userId?: string;
    userEmail?: string;
    isAdmin?: boolean;
    onBookmark: () => void;
    bookmarked: boolean;
    bookmarking: boolean;
    audioUrl?: string;
    onGenerateAudio?: () => Promise<void>;
    isGeneratingAudio?: boolean;
}

interface VocabPopupState {
    phrase: string;
    meaning: string;
    example?: string;
    register?: string | string[];
    nuance?: string | string[];
    context?: string;
    contextTranslation?: string;
    pronunciation?: string;
    topic?: string | string[];
    subtopic?: string;
    isHighFrequency?: boolean;
}

export function ArticleReadingMode({
    post,
    userId,
    userEmail,
    isAdmin = false,
    onBookmark,
    bookmarked,
    bookmarking,
    audioUrl,
    onGenerateAudio,
    isGeneratingAudio,
}: ArticleReadingModeProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [mode, setMode] = useState<ReadingMode>('immersed');
    const [currentSection, setCurrentSection] = useState(0);
    const [vocabPopup, setVocabPopup] = useState<VocabPopupState | null>(null);
    const [savedPhrases, setSavedPhrases] = useState<Set<string>>(new Set());
    const [showNavDock, setShowNavDock] = useState(false);
    const [extractedPhrases, setExtractedPhrases] = useState<string[]>([]);
    const [bounceKey, setBounceKey] = useState(0);

    // === Level Switcher State ===
    const availableLevels = useMemo<LexileLevel[]>(() => {
        if (post.levels) {
            return Object.keys(post.levels) as LexileLevel[];
        }
        return [];
    }, [post.levels]);

    const [selectedLevel, setSelectedLevel] = useState<LexileLevel>(
        availableLevels.length > 0 ? availableLevels[availableLevels.length - 1] : 'B2'
    );

    // Current content based on selected level
    const currentContent = useMemo(() => {
        if (post.levels?.[selectedLevel]?.content) {
            return post.levels[selectedLevel].content;
        }
        return post.content;
    }, [post.levels, post.content, selectedLevel]);

    // Current embedded questions based on selected level
    const currentQuestions = useMemo(() => {
        if (post.levels?.[selectedLevel]?.embeddedQuestions) {
            return post.levels[selectedLevel].embeddedQuestions;
        }
        return [];
    }, [post.levels, selectedLevel]);

    // === MCQ State ===
    const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
    const handleQuestionAnswer = useCallback((questionId: string, isCorrect: boolean) => {
        setAnsweredQuestions(prev => {
            const next = new Set(prev);
            next.add(questionId);
            return next;
        });
    }, []);

    // === Comments State ===
    const [comments, setComments] = useState<(FirestoreComment & { replies?: FirestoreComment[] })[]>([]);
    const [commentsLoaded, setCommentsLoaded] = useState(false);

    // Load comments on mount
    useEffect(() => {
        if (!post.id || commentsLoaded) return;

        async function loadComments() {
            try {
                const topLevelComments = await getComments(post.id as string);
                const commentsWithReplies = await Promise.all(
                    topLevelComments.map(async (c) => {
                        const replies = c.replyCount > 0 ? await getReplies(c.id) : [];
                        return { ...c, replies };
                    })
                );
                setComments(commentsWithReplies);
            } catch (e) {
                console.error('Failed to load comments:', e);
            } finally {
                setCommentsLoaded(true);
            }
        }

        loadComments();
    }, [post.id, commentsLoaded]);

    // Reddit comments from post data
    const redditComments = useMemo<RedditComment[]>(() => {
        return (post as any).redditComments || [];
    }, [post]);

    // Navigation dock items (mirrors the global dock)
    const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
    const navDockItems: DockItem[] = [
        { href: '/dashboard', icon: <SquaresFour className="w-5 h-5" weight={isActive('/dashboard') ? 'fill' : 'regular'} />, label: 'Dashboard', isActive: isActive('/dashboard') },
        { href: '/feed', icon: <BookOpen className="w-5 h-5" weight={isActive('/feed') ? 'fill' : 'regular'} />, label: 'Library', isActive: isActive('/feed') },
        { href: '/practice', icon: <PencilSimple className="w-5 h-5" weight={isActive('/practice') ? 'fill' : 'regular'} />, label: 'Practice', isActive: isActive('/practice') },
        { href: '/vocab', icon: <BookmarkSimple className="w-5 h-5" weight={isActive('/vocab') ? 'fill' : 'regular'} />, label: 'Vocab Bank', isActive: isActive('/vocab') },
        { href: '/settings', icon: <Gear className="w-5 h-5" weight={isActive('/settings') ? 'fill' : 'regular'} />, label: 'Settings', isActive: isActive('/settings') },
    ];

    // Audio playback state
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    // Generate fallback sections by splitting content into paragraph groups
    const sections: ArticleSection[] = useMemo(() => {
        if (post.sections && post.sections.length > 0) return post.sections;

        const tempDiv = typeof document !== 'undefined' ? document.createElement('div') : null;
        if (!tempDiv) return [];
        tempDiv.innerHTML = currentContent;

        const blocks: string[] = [];
        tempDiv.querySelectorAll('p, h1, h2, h3, h4, blockquote, ul, ol, figure').forEach(el => {
            const html = el.outerHTML.trim();
            if (html) blocks.push(html);
        });

        if (blocks.length <= 1) {
            return [{ id: 'fallback-0', title: '', content: currentContent, vocabPhrases: [] }];
        }

        const blocksPerSection = 1;
        const fallback: ArticleSection[] = [];

        for (let i = 0; i < blocks.length; i += blocksPerSection) {
            const chunk = blocks.slice(i, i + blocksPerSection);
            fallback.push({
                id: `fallback-${fallback.length}`,
                title: '',
                content: chunk.join('\n'),
                vocabPhrases: [],
            });
        }

        return fallback;
    }, [post.sections, currentContent]);

    // Create/update audio element when audioUrl changes
    useEffect(() => {
        if (audioUrl) {
            if (!audioRef.current) {
                audioRef.current = new Audio(audioUrl);
            } else if (audioRef.current.src !== audioUrl) {
                audioRef.current.src = audioUrl;
            }
            audioRef.current.onended = () => setIsPlaying(false);
        }
        return () => {
            audioRef.current?.pause();
        };
    }, [audioUrl]);

    // Handle listen button click — just play/pause, user swipes manually
    const handleListenClick = useCallback(async () => {
        if (isGeneratingAudio) return;

        if (isPlaying) {
            audioRef.current?.pause();
            setIsPlaying(false);
            return;
        }

        if (audioUrl && audioRef.current) {
            audioRef.current.play();
            setIsPlaying(true);
        } else {
            await onGenerateAudio?.();
        }
    }, [audioUrl, isPlaying, isGeneratingAudio, onGenerateAudio]);

    // Collect all highlighted phrases from sections or phraseData
    const allPhrases = useMemo(() => {
        // Freshly extracted phrases take priority
        if (extractedPhrases.length > 0) return extractedPhrases;

        // Level-specific vocabulary
        if (post.levels?.[selectedLevel]?.vocabularyData) {
            return Object.keys(post.levels[selectedLevel].vocabularyData!);
        }

        if (sections.length > 0 && sections.some(s => s.vocabPhrases.length > 0)) {
            return sections.flatMap(s => s.vocabPhrases);
        }
        if (post.phraseData) {
            return post.phraseData.map(p => p.phrase);
        }
        return post.highlightedPhrases || [];
    }, [extractedPhrases, sections, post.phraseData, post.highlightedPhrases, post.levels, selectedLevel]);

    // Track current popup phrase via ref to keep handlePhraseClick stable
    const vocabPopupPhraseRef = useRef<string | null>(null);

    // Handle phrase click — show popup
    const handlePhraseClick = useCallback(
        (phrase: string, context: string, _rect: DOMRect) => {
            if (vocabPopupPhraseRef.current?.toLowerCase() === phrase.toLowerCase()) {
                setBounceKey(k => k + 1);
                return;
            }

            const phraseData = post.phraseData?.find(
                p => p.phrase.toLowerCase() === phrase.toLowerCase()
            );

            // Check level-specific vocab data
            const levelVocab = post.levels?.[selectedLevel]?.vocabularyData?.[phrase.toLowerCase()];
            const vocabData = post.vocabularyData?.[phrase.toLowerCase()];

            vocabPopupPhraseRef.current = phrase;
            setBounceKey(0);
            setVocabPopup({
                phrase,
                meaning: levelVocab?.meaning || phraseData?.meaning || vocabData?.meaning || 'Looking up...',
                example: levelVocab?.example || vocabData?.example,
                register: levelVocab?.register || phraseData?.register || vocabData?.register,
                nuance: phraseData?.nuance,
                context: context || undefined,
                pronunciation: undefined,
                topic: levelVocab?.topic || phraseData?.topic || phraseData?.topics || vocabData?.topic,
                subtopic: levelVocab?.subtopic || phraseData?.subtopic || vocabData?.subtopic,
                isHighFrequency: levelVocab?.isHighFrequency || phraseData?.isHighFrequency,
            });

            if (!phraseData && !vocabData && !levelVocab && userId) {
                lookupPhrase(phrase, context);
            }
        },
        [post.phraseData, post.vocabularyData, post.levels, selectedLevel, userId]
    );

    // Lookup phrase via API
    const lookupPhrase = async (phrase: string, context: string) => {
        try {
            const res = await fetch('/api/user/lookup-phrase', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId || '',
                    'x-user-email': userEmail || '',
                },
                body: JSON.stringify({ phrase, context }),
            });
            if (res.ok) {
                const data = await res.json();
                const result = data.data || data;
                setVocabPopup(prev =>
                    prev?.phrase.toLowerCase() === phrase.toLowerCase()
                        ? {
                            ...prev,
                            meaning: result.meaning,
                            register: result.register,
                            nuance: result.nuance,
                            context: result.context || prev.context,
                            contextTranslation: result.contextTranslation,
                            pronunciation: result.pronunciation,
                            topic: result.topic,
                            subtopic: result.subtopic,
                            isHighFrequency: result.isHighFrequency,
                        }
                        : prev
                );
            }
        } catch (e) {
            console.error('Lookup failed:', e);
        }
    };

    // Handle save phrase wrapper
    const handleSavePhrase = async () => {
        if (!vocabPopup || !userId || !userEmail) {
            import('sonner').then(({ toast }) => toast.error('Please log in to save phrases.'));
            return;
        }

        try {
            const res = await fetch('/api/user/save-phrase', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId,
                    'x-user-email': userEmail,
                },
                body: JSON.stringify({
                    phrase: vocabPopup.phrase,
                    meaning: vocabPopup.meaning,
                    context: vocabPopup.context || '',
                    register: vocabPopup.register || 'consultative',
                    nuance: vocabPopup.nuance,
                    topics: vocabPopup.topic ? (Array.isArray(vocabPopup.topic) ? vocabPopup.topic : [vocabPopup.topic]) : [],
                    subtopics: vocabPopup.subtopic ? (Array.isArray(vocabPopup.subtopic) ? vocabPopup.subtopic : [vocabPopup.subtopic]) : [],
                }),
            });

            const data = await res.json();

            if (res.ok) {
                setSavedPhrases(prev => new Set(prev).add(vocabPopup.phrase.toLowerCase()));
                import('sonner').then(({ toast }) => toast.success(`Saved "${vocabPopup.phrase}"!`, {
                    action: {
                        label: 'View in Bank',
                        onClick: () => router.push('/vocab')
                    }
                }));
            } else {
                import('sonner').then(({ toast }) => toast.error(data.error || 'Failed to save phrase'));
            }
        } catch (e) {
            console.error('Save failed:', e);
            import('sonner').then(({ toast }) => toast.error('Network error. Failed to save.'));
        }
    };

    // Admin: Extract phrases
    const [isExtractingPhrases, setIsExtractingPhrases] = useState(false);

    const handleExtractPhrases = useCallback(async () => {
        if (isExtractingPhrases || !userEmail) return;
        setIsExtractingPhrases(true);

        try {
            const { account } = await import('@/lib/appwrite/client');
            let token = null;
            try {
                const jwtRes = await account.createJWT();
                token = jwtRes.jwt;
            } catch(e) {}

            const extractRes = await fetch('/api/admin/extract-phrases', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userEmail,
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    content: currentContent,
                    title: post.title,
                }),
            });

            if (!extractRes.ok) throw new Error('Extract failed');

            const { phrases } = await extractRes.json();

            if (phrases && phrases.length > 0) {
                await updatePost(post.id as string, { highlightedPhrases: phrases });
                setExtractedPhrases(phrases);
            }
        } catch (e) {
            console.error('Extract phrases failed:', e);
        } finally {
            setIsExtractingPhrases(false);
        }
    }, [isExtractingPhrases, userEmail, post, currentContent]);

    // Dock configuration — mode toggle always available
    const totalComments = comments.length + redditComments.length;
    const dockGroups: ArticleDockGroup[] = [
        {
            actions: [
                {
                    id: 'back',
                    icon: <ArrowLeft className="w-5 h-5" />,
                    label: showNavDock ? 'Back to Article' : 'Navigation',
                    onClick: () => setShowNavDock(prev => !prev),
                },
            ],
        },
        {
            actions: [
                {
                    id: 'listen',
                    icon: isGeneratingAudio
                        ? <Loader2 className="w-5 h-5 animate-spin" />
                        : <Volume2 className="w-5 h-5" />,
                    label: isGeneratingAudio ? 'Generating...' : isPlaying ? 'Pause' : 'Listen',
                    onClick: handleListenClick,
                    isActive: isPlaying,
                },
            ],
        },
        {
            actions: [
                {
                    id: 'bookmark',
                    icon: <Bookmark className={`w-5 h-5 ${bookmarked ? 'fill-current' : ''}`} />,
                    label: bookmarked ? 'Saved' : 'Bookmark',
                    onClick: onBookmark,
                    isActive: bookmarked,
                    disabled: bookmarking,
                },
            ],
        },
        {
            actions: [
                {
                    id: 'mode-toggle',
                    icon: <ArrowLeftRight className="w-5 h-5" />,
                    label: mode === 'immersed' ? 'Switch to Swipe' : 'Switch to Immersed',
                    onClick: () => setMode(m => (m === 'immersed' ? 'swipe' : 'immersed')),
                    isActive: mode === 'swipe',
                },
            ],
        },
        // Admin-only: Extract Phrases
        ...(isAdmin ? [{
            actions: [
                {
                    id: 'extract-phrases',
                    icon: isExtractingPhrases
                        ? <Loader2 className="w-5 h-5 animate-spin" />
                        : <Sparkles className="w-5 h-5" />,
                    label: isExtractingPhrases ? 'Extracting...' : 'Extract Phrases',
                    onClick: handleExtractPhrases,
                    isActive: false,
                    disabled: isExtractingPhrases,
                },
            ],
        }] : []),
    ];

    return (
        <div className="min-h-screen">
            {/* Level Switcher (above content) */}
            {availableLevels.length > 1 && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40">
                    <LevelSwitcher
                        selectedLevel={selectedLevel}
                        availableLevels={availableLevels}
                        onLevelChange={setSelectedLevel}
                    />
                </div>
            )}

            {/* Reader */}
            {mode === 'immersed' ? (
                <ImmersedReader
                    title={post.title || 'Untitled'}
                    subtitle={post.subtitle || post.caption}
                    content={currentContent}
                    highlightedPhrases={allPhrases}
                    onPhraseClick={handlePhraseClick}
                    savedPhrasesCount={savedPhrases.size}
                    embeddedQuestions={currentQuestions}
                    answeredQuestions={answeredQuestions}
                    onQuestionAnswer={handleQuestionAnswer}
                    comments={comments}
                    redditComments={redditComments}
                />
            ) : (
                <SwipeReader
                    sections={sections}
                    highlightedPhrases={allPhrases}
                    onPhraseClick={handlePhraseClick}
                    onSectionChange={setCurrentSection}
                    currentSection={currentSection}
                    savedPhrasesCount={savedPhrases.size}
                    userId={userId}
                    embeddedQuestions={currentQuestions}
                    answeredQuestions={answeredQuestions}
                    onQuestionAnswer={handleQuestionAnswer}
                    comments={comments}
                    redditComments={redditComments}
                    author={post.authorUsername}
                    sourceTitle={post.source}
                />
            )}

            {/* Vocab Popup */}
            <AnimatePresence mode="wait">
                {vocabPopup && (
                    <VocabPopupCard
                        key={vocabPopup.phrase}
                        phrase={vocabPopup.phrase}
                        meaning={vocabPopup.meaning}
                        register={vocabPopup.register}
                        nuance={vocabPopup.nuance}
                        context={vocabPopup.context}
                        contextTranslation={vocabPopup.contextTranslation}
                        pronunciation={vocabPopup.pronunciation}
                        topic={vocabPopup.topic}
                        subtopic={vocabPopup.subtopic}
                        isHighFrequency={vocabPopup.isHighFrequency}
                        bounceKey={bounceKey}
                        onSave={handleSavePhrase}
                        onDismiss={() => { vocabPopupPhraseRef.current = null; setVocabPopup(null); }}
                        isSaved={savedPhrases.has(vocabPopup.phrase.toLowerCase())}
                    />
                )}
            </AnimatePresence>

            {/* Dock — toggle between article dock and navigation dock */}
            {showNavDock ? (
                <>
                    <FloatingDock items={navDockItems} />
                    {/* Back to article dock button */}
                    <button
                        onClick={() => setShowNavDock(false)}
                        className="fixed bottom-6 left-6 z-50 w-10 h-10 bg-white/90 backdrop-blur-xl border border-neutral-200 flex items-center justify-center shadow-sm hover:bg-neutral-900 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                </>
            ) : (
                <ArticleDock groups={dockGroups} />
            )}
        </div>
    );
}
