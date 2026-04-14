'use client';

import { useState } from 'react';
import McqInteraction from '@/components/exercise/interactions/McqInteraction';
import ReorderInteraction from '@/components/exercise/interactions/ReorderInteraction';
import HighlightInteraction from '@/components/exercise/interactions/HighlightInteraction';
import RatingInteraction from '@/components/exercise/interactions/RatingInteraction';
import FreeWriteInteraction from '@/components/exercise/interactions/FreeWriteInteraction';
import ABPickInteraction from '@/components/exercise/interactions/ABPickInteraction';

export default function UITestPage() {
    const handleAnswer = (val: any) => console.log('Answer:', val);

    return (
        <div className="min-h-screen bg-neutral-50 px-4 py-12 pb-32">
            <div className="max-w-2xl mx-auto space-y-12">
                <h1 className="text-3xl font-bold font-serif mb-8 text-neutral-900 border-b pb-4">
                    Question Type Sandbox
                </h1>

                {/* MCQ */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-4 bg-white p-2 rounded inline-block border">1. MCQ (inference_bridge, fallacy_id, etc)</h2>
                    <div className="bg-white p-6 shadow-sm border border-neutral-100">
                        <McqInteraction
                            question={{
                                id: 'q1',
                                type: 'inference_bridge',
                                prompt: 'Based on the author\'s tone, what can we infer they believe about social media?',
                                options: [
                                    'It is completely harmless',
                                    'It should be regulated or deleted',
                                    'It represents the peak of human connection',
                                    'It is only useful for business'
                                ],
                                correctIndex: 1,
                            }}
                            onAnswer={handleAnswer}
                        />
                    </div>
                </section>

                {/* Highlight / Spot Intruder */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-4 bg-white p-2 rounded inline-block border">2. Highlight (spot_intruder)</h2>
                    <div className="bg-white p-6 shadow-sm border border-neutral-100">
                        <HighlightInteraction
                            question={{
                                id: 'q2',
                                type: 'spot_intruder',
                                prompt: 'Which sentence breaks the flow of the paragraph?',
                                options: [
                                    'The pragmatic move? Regulate it hard or yeet it from app stores.',
                                    'Companies like Meta already do this with age gates.',
                                    'Apples are generally healthy if you eat them every day.',
                                    'TikTok\'s algorithm is predatory AF.'
                                ],
                                correctIndex: 2,
                            }}
                            onAnswer={handleAnswer}
                        />
                    </div>
                </section>

                {/* Reorder */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-4 bg-white p-2 rounded inline-block border">3. Reorder (restructure, register_sort)</h2>
                    <div className="bg-white p-6 shadow-sm border border-neutral-100">
                        <ReorderInteraction
                            question={{
                                id: 'q3',
                                type: 'restructure',
                                prompt: 'Put these sentences in logical order to form a coherent argument.',
                                items: [
                                    'Therefore, we must enact stronger regulations.',
                                    'Many teens spend hours scrolling every day.',
                                    'This constant scrolling leads to decreased attention spans.',
                                    'Social media apps are designed to be addictive.'
                                ],
                                correctOrder: [3, 1, 2, 0],
                            }}
                            onAnswer={handleAnswer}
                        />
                    </div>
                </section>

                {/* A/B Pick */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-4 bg-white p-2 rounded inline-block border">4. A/B Pick (ab_natural)</h2>
                    <div className="bg-white p-6 shadow-sm border border-neutral-100">
                        <ABPickInteraction
                            question={{
                                id: 'q4',
                                type: 'ab_natural',
                                prompt: 'Which version sounds more natural for a casual Reddit post?',
                                options: [
                                    'I am highly experiencing cognitive dissonance over this matter.',
                                    'I\'m having serious cognitive dissonance right now.'
                                ],
                                correctIndex: 1,
                            }}
                            onAnswer={handleAnswer}
                        />
                    </div>
                </section>

                {/* Rating */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-4 bg-white p-2 rounded inline-block border">5. Rating (rate_argument)</h2>
                    <div className="bg-white p-6 shadow-sm border border-neutral-100">
                        <RatingInteraction
                            question={{
                                id: 'q5',
                                type: 'rate_argument',
                                prompt: '"Because I drank water and then got sick, the water made me sick." How strong is this argument?',
                            }}
                            onAnswer={handleAnswer}
                        />
                    </div>
                </section>

                {/* Free Write / Active */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-4 bg-white p-2 rounded inline-block border">6. Free Write (fix_argument, synthesis_response, etc)</h2>
                    <div className="bg-white p-6 shadow-sm border border-neutral-100">
                        <FreeWriteInteraction
                            question={{
                                id: 'q6',
                                type: 'fix_argument',
                                prompt: 'Rewrite the flawed argument from paragraph 3 to make it logically sound.',
                                passageReference: 'He argued that since teens use phones and are also depressed, phones directly inject depression juices into the brain.',
                            }}
                            onAnswer={handleAnswer}
                        />
                    </div>
                </section>
            </div>
        </div>
    );
}
