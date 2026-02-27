'use client';

import { useState } from 'react';
import { X, ArrowRight, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Import all question components
import CompleteDialogueQuestion from '@/components/practice/questions/complete-dialogue';
import WhatWouldYouSayQuestion from '@/components/practice/questions/what-would-you-say';
import ChooseSituationQuestion from '@/components/practice/questions/choose-situation';
import SpotMistakeQuestion from '@/components/practice/questions/spot-mistake';
import FreeResponseQuestion from '@/components/practice/questions/free-response';
import RegisterSwapQuestion from '@/components/practice/questions/register-swap';
import ToneInterpretationQuestion from '@/components/practice/questions/tone-interpretation';
import ContrastExposureQuestion from '@/components/practice/questions/contrast-exposure';
import RegisterSortingQuestion from '@/components/practice/questions/register-sorting';
import MultipleResponseQuestion from '@/components/practice/questions/multiple-response';
import ExplainToFriendQuestion from '@/components/practice/questions/explain-to-friend';
import StoryIntroQuestion from '@/components/practice/questions/story-intro';
import StoryRecallQuestion from '@/components/practice/questions/story-recall';
import CompleteTheStoryQuestion from '@/components/practice/questions/complete-the-story';
import ListenSelectQuestion from '@/components/practice/questions/listen-select';
import TypeWhatYouHearQuestion from '@/components/practice/questions/type-what-you-hear';
import ReadingComprehensionQuestion from '@/components/practice/questions/reading-comprehension';
import SentenceCorrectionQuestion from '@/components/practice/questions/sentence-correction';
import TextCompletionQuestion from '@/components/practice/questions/text-completion';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import type { ExerciseStoryContext } from '@/lib/db/types';

const ctx: ExerciseStoryContext = {
    title: 'Preview',
    setting: 'Preview',
    characters: [],
    narrative: '',
    paragraphs: [],
    segments: [],
};

const noop = (answer: string, correct: boolean, timeTaken: number) => {
    console.log(`Answer: "${answer}", Correct: ${correct}, Time: ${timeTaken}s`);
};

const QUESTION_PREVIEWS = [
    {
        id: 'complete_dialogue',
        label: 'Complete Dialogue',
        render: (key: number) => (
            <CompleteDialogueQuestion
                key={key}
                question={{
                    content: {
                        type: 'fill_gap_mcq' as any,
                        dialogue: [
                            { speaker: 'Executive', text: 'The board is insisting on an aggressive timeline for the merger, despite the incomplete audit.', isBlank: false },
                            { speaker: 'Advisor', text: 'That is concerning. Proceeding without full transparency could result in us _____', isBlank: true },
                        ],
                        options: [
                            'missing the deadline entirely',
                            'incurring significant regulatory penalties',
                            'losing our competitive advantage',
                            'disappointing the stakeholders',
                        ],
                        correctIndex: 1,
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'what_would_you_say',
        label: 'What Would You Say',
        render: (key: number) => (
            <WhatWouldYouSayQuestion
                key={key}
                question={{
                    content: {
                        type: 'pragmatic_judgment' as any,
                        context: 'Your colleague just received critical feedback on their presentation from a senior director. They look visibly upset in the hallway.',
                        prompt: 'What would you say?',
                        options: [
                            'Don\'t worry about it, presentations aren\'t that important.',
                            'I noticed you handled the Q&A section really well. Would you like to go over the feedback together?',
                            'The director is always tough on everyone.',
                            'You should probably redo the whole thing.',
                        ],
                        correctIndex: 1,
                    } as any,
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'choose_situation',
        label: 'Choose Situation',
        render: (key: number) => (
            <ChooseSituationQuestion
                key={key}
                question={{
                    content: {
                        type: 'contextual_fit' as any,
                        phrase: 'I appreciate you bringing this to my attention',
                        prompt: 'When would you use this phrase?',
                        question: 'When would you use this phrase?',
                        options: [
                            'Ordering food at a restaurant',
                            'Responding to a colleague reporting a workplace issue',
                            'Greeting a friend casually',
                            'Asking for directions on the street',
                        ],
                        correctIndex: 1,
                    } as any,
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'spot_mistake',
        label: 'Spot Mistake',
        render: (key: number) => (
            <SpotMistakeQuestion
                key={key}
                question={{
                    content: {
                        type: 'error_correction' as any,
                        sentence: 'She told me that she can finished the report by tomorrow morning.',
                        wrongWord: 'can finished',
                        options: ['can finish', 'could finish', 'will finish'],
                        correctIndex: 0,
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'free_response',
        label: 'Free Response',
        render: (key: number) => (
            <FreeResponseQuestion
                key={key}
                question={{
                    content: {
                        type: 'constrained_production' as any,
                        context: 'A client emails you asking to reschedule a meeting that was set for tomorrow. They seem apologetic about the last-minute change.',
                        prompt: 'Write a professional yet warm reply accepting the reschedule.',
                        targetPhrase: 'at your earliest convenience',
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'register_swap',
        label: 'Register Swap',
        render: (key: number) => (
            <RegisterSwapQuestion
                key={key}
                question={{
                    content: {
                        type: 'transformation_exercise' as any,
                        originalText: 'Hey, can you get that report done ASAP? The boss is on my case about it.',
                        currentRegister: 'informal' as any,
                        targetRegister: 'formal' as any,
                        options: [
                            'Could you please prioritize the completion of the report? Management has expressed urgency.',
                            'Yo, hurry up with that report already!',
                            'The report. Now. Please.',
                            'I was wondering if maybe you could look at the report sometime?',
                        ],
                        correctIndex: 0,
                    } as any,
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'tone_interpretation',
        label: 'Tone Interpretation',
        render: (key: number) => (
            <ToneInterpretationQuestion
                key={key}
                question={{
                    content: {
                        phrase: 'Well, that\'s certainly one way to approach it.',
                        context: 'Said by a team lead after reviewing a junior developer\'s unconventional solution.',
                        options: ['Enthusiastic', 'Skeptical', 'Angry', 'Relieved'],
                        correctIndex: 1,
                        explanation: 'The phrase "certainly one way" is a polite but veiled expression of doubt.',
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'contrast_exposure',
        label: 'Contrast Exposure',
        render: (key: number) => (
            <ContrastExposureQuestion
                key={key}
                question={{
                    content: {
                        phraseA: 'Could you look into this?',
                        phraseB: 'I need you to handle this immediately.',
                        meaningA: 'Polite request, low urgency',
                        meaningB: 'Direct instruction, high urgency',
                        options: [
                            'Both are equally formal',
                            'A is a request; B is a directive with urgency',
                            'B is more polite than A',
                            'They mean exactly the same thing',
                        ],
                        correctIndex: 1,
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'register_sorting',
        label: 'Register Sorting',
        render: (key: number) => (
            <RegisterSortingQuestion
                key={key}
                question={{
                    content: {
                        phrases: [
                            'We need to discuss this further.',
                            'Can we chat about this real quick?',
                            'I would appreciate it if we could schedule a formal review.',
                        ],
                        correctOrder: [1, 0, 2],
                        registers: ['Casual', 'Neutral', 'Formal'],
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'multiple_response',
        label: 'Multiple Response',
        render: (key: number) => (
            <MultipleResponseQuestion
                key={key}
                question={{
                    content: {
                        scenario: 'You\'re introducing yourself at a professional networking event. Use the target phrase in two different ways.',
                        targetPhrases: ['pleasure to meet you'],
                        minResponses: 2,
                        hints: ['Try a formal introduction', 'Try a warm, approachable version'],
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'explain_to_friend',
        label: 'Explain to Friend',
        render: (key: number) => (
            <ExplainToFriendQuestion
                key={key}
                question={{
                    content: {
                        phrase: 'to touch base',
                        meaning: 'To briefly connect or follow up with someone',
                        register: 'Business casual',
                        goodExampleContext: 'Let me touch base with the team before we finalize the plan.',
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'story_intro',
        label: 'Story Intro',
        render: (key: number) => (
            <StoryIntroQuestion
                key={key}
                question={{
                    content: {
                        type: 'story_intro' as any,
                        title: 'The Client Meeting',
                        setting: 'Conference Room, Tuesday Morning',
                        narrative: '',
                        segments: [
                            { type: 'narration', text: 'The conference room fills with tension as the quarterly review begins.' },
                            { type: 'dialogue', speaker: 'Sarah', speakerRole: 'Project Lead', text: 'I want to start by acknowledging the challenges we\'ve faced this quarter.' },
                            { type: 'dialogue', speaker: 'James', speakerRole: 'Client', text: 'We appreciate the transparency. The delays have been concerning on our end.' },
                            { type: 'narration', text: 'Sarah takes a deep breath before addressing the elephant in the room.' },
                            { type: 'dialogue', speaker: 'Sarah', speakerRole: 'Project Lead', text: 'I understand your concerns. Let me walk you through our revised timeline.' },
                        ],
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'story_recall',
        label: 'Story Recall',
        render: (key: number) => (
            <StoryRecallQuestion
                key={key}
                question={{
                    content: {
                        type: 'story_recall' as any,
                        question: 'What did Sarah do to address the client\'s concerns?',
                        relatedParagraph: 'Sarah takes a deep breath. "I understand your concerns. Let me walk you through our revised timeline."',
                        options: [
                            'She dismissed the concerns entirely',
                            'She acknowledged concerns and presented a revised timeline',
                            'She asked for more time without a plan',
                            'She blamed her team for the delays',
                        ],
                        correctIndex: 1,
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'complete_the_story',
        label: 'Complete Story',
        render: (key: number) => (
            <CompleteTheStoryQuestion
                key={key}
                question={{
                    content: {
                        type: 'narrative_cloze' as any,
                        storyExcerpt: 'After reviewing the proposal, the committee decided to _____ until they had more data.',
                        blankPosition: 0,
                        options: [
                            'table the discussion',
                            'celebrate immediately',
                            'ignore the issue',
                            'fire the team',
                        ],
                        correctIndex: 0,
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'listen_select',
        label: 'Listen & Select',
        render: (key: number) => (
            <ListenSelectQuestion
                key={key}
                question={{
                    content: {
                        type: 'listening_comprehension' as any,
                        audioText: 'I would appreciate your prompt attention to this matter.',
                        question: 'What did you hear?',
                        options: [
                            'I want you to hurry up',
                            'I would appreciate your prompt attention to this matter',
                            'Please ignore this email',
                            'Take your time with the response',
                        ],
                        correctIndex: 1,
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'type_what_you_hear',
        label: 'Type What You Hear',
        render: (key: number) => (
            <TypeWhatYouHearQuestion
                key={key}
                question={{
                    content: {
                        type: 'dictation' as any,
                        audioText: 'Please let me know at your earliest convenience.',
                        acceptableAnswers: [
                            'Please let me know at your earliest convenience',
                            'Please let me know at your earliest convenience.',
                        ],
                        hint: 'A polite business phrase',
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'reading_comprehension',
        label: 'Reading Comprehension',
        render: (key: number) => (
            <ReadingComprehensionQuestion
                key={key}
                question={{
                    content: {
                        type: 'reading_comprehension' as any,
                        passage: 'When the startup\'s Series A fell through, the founding team had to pivot quickly. Rather than laying off half the staff, the CEO decided to bite the bullet and take a significant pay cut herself. "We\'re all in this together," she told the team. The move paid off\u2014within six months, they secured new funding and morale had never been higher.',
                        targetPhrase: 'bite the bullet',
                        question: 'What does "bite the bullet" suggest about the CEO\'s decision?',
                        options: [
                            'She made a difficult but necessary sacrifice',
                            'She literally bit something during the meeting',
                            'She made the decision impulsively without thinking',
                            'She delegated the hard decision to someone else',
                        ],
                        correctIndex: 0,
                        explanation: 'In this context, "bite the bullet" means accepting a painful or difficult situation with courage\u2014here, taking a personal financial hit to save the team.',
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'sentence_correction',
        label: 'Sentence Correction',
        render: (key: number) => (
            <SentenceCorrectionQuestion
                key={key}
                question={{
                    content: {
                        type: 'sentence_correction' as any,
                        sentence: 'During the board presentation, the CFO mentioned that their new pricing model was dirt cheap compared to competitors.',
                        underlinedPortion: 'dirt cheap',
                        options: [
                            'significantly more affordable',
                            'super cheap',
                            'cheap as dirt',
                            'No change needed',
                        ],
                        correctIndex: 0,
                        explanation: '"Dirt cheap" is too informal for a board presentation. "Significantly more affordable" maintains the meaning while matching the formal register of the setting.',
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'text_completion',
        label: 'Text Completion',
        render: (key: number) => (
            <TextCompletionQuestion
                key={key}
                question={{
                    content: {
                        type: 'text_completion' as any,
                        paragraph: 'When Maya arrived at the startup\'s first team dinner, nobody was talking. She decided to [BLANK_1] by sharing a funny story about her commute. By the end of the evening, the conversation was flowing so naturally that their manager said the team had really [BLANK_2].',
                        blanks: [
                            { id: 'BLANK_1', correctAnswer: 'break the ice' },
                            { id: 'BLANK_2', correctAnswer: 'hit it off' },
                        ],
                        wordBank: ['break the ice', 'hit it off', 'cut corners', 'pull strings', 'go the extra mile'],
                        explanation: '"Break the ice" means to initiate conversation in an awkward situation. "Hit it off" means to quickly develop a good rapport with someone.',
                    },
                }}
                storyContext={ctx}
                onAnswer={noop}
            />
        ),
    },
    {
        id: 'editorial_loader',
        label: '⟡ Loading Animation',
        render: () => (
            <div className="h-full flex flex-col items-center justify-center gap-16 py-16">
                <div className="text-center">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium mb-6">Small</p>
                    <EditorialLoader size="sm" label="Checking authorization" />
                </div>
                <div className="text-center">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium mb-6">Medium</p>
                    <EditorialLoader size="md" label="Loading" />
                </div>
                <div className="text-center">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium mb-6">Large</p>
                    <EditorialLoader size="lg" label="Generating your exercise" />
                </div>
            </div>
        ),
    },
];

export default function QuestionPreviewPage() {
    const [activeIndex, setActiveIndex] = useState(0);
    const [resetKey, setResetKey] = useState(0);

    const handleTabChange = (index: number) => {
        setActiveIndex(index);
        setResetKey(prev => prev + 1); // reset component state
    };

    return (
        <>
            {/* Tab selector — fixed left sidebar strip */}
            <div className="fixed left-0 top-0 bottom-0 w-48 bg-white border-r border-neutral-200 z-[60] overflow-y-auto py-4">
                <p className="px-4 pb-3 text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-medium">
                    Question Types
                </p>
                {QUESTION_PREVIEWS.map((q, i) => (
                    <button
                        key={q.id}
                        onClick={() => handleTabChange(i)}
                        className={cn(
                            'w-full text-left px-4 py-2 text-xs transition-colors',
                            i === activeIndex
                                ? 'bg-neutral-900 text-white font-medium'
                                : 'text-neutral-500 hover:bg-neutral-50'
                        )}
                    >
                        {q.label}
                    </button>
                ))}
            </div>

            {/* Exercise Shell Replica — exact same layout as real ExerciseShell */}
            <div className="fixed inset-0 bg-white z-50 flex flex-col" style={{ left: '192px' }}>
                {/* Header — identical to ExerciseShell */}
                <header className="px-6 pt-6 pb-4">
                    <div className="max-w-5xl mx-auto flex items-center gap-4">
                        {/* Close button (decorative) */}
                        <button className="p-1 hover:bg-neutral-100 transition-colors">
                            <X className="w-5 h-5 text-neutral-400" />
                        </button>

                        {/* Thin progress line */}
                        <div className="flex-1 h-[2px] bg-neutral-200 relative">
                            <div
                                className="absolute inset-y-0 left-0 bg-neutral-900 transition-all duration-500"
                                style={{ width: '37.5%' }}
                            />
                        </div>

                        {/* Question counter */}
                        <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-medium tabular-nums">
                            3/8
                        </span>
                    </div>
                </header>

                {/* Question Area — identical to ExerciseShell */}
                <main className="flex-1 overflow-y-auto">
                    <div className="h-full max-w-5xl mx-auto w-full px-6">
                        {QUESTION_PREVIEWS[activeIndex].render(resetKey)}
                    </div>
                </main>

                {/* Feedback Bar — identical to ExerciseShell (static preview) */}
                <div className="border-t border-neutral-200 bg-white">
                    <div className="px-6 py-5">
                        <div className="max-w-5xl mx-auto flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <CheckCircle className="w-6 h-6 text-blue-600" />
                                <div>
                                    <p className="font-semibold text-neutral-900">Correct</p>
                                    <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400">Well done</p>
                                </div>
                            </div>
                            <button className="bg-neutral-900 text-white px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] hover:bg-neutral-800 transition-colors flex items-center gap-2">
                                Continue
                                <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
