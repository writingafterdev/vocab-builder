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
import { XpDisplay } from '@/components/xp-display';
import { FloatingDock, DockItem } from '@/components/ui/floating-dock';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import { useOnlineStatus } from '@/hooks/use-online-status';

export default function AppLayout({ children }: { children: ReactNode }) {
    const { user, profile, loading, signOut } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    useOnlineStatus(); // Show toast on offline/online

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

    if (!user || !profile) {
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
            label: 'Profile',
            isActive: isActive('/profile')
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
            {/* Floating Dock - Bottom Navigation (hidden on article pages which use ArticleDock) */}
            {!isArticlePage && <FloatingDock items={dockItems} />}

            {/* Main Content - Full width now */}
            <main className="min-h-screen pb-24">
                {pathname.startsWith('/vocab') || pathname.startsWith('/post') ? (
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
                            className="fixed right-0 top-0 bottom-0 z-50 w-72 bg-white"
                        >
                            <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-100">
                                <span className="font-semibold">Menu</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setSidebarOpen(false)}
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>

                            <div className="p-4">
                                {/* User info */}
                                <div className="flex items-center gap-3 px-2 py-3 mb-4">
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={profile.photoURL} alt={profile.displayName} />
                                        <AvatarFallback className="bg-neutral-200">{profile.displayName?.charAt(0) || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{profile.displayName}</p>
                                        <p className="text-xs text-neutral-500 truncate">@{profile.username}</p>
                                    </div>
                                </div>

                                {/* XP Display */}
                                <div className="mb-4">
                                    <XpDisplay />
                                </div>

                                {/* Upgrade CTA */}
                                {profile.subscription.status === 'trial' && (
                                    <div className="mb-4">
                                        <Link href="/subscription" className="block group">
                                            <div className="flex items-center justify-between p-1.5 pl-4 bg-neutral-900 border border-neutral-800 rounded-xl shadow-[0_2px_12px_-4px_rgba(0,0,0,0.2)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.3)] transition-all duration-300">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-neutral-300">Upgrade to</span>
                                                    <span className="bg-white text-neutral-900 text-[10px] font-bold px-2 py-1 rounded-[6px] leading-none flex items-center tracking-wide shadow-sm">PRO</span>
                                                </div>
                                                <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center group-hover:bg-neutral-700 transition-colors duration-300">
                                                    <ArrowUpRight className="w-4 h-4 text-white" />
                                                </div>
                                            </div>
                                        </Link>
                                    </div>
                                )}

                                {/* Logout */}
                                <Button
                                    variant="ghost"
                                    className="w-full justify-start gap-2 text-neutral-600"
                                    onClick={() => {
                                        handleSignOut();
                                        setSidebarOpen(false);
                                    }}
                                >
                                    <SignOut className="h-4 w-4" />
                                    Log out
                                </Button>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
