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
import { usePracticeLauncher } from '@/hooks/use-practice-launcher';

export default function AppLayout({ children }: { children: ReactNode }) {
    const { user, profile, loading, signOut } = useAuth();
    const { launchPractice } = usePracticeLauncher();
    const router = useRouter();
    const pathname = usePathname();
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
            showBadge: hasPendingPractice && !isActive('/practice'),
            onClick: () => { void launchPractice(); }
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
        </div>
    );
}
