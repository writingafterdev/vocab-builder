'use client';

/**
 * DrillExercise - Individual drill exercise display
 * Handles different drill types: pronunciation, grammar_fix, register_choice, etc.
 */

import { useState } from 'react';
import { Check, X, Volume2, Mic, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrillExerciseData {
    id: string;
    type: 'pronunciation' | 'grammar_fix' | 'register_choice' | 'nuance_match' | 'collocation_fill';
    weaknessId: string;
    weaknessCategory: string;
    instruction: string;
    prompt: string;
    options?: string[];
    correctAnswer?: string;
    explanation: string;
}

interface DrillExerciseProps {
    drill: DrillExerciseData;
    onComplete: (drillId: string, weaknessId: string, correct: boolean) => void;
}

export function DrillExercise({ drill, onComplete }: DrillExerciseProps) {
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [userAnswer, setUserAnswer] = useState('');

    const isCorrect = selectedOption === drill.correctAnswer ||
        userAnswer.toLowerCase().trim() === drill.correctAnswer?.toLowerCase().trim();

    const handleSubmit = () => {
        setShowResult(true);
    };

    const handleContinue = () => {
        onComplete(drill.id, drill.weaknessId, isCorrect);
    };

    // Render based on drill type
    if (drill.type === 'pronunciation') {
        return (
            <PronunciationDrill
                drill={drill}
                onComplete={() => onComplete(drill.id, drill.weaknessId, true)}
            />
        );
    }

    if (drill.type === 'grammar_fix') {
        return (
            <GrammarFixDrill
                drill={drill}
                userAnswer={userAnswer}
                setUserAnswer={setUserAnswer}
                showResult={showResult}
                isCorrect={isCorrect}
                onSubmit={handleSubmit}
                onContinue={handleContinue}
            />
        );
    }

    // Multiple choice drills (register_choice, nuance_match, collocation_fill)
    return (
        <MultipleChoiceDrill
            drill={drill}
            selectedOption={selectedOption}
            setSelectedOption={setSelectedOption}
            showResult={showResult}
            isCorrect={isCorrect}
            onSubmit={handleSubmit}
            onContinue={handleContinue}
        />
    );
}

// ============================================
// Drill Type Components
// ============================================

function PronunciationDrill({
    drill,
    onComplete
}: {
    drill: DrillExerciseData;
    onComplete: () => void;
}) {
    const [step, setStep] = useState<'listen' | 'record' | 'done'>('listen');

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="text-sm text-slate-500 uppercase tracking-wide">
                Pronunciation Practice
            </div>

            <p className="text-slate-700">{drill.instruction}</p>

            <div className="bg-teal-50 rounded-lg p-4 text-center">
                <p className="text-xl font-medium text-teal-800">{drill.prompt}</p>
            </div>

            <div className="flex justify-center gap-4">
                {step === 'listen' && (
                    <button
                        onClick={() => setStep('record')}
                        className="flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                    >
                        <Volume2 className="w-5 h-5" />
                        Listen First
                    </button>
                )}

                {step === 'record' && (
                    <button
                        onClick={() => setStep('done')}
                        className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
                    >
                        <Mic className="w-5 h-5" />
                        Record Yourself
                    </button>
                )}

                {step === 'done' && (
                    <button
                        onClick={onComplete}
                        className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
                    >
                        Done
                        <ChevronRight className="w-5 h-5" />
                    </button>
                )}
            </div>

            <p className="text-sm text-slate-500 text-center">{drill.explanation}</p>
        </div>
    );
}

function GrammarFixDrill({
    drill,
    userAnswer,
    setUserAnswer,
    showResult,
    isCorrect,
    onSubmit,
    onContinue
}: {
    drill: DrillExerciseData;
    userAnswer: string;
    setUserAnswer: (v: string) => void;
    showResult: boolean;
    isCorrect: boolean;
    onSubmit: () => void;
    onContinue: () => void;
}) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="text-sm text-slate-500 uppercase tracking-wide">
                Grammar Fix
            </div>

            <p className="text-slate-700">{drill.instruction}</p>

            <div className="bg-red-50 rounded-lg p-4">
                <p className="text-lg text-red-800 line-through">{drill.prompt}</p>
            </div>

            {!showResult ? (
                <>
                    <input
                        type="text"
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder="Type the corrected sentence..."
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                        onClick={onSubmit}
                        disabled={!userAnswer.trim()}
                        className="w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors"
                    >
                        Check Answer
                    </button>
                </>
            ) : (
                <>
                    <ResultDisplay isCorrect={isCorrect} correctAnswer={drill.correctAnswer!} />
                    <p className="text-sm text-slate-600">{drill.explanation}</p>
                    <button
                        onClick={onContinue}
                        className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors"
                    >
                        Continue
                    </button>
                </>
            )}
        </div>
    );
}

function MultipleChoiceDrill({
    drill,
    selectedOption,
    setSelectedOption,
    showResult,
    isCorrect,
    onSubmit,
    onContinue
}: {
    drill: DrillExerciseData;
    selectedOption: string | null;
    setSelectedOption: (v: string) => void;
    showResult: boolean;
    isCorrect: boolean;
    onSubmit: () => void;
    onContinue: () => void;
}) {
    const typeLabels = {
        register_choice: 'Register',
        nuance_match: 'Nuance',
        collocation_fill: 'Collocation'
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="text-sm text-slate-500 uppercase tracking-wide">
                {typeLabels[drill.type as keyof typeof typeLabels] || 'Practice'}
            </div>

            <p className="text-slate-700">{drill.instruction}</p>

            <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-lg text-slate-800">{drill.prompt}</p>
            </div>

            <div className="space-y-2">
                {drill.options?.map((option, index) => {
                    const isSelected = selectedOption === option;
                    const isCorrectOption = option === drill.correctAnswer;

                    let optionStyle = 'border-slate-200 hover:border-teal-300';
                    if (showResult) {
                        if (isCorrectOption) {
                            optionStyle = 'border-green-500 bg-green-50';
                        } else if (isSelected && !isCorrectOption) {
                            optionStyle = 'border-red-500 bg-red-50';
                        }
                    } else if (isSelected) {
                        optionStyle = 'border-teal-500 bg-teal-50';
                    }

                    return (
                        <button
                            key={index}
                            onClick={() => !showResult && setSelectedOption(option)}
                            disabled={showResult}
                            className={cn(
                                'w-full p-4 text-left rounded-lg border-2 transition-colors',
                                optionStyle
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <span>{option}</span>
                                {showResult && isCorrectOption && (
                                    <Check className="w-5 h-5 text-green-600" />
                                )}
                                {showResult && isSelected && !isCorrectOption && (
                                    <X className="w-5 h-5 text-red-600" />
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {!showResult ? (
                <button
                    onClick={onSubmit}
                    disabled={!selectedOption}
                    className="w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors"
                >
                    Check Answer
                </button>
            ) : (
                <>
                    <p className="text-sm text-slate-600">{drill.explanation}</p>
                    <button
                        onClick={onContinue}
                        className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors"
                    >
                        Continue
                    </button>
                </>
            )}
        </div>
    );
}

function ResultDisplay({ isCorrect, correctAnswer }: { isCorrect: boolean; correctAnswer: string }) {
    return (
        <div className={cn(
            'p-4 rounded-lg',
            isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        )}>
            <div className="flex items-center gap-2">
                {isCorrect ? (
                    <>
                        <Check className="w-5 h-5 text-green-600" />
                        <span className="font-medium text-green-800">Correct!</span>
                    </>
                ) : (
                    <>
                        <X className="w-5 h-5 text-red-600" />
                        <span className="font-medium text-red-800">Not quite</span>
                    </>
                )}
            </div>
            {!isCorrect && (
                <p className="mt-2 text-sm text-slate-700">
                    Correct answer: <span className="font-medium">{correctAnswer}</span>
                </p>
            )}
        </div>
    );
}
