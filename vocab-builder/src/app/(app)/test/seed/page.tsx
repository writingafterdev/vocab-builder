'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, CheckCircle, ArrowRight, Sparkles, BookOpen, Target, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { doc, setDoc, collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const SAMPLE_PHRASES = [
    // Step 3+ phrases (15 for listening session eligibility)
    { phrase: "break the ice", meaning: "To initiate conversation in a social situation", example: "He told a joke to break the ice at the meeting.", register: "casual", learningStep: 3 },
    { phrase: "hit the nail on the head", meaning: "To describe exactly what is causing a situation or problem", example: "You hit the nail on the head when you said the project needed more time.", register: "casual", learningStep: 3 },
    { phrase: "a piece of cake", meaning: "Something very easy to do", example: "The exam was a piece of cake for her.", register: "casual", learningStep: 3 },
    { phrase: "in the long run", meaning: "Over a long period of time; eventually", example: "Investing now will save you money in the long run.", register: "consultative", learningStep: 3 },
    { phrase: "take into account", meaning: "To consider something when making a decision", example: "Please take into account the budget constraints.", register: "formal", learningStep: 3 },
    { phrase: "get the hang of", meaning: "To learn how to do something, especially after practice", example: "Once you get the hang of it, driving becomes second nature.", register: "casual", learningStep: 3 },
    { phrase: "on the same page", meaning: "To have a shared understanding or agreement", example: "Let's make sure we're all on the same page before we proceed.", register: "consultative", learningStep: 3 },
    { phrase: "the bottom line", meaning: "The most important fact or consideration", example: "The bottom line is that we need to increase sales.", register: "consultative", learningStep: 3 },
    { phrase: "call it a day", meaning: "To stop working for the day", example: "We've done enough; let's call it a day.", register: "casual", learningStep: 3 },
    { phrase: "keep in mind", meaning: "To remember or consider something", example: "Keep in mind that the deadline is next Friday.", register: "consultative", learningStep: 3 },
    { phrase: "play it by ear", meaning: "To decide how to deal with a situation as it develops", example: "We don't have a fixed plan, let's play it by ear.", register: "casual", learningStep: 3 },
    { phrase: "cut to the chase", meaning: "To get to the point without wasting time", example: "Can we cut to the chase? What do you need?", register: "casual", learningStep: 3 },
    { phrase: "think outside the box", meaning: "To think creatively or unconventionally", example: "We need to think outside the box to solve this problem.", register: "consultative", learningStep: 3 },
    { phrase: "wrap one's head around", meaning: "To understand something complicated", example: "I'm still trying to wrap my head around this new concept.", register: "casual", learningStep: 3 },
    { phrase: "get the ball rolling", meaning: "To start something", example: "Let's get the ball rolling on this project.", register: "casual", learningStep: 3 },
    // Additional Step 2 phrases (for reading session)
    { phrase: "bite the bullet", meaning: "To endure a painful experience bravely", example: "We just have to bite the bullet and finish the work.", register: "casual", learningStep: 2 },
    { phrase: "once in a blue moon", meaning: "Very rarely", example: "He only visits once in a blue moon.", register: "casual", learningStep: 2 },
    { phrase: "under the weather", meaning: "Feeling slightly ill", example: "I'm feeling a bit under the weather today.", register: "casual", learningStep: 2 },
    { phrase: "cost an arm and a leg", meaning: "To be very expensive", example: "That car cost an arm and a leg.", register: "casual", learningStep: 2 },
    { phrase: "spill the beans", meaning: "To reveal a secret", example: "Don't spill the beans about the surprise party!", register: "casual", learningStep: 2 }
];

const SAMPLE_WEAKNESSES = [
    { id: 'grammar_subject_verb_1', category: 'grammar', specific: 'subject_verb_agreement', severity: 2, examples: ["He don't like coffee"], correction: "He doesn't like coffee", explanation: 'Third person singular requires "doesn\'t"', occurrences: 3, improvementScore: 20 },
    { id: 'register_formality_1', category: 'register', specific: 'formality_mismatch', severity: 2, examples: ['Hey boss, gimme the report'], correction: 'Excuse me, could you please provide the report?', explanation: 'Use formal language in professional settings', occurrences: 2, improvementScore: 30 },
    { id: 'collocation_verb_1', category: 'collocation', specific: 'wrong_verb', severity: 1, examples: ['I made a decision to do homework'], correction: 'I made a decision to complete my homework', explanation: '"Complete homework" sounds more natural here', occurrences: 1, improvementScore: 40 },
    { id: 'pronunciation_vowel_1', category: 'pronunciation', specific: 'vowel_sounds', severity: 3, examples: ['ship vs sheep'], correction: 'Practice distinguishing /ɪ/ and /iː/', explanation: 'Short and long vowel sounds change meaning', occurrences: 5, improvementScore: 10 }
];

export default function SeedPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [seeding, setSeeding] = useState(false);
    const [status, setStatus] = useState<string>('');
    const [results, setResults] = useState<{ phrases: number; weaknesses: number; scenarios: number } | null>(null);

    const handleSeedAll = async () => {
        if (!user || !db) return;
        setSeeding(true);
        setStatus('Starting...');

        try {
            let phrasesCount = 0;
            let weaknessesCount = 0;
            let scenariosCount = 0;

            // 1. Seed phrases
            setStatus('Seeding phrases...');
            const phrasesRef = collection(db!, 'savedPhrases');
            for (const phraseData of SAMPLE_PHRASES) {
                await addDoc(phrasesRef, {
                    userId: user.uid,
                    phrase: phraseData.phrase,
                    baseForm: phraseData.phrase,
                    meaning: phraseData.meaning,
                    example: phraseData.example,
                    register: phraseData.register,
                    nuance: 'neutral',
                    topic: 'general',
                    subtopic: 'common',
                    type: 'idiom',
                    learningStep: phraseData.learningStep,
                    masteryLevel: phraseData.learningStep,
                    reviewCount: phraseData.learningStep,
                    correctCount: phraseData.learningStep,
                    lastReviewed: Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
                    nextReviewDate: Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000), // Yesterday = DUE NOW
                    createdAt: Timestamp.now(),
                    passiveExposure: { readingSessionCount: 0, listeningSessionCount: 0, liveSessionCount: 0 }
                });
                phrasesCount++;
            }

            // 2. Seed weaknesses for Daily Drill
            setStatus('Seeding weaknesses for Daily Drill...');
            const weaknessRef = doc(db!, 'userWeaknesses', user.uid);
            const weaknesses = SAMPLE_WEAKNESSES.map(w => ({
                ...w,
                lastSeen: Timestamp.now(),
                lastPracticed: null
            }));
            await setDoc(weaknessRef, {
                userId: user.uid,
                weaknesses,
                lastUpdated: Timestamp.now()
            });
            weaknessesCount = weaknesses.length;

            // 3. Seed userMilestones for Turn-Based eligibility (needs 3 open-ended sessions completed)
            setStatus('Setting up milestones...');
            const milestonesRef = doc(db!, 'userMilestones', user.uid);
            await setDoc(milestonesRef, {
                userId: user.uid,
                openEndedSinceLastChat: 3, // Unlock turn-based immediately
                lastUpdated: Timestamp.now()
            }, { merge: true });

            // 4. Seed scenarios (existing API)
            setStatus('Seeding scenarios...');
            const res = await fetch('/api/test/seed-scenario', {
                method: 'POST',
                headers: { 'x-user-id': user.uid }
            });
            if (res.ok) {
                scenariosCount = 1;
            }

            setResults({ phrases: phrasesCount, weaknesses: weaknessesCount, scenarios: scenariosCount });
            setStatus('✅ Done!');
            toast.success('All test data seeded!');

        } catch (e) {
            console.error(e);
            setStatus(`❌ Error: ${e instanceof Error ? e.message : 'Unknown'}`);
            toast.error('Failed to seed data');
        } finally {
            setSeeding(false);
        }
    };

    if (authLoading) return <div className="p-8 text-center">Loading...</div>;
    if (!user) return <div className="p-8 text-center">Please log in to use test tools.</div>;

    return (
        <div className="container mx-auto max-w-xl py-12 px-4">
            <Card className="p-8 space-y-6 border-blue-100 shadow-xl">
                <div className="space-y-2 text-center">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center justify-center gap-2">
                        <Sparkles className="w-6 h-6 text-yellow-500" />
                        Test Data Seeder
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        Seed sample data to test all exercise features
                    </p>
                </div>

                <div className="grid gap-3 text-sm">
                    <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <BookOpen className="w-5 h-5 text-blue-600" />
                        <span><strong>10 phrases</strong> → Reading & Listening Sessions</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                        <Target className="w-5 h-5 text-purple-600" />
                        <span><strong>4 weaknesses</strong> → Daily Drill</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <MessageCircle className="w-5 h-5 text-green-600" />
                        <span><strong>1 scenario</strong> → Open-Ended & Turn-Based</span>
                    </div>
                </div>

                {!results ? (
                    <Button
                        onClick={handleSeedAll}
                        disabled={seeding}
                        className="w-full h-12 text-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    >
                        {seeding ? (
                            <><Loader2 className="w-5 h-5 animate-spin mr-2" /> {status}</>
                        ) : (
                            "🌱 Seed All Test Data"
                        )}
                    </Button>
                ) : (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex flex-col items-center py-4 text-green-600">
                            <CheckCircle className="w-12 h-12 mb-2" />
                            <p className="font-bold">Ready to Test!</p>
                            <p className="text-sm text-slate-500 mt-1">
                                {results.phrases} phrases, {results.weaknesses} weaknesses, {results.scenarios} scenario
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <Button onClick={() => router.push('/vocab')} variant="outline" className="w-full">
                                <BookOpen className="w-4 h-4 mr-2" /> View Phrases
                            </Button>
                            <Button onClick={() => router.push('/practice/daily-drill')} variant="outline" className="w-full">
                                <Target className="w-4 h-4 mr-2" /> Daily Drill
                            </Button>
                            <Button onClick={() => router.push('/practice')} className="w-full">
                                Practice Hub <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </div>
                )}

                <p className="text-xs text-center text-slate-400">
                    User: {user.email} ({user.uid.slice(0, 8)}...)
                </p>
            </Card>
        </div>
    );
}
