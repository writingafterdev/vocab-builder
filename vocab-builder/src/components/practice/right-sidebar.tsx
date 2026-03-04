'use client';

import { Flame, Target, BookOpen, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function RightSidebar() {
    return (
        <div className="hidden lg:block w-72 pt-[5.5rem] sticky top-0 h-screen overflow-y-auto pb-8">
            {/* Stats Row */}
            <div className="border border-neutral-200 p-5 mb-0">
                <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-400 font-bold block mb-3">Today&apos;s Progress</span>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-neutral-400" />
                        <span className="text-sm font-semibold text-neutral-900">1</span>
                        <span className="text-[10px] text-neutral-400 uppercase">streak</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-neutral-400" />
                        <span className="text-sm font-semibold text-neutral-900">0</span>
                        <span className="text-[10px] text-neutral-400 uppercase">xp</span>
                    </div>
                </div>
            </div>

            {/* Daily Quests */}
            <div className="border border-t-0 border-neutral-200 p-5">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-400 font-bold">Daily Quests</span>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-stone-100 flex items-center justify-center flex-shrink-0">
                            <Flame className="w-4 h-4 text-stone-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-900">Extend your streak</p>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1 bg-neutral-100">
                                    <div className="h-full bg-stone-800 w-0" />
                                </div>
                                <span className="text-[10px] text-neutral-400 font-medium">0/1</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-amber-50 flex items-center justify-center flex-shrink-0">
                            <Target className="w-4 h-4 text-amber-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-900">Earn 50 XP</p>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1 bg-neutral-100">
                                    <div className="h-full bg-amber-800 w-0" />
                                </div>
                                <span className="text-[10px] text-neutral-400 font-medium">0/50</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Vocab Arcade Launch */}
            <div className="border border-t-0 border-neutral-200 p-5 bg-orange-50/50">
                <span className="text-[10px] uppercase tracking-[0.15em] text-orange-600 font-bold block mb-3">Time Attack</span>
                <div className="flex flex-col gap-3">
                    <p className="text-sm text-neutral-600">Clear due phrases before time runs out.</p>
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('launch-arcade'))}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-md text-sm font-bold shadow-sm transition-colors flex justify-center items-center gap-2"
                    >
                        <Flame className="w-4 h-4" />
                        Enter Arcade
                    </button>
                </div>
            </div>

            {/* Quick Links */}
            <div className="border border-t-0 border-neutral-200 p-5">
                <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-400 font-bold block mb-3">Quick Links</span>
                <div className="space-y-2">
                    <Link href="/vocab" className="flex items-center justify-between text-sm text-neutral-600 hover:text-neutral-900 transition-colors py-1">
                        <span className="flex items-center gap-2">
                            <BookOpen className="w-3.5 h-3.5" />
                            Glossary
                        </span>
                        <ArrowRight className="w-3 h-3" />
                    </Link>
                    <Link href="/feed" className="flex items-center justify-between text-sm text-neutral-600 hover:text-neutral-900 transition-colors py-1">
                        <span className="flex items-center gap-2">
                            <BookOpen className="w-3.5 h-3.5" />
                            Articles
                        </span>
                        <ArrowRight className="w-3 h-3" />
                    </Link>
                </div>
            </div>
        </div>
    );
}
