'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
    House,
    BookOpen,
    Bookmark,
    User,
    Gear,
    SignOut,
    Crown,
    Sparkle,
    List,
    X,
    Shield,
    PencilSimple,
    ArrowUpRight,
    SquaresFour
} from '@phosphor-icons/react';

const ADMIN_EMAIL = 'ducanhcontactonfb@gmail.com';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FloatingDock, DockItem } from '@/components/ui/floating-dock';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { DictionaryWidget } from '@/components/vocab/DictionaryWidget';
import { useDictionaryStore } from '@/stores/dictionary-store';

export default function AppLayout({ children }: { children: ReactNode }) {
    const { user, profile, loading, signOut } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    useOnlineStatus(); // Show toast on offline/online

    // Hydrate global dictionary store with user credentials
    const setDictionaryUser = useDictionaryStore(s => s.setUser);
    useEffect(() => {
        if (user?.$id && user?.email) {
            setDictionaryUser(user.$id, user.email);
        }
    }, [user?.$id, user?.email, setDictionaryUser]);

    // Check if practice has uncompleted exercises today
    const [hasPendingPractice, setHasPendingPractice] = useState(false);
    useEffect(() => {
        try {
            const stored = localStorage.getItem('daily_progress_v3');
            if (stored) {
                const parsed = JSON.parse(stored);
                const today = new Date().toISOString().split('T')[0];
                if (parsed.date === today) {
                    const allDone = parsed.quickPracticeCompleted;
                    setHasPendingPractice(!allDone);
                } else {
                    setHasPendingPractice(true); // No progress today = pending
                }
            } else {
                setHasPendingPractice(true); // Never practiced = pending
            }
        } catch { setHasPendingPractice(true); }
    }, [pathname]);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/');
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <EditorialLoader size="md" />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    const handleSignOut = async () => {
        await signOut();
        router.push('/');
    };

    const isAdmin = user?.email === ADMIN_EMAIL;

    const isActive = (href: string) => {
        if (href.startsWith('/profile')) {
            return pathname.startsWith('/profile');
        }
        return pathname === href || pathname.startsWith(href + '/');
    };

    // Dock items for the floating dock
    const dockItems: DockItem[] = [
        {
            href: '/dashboard',
            icon: <SquaresFour className="w-5 h-5" weight={isActive('/dashboard') ? 'fill' : 'regular'} />,
            label: 'Dashboard',
            isActive: isActive('/dashboard')
        },
        {
            href: '/feed',
            icon: <BookOpen className="w-5 h-5" weight={isActive('/feed') ? 'fill' : 'regular'} />,
            label: 'Library',
            isActive: isActive('/feed')
        },
        {
            href: '/practice',
            icon: <PencilSimple className="w-5 h-5" weight={isActive('/practice') ? 'fill' : 'regular'} />,
            label: 'Practice',
            isActive: isActive('/practice'),
            showBadge: hasPendingPractice && !isActive('/practice')
        },
        {
            href: '/vocab',
            icon: <Bookmark className="w-5 h-5" weight={isActive('/vocab') ? 'fill' : 'regular'} />,
            label: 'Vocab Bank',
            isActive: isActive('/vocab')
        },
        {
            href: `/profile/${profile?.username || 'me'}`,
            icon: <User className="w-5 h-5" weight={isActive('/profile') ? 'fill' : 'regular'} />,
            label: 'Menu',
            isActive: sidebarOpen,
            onClick: () => setSidebarOpen(true),
        },
        {
            href: '/settings',
            icon: <Gear className="w-5 h-5" weight={isActive('/settings') ? 'fill' : 'regular'} />,
            label: 'Settings',
            isActive: isActive('/settings')
        },
        ...(isAdmin ? [{
            href: '/admin',
            icon: <Shield className="w-5 h-5" weight={isActive('/admin') ? 'fill' : 'regular'} />,
            label: 'Admin',
            isActive: isActive('/admin')
        }] : []),
    ];

    // Check if we're in scenario mode (hide main navigation)
    const isScenarioMode = pathname.includes('/practice/scenario/') && pathname.split('/').length >= 4;

    // Check if we're on an article page (uses its own ArticleDock)
    const isArticlePage = pathname.startsWith('/post/');

    // Check if we're in an active session (hide dock, bypass padding)
    const isSessionPage = pathname.startsWith('/practice/session/');

    // For scenario mode, render without the main navigation
    if (isScenarioMode) {
        return (
            <div className="min-h-screen bg-white">
                {children}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            {/* Global Dictionary Widget — available on all pages */}
            <DictionaryWidget />

            {/* Floating Dock - Bottom Navigation (hidden during sessions and article pages) */}
            {!isArticlePage && !isSessionPage && <FloatingDock items={dockItems} />}

            {/* Main Content - Full width now */}
            <main className={`${isSessionPage ? '' : 'min-h-screen'} ${isSessionPage ? '' : 'pb-24'}`}>
                {pathname.startsWith('/vocab') || pathname.startsWith('/post') || isSessionPage ? (
                    children
                ) : pathname.startsWith('/practice') ? (
                    children
                ) : (
                    <div className="py-8 px-4 lg:px-8 max-w-7xl mx-auto">
                        {children}
                    </div>
                )}
            </main>

            {/* Mobile slide-out menu for user actions */}
            <AnimatePresence>
                {sidebarOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black"
                            onClick={() => setSidebarOpen(false)}
                        />
                        <motion.aside
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 20 }}
                            className="fixed right-0 top-0 bottom-0 z-50 w-72 bg-white flex flex-col font-sans"
                        >
                            {/* Close Bar */}
                            <div className="flex justify-end p-4">
                                <button
                                    onClick={() => setSidebarOpen(false)}
                                    className="p-2 -mr-2 text-neutral-300 hover:text-neutral-900 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="px-8 flex-1 flex flex-col">
                                {/* User Info (Editorial Header) */}
                                <div className="mb-12 flex flex-col gap-4">
                                    <Avatar className="h-16 w-16 border border-neutral-100 shadow-sm">
                                        <AvatarImage src={profile?.photoURL} alt={profile?.displayName} />
                                        <AvatarFallback className="bg-neutral-50 text-neutral-400 text-lg font-serif italic">{profile?.displayName?.charAt(0) || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <h2 
                                            className="text-[26px] text-neutral-900 tracking-tight italic leading-none" 
                                            style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                        >
                                            {profile?.displayName}
                                        </h2>
                                        <p className="text-[10px] text-neutral-400 uppercase tracking-[0.15em] mt-2 font-medium">@{profile?.username}</p>
                                    </div>
                                </div>

                                {/* Navigation Links */}
                                <div className="flex flex-col gap-5 border-t border-neutral-100 pt-8">
                                    <Link
                                        href={`/profile/${profile?.username || 'me'}`}
                                        onClick={() => setSidebarOpen(false)}
                                        className="text-[14px] text-neutral-500 hover:text-neutral-900 transition-colors tracking-wide"
                                    >
                                        View Profile
                                    </Link>
                                    
                                    <Link
                                        href="/settings"
                                        onClick={() => setSidebarOpen(false)}
                                        className="text-[14px] text-neutral-500 hover:text-neutral-900 transition-colors tracking-wide"
                                    >
                                        Settings
                                    </Link>

                                    {/* Quiet Premium CTA */}
                                    {profile?.subscription?.status === 'trial' && (
                                        <Link 
                                            href="/subscription" 
                                            onClick={() => setSidebarOpen(false)}
                                            className="text-[14px] text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-1.5 group tracking-wide mt-2"
                                        >
                                            <Sparkle className="w-4 h-4 text-neutral-300 group-hover:text-amber-500 transition-colors" weight="fill" />
                                            Upgrade Premium
                                        </Link>
                                    )}
                                </div>

                                {/* Bottom Anchor */}
                                <div className="mt-auto pb-10">
                                    <button
                                        onClick={() => {
                                            handleSignOut();
                                            setSidebarOpen(false);
                                        }}
                                        className="flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] font-semibold text-neutral-400 hover:text-neutral-900 transition-colors"
                                    >
                                        <SignOut className="h-3.5 w-3.5" weight="bold" />
                                        Log Out
                                    </button>
                                </div>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
