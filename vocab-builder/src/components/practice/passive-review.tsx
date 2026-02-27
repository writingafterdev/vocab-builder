'use client';

import { useState } from 'react';
import { SavedPhrase } from '@/lib/db/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface PassiveReviewProps {
    phrase: SavedPhrase;
    onComplete: (success: boolean) => void;
}

export function PassiveReview({ phrase, onComplete }: PassiveReviewProps) {
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);

    // Generate dummy options for now (in a real app, these would come from the DB or AI)
    // For this prototype, we'll use a simple "Did you know this?" card or a basic multiple choice
    // assuming we have distractors. Since we don't have pre-generated distractors easy to hand,
    // we'll implement a "Reveal & Grade" flashcard style for the Reading phase which is robust.
    // OR we can generate simple distractors if we had them.
    // Let's stick to a robust "Context Completion" or "Meaning Match" if possible.
    // Given the constraints, let's do a "Self-Check" with Context for now, or simple MCQ if data exists.

    // Actually, let's try to simulate an MCQ using the phrase meaning.
    // Since we don't have distractors, let's use a "Recall" interface:
    // Show Context with BLANK -> Reveal -> Self Rate.

    const parts = phrase.context.split(phrase.phrase);
    const hasContext = parts.length > 1;

    return (
        <div className="max-w-xl mx-auto space-y-6">
            <div className="text-center space-y-2">
                <span className="text-xs font-bold tracking-wider text-blue-600 uppercase">
                    Reading / Passive Review
                </span>
                <h2 className="text-2xl font-bold text-slate-900">
                    Complete the context
                </h2>
            </div>

            <Card className="overflow-hidden border-2 border-slate-100 shadow-sm">
                <CardContent className="p-8 space-y-6">
                    {/* Context Sentence with Blank */}
                    <div className="text-lg text-slate-700 leading-relaxed font-serif text-center">
                        {hasContext ? (
                            <>
                                {parts[0]}
                                <span className="inline-block w-24 border-b-2 border-blue-400 mx-1"></span>
                                {parts[1]}
                            </>
                        ) : (
                            <div className="italic text-slate-500">
                                Context missing... what does <strong>{phrase.phrase}</strong> mean?
                            </div>
                        )}
                    </div>

                    {/* Reveal Section */}
                    <AnimatePresence mode="wait">
                        {!isSubmitted ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex justify-center pt-4"
                            >
                                <Button
                                    onClick={() => setIsSubmitted(true)}
                                    size="lg"
                                    className="bg-blue-600 hover:bg-blue-700 text-white min-w-[200px]"
                                >
                                    Reveal Answer
                                </Button>
                            </motion.div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6 bg-blue-50/50 -mx-8 -mb-8 p-8 border-t border-blue-100"
                            >
                                <div className="text-center space-y-2">
                                    <h3 className="text-2xl font-bold text-blue-900">
                                        {phrase.phrase}
                                    </h3>
                                    <p className="text-slate-600">
                                        {phrase.meaning}
                                    </p>
                                </div>

                                <div className="flex gap-3 justify-center pt-4">
                                    <Button
                                        onClick={() => onComplete(false)}
                                        variant="outline"
                                        className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 hover:border-red-300 min-w-[140px]"
                                    >
                                        <XCircle className="w-4 h-4 mr-2" />
                                        Forgot it
                                    </Button>
                                    <Button
                                        onClick={() => onComplete(true)}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200 min-w-[140px]"
                                    >
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        Got it
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>
        </div>
    );
}
