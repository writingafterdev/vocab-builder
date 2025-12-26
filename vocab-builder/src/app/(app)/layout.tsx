'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
    Home,
    BookOpen,
    User,
    Settings,
    LogOut,
    Crown,
    Sparkles,
    Menu,
    X,
    Shield,
    Pencil,
    History,
    ArrowUpRight
} from 'lucide-react';

const ADMIN_EMAIL = 'ducanhcontactonfb@gmail.com';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AppLayout({ children }: { children: ReactNode }) {
    const { user, profile, loading, signOut } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/');
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-neutral-50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900"></div>
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

    const navItems = [
        { href: '/feed', icon: Home, label: 'Feed' },
        { href: '/practice', icon: Pencil, label: 'Practice' },
        { href: '/vocab', icon: BookOpen, label: 'Vocab Bank' },
        { href: '/history', icon: History, label: 'History' },
        { href: `/profile/${profile.username}`, icon: User, label: 'Profile' },
        { href: '/settings', icon: Settings, label: 'Settings' },
        ...(isAdmin ? [{ href: '/admin', icon: Shield, label: 'Admin' }] : []),
    ];

    const isActive = (href: string) => {
        if (href.startsWith('/profile')) {
            return pathname.startsWith('/profile');
        }
        return pathname === href;
    };

    return (
        <div className="min-h-screen bg-neutral-50">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-neutral-100 font-sans">
                {/* Logo - Refined with breathing room */}
                <div className="flex items-center gap-3 px-6 py-6">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 shadow-sm">
                        <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <span className="font-semibold text-lg tracking-tight text-neutral-900">Vocab Builder</span>
                </div>

                {/* Navigation - Clear visual hierarchy */}
                <nav className="flex-1 px-3 py-4">
                    <p className="px-4 py-2 text-xs font-medium text-neutral-400 uppercase tracking-wider">Menu</p>
                    <div className="space-y-1 mt-2">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`group flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${active
                                        ? 'bg-neutral-900 text-white shadow-sm'
                                        : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                                        }`}
                                >
                                    <Icon className={`h-[18px] w-[18px] ${active ? 'text-white' : 'text-neutral-400 group-hover:text-neutral-600'}`} />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </div>
                </nav>

                {/* User section - Clean separation */}
                <div className="p-4 border-t border-neutral-100">
                    {/* User info */}
                    <div className="flex items-center gap-3 px-2 py-3 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer mb-3">
                        <Avatar className="h-9 w-9 ring-2 ring-neutral-100">
                            <AvatarImage src={profile.photoURL} alt={profile.displayName} />
                            <AvatarFallback className="bg-neutral-100 text-neutral-600 text-sm font-medium">{profile.displayName?.charAt(0) || 'U'}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-900 truncate">{profile.displayName}</p>
                            <p className="text-xs text-neutral-400 truncate">@{profile.username}</p>
                        </div>
                    </div>

                    {/* Upgrade CTA - Minimalist */}
                    {profile.subscription.status === 'trial' && (
                        <div className="mb-4 px-1">
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
                        className="w-full justify-start gap-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 rounded-lg"
                        onClick={handleSignOut}
                    >
                        <LogOut className="h-4 w-4" />
                        Log out
                    </Button>
                </div>
            </aside>

            {/* Mobile Header */}
            <header className="lg:hidden sticky top-0 z-50 w-full bg-white border-b border-neutral-200">
                <div className="flex h-14 items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-900">
                            <Sparkles className="h-4 w-4 text-white" />
                        </div>
                        <span className="font-semibold">Vocab Builder</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSidebarOpen(true)}
                    >
                        <Menu className="h-5 w-5" />
                    </Button>
                </div>
            </header>

            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
                {sidebarOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            exit={{ opacity: 0 }}
                            className="lg:hidden fixed inset-0 z-50 bg-black"
                            onClick={() => setSidebarOpen(false)}
                        />
                        <motion.aside
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 20 }}
                            className="lg:hidden fixed right-0 top-0 bottom-0 z-50 w-72 bg-white"
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

                            <nav className="px-3 py-4 space-y-1">
                                {navItems.map((item) => {
                                    const Icon = item.icon;
                                    const active = isActive(item.href);
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => setSidebarOpen(false)}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${active
                                                ? 'bg-neutral-900 text-white'
                                                : 'text-neutral-600 hover:bg-neutral-100'
                                                }`}
                                        >
                                            <Icon className="h-5 w-5" />
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </nav>

                            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-neutral-100">
                                <div className="flex items-center gap-3 px-2 py-2 mb-3">
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={profile.photoURL} alt={profile.displayName} />
                                        <AvatarFallback className="bg-neutral-200">{profile.displayName?.charAt(0) || 'U'}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{profile.displayName}</p>
                                        <p className="text-xs text-neutral-500 truncate">@{profile.username}</p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    className="w-full justify-start gap-2 text-neutral-600"
                                    onClick={() => {
                                        handleSignOut();
                                        setSidebarOpen(false);
                                    }}
                                >
                                    <LogOut className="h-4 w-4" />
                                    Log out
                                </Button>
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <main className="lg:pl-64">
                <div className="px-4 lg:px-8 py-6 max-w-5xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
