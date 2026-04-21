'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Sun,
    Moon,
    Monitor,
    AlertCircle,
    Trash2,
    GraduationCap,
    RefreshCw
} from 'lucide-react';
import { updateUserProfile, checkUsernameAvailable, updateCommentsUsername } from '@/lib/db/users';
import { toast } from 'sonner';
import { EditorialLoader } from '@/components/ui/editorial-loader';

export default function SettingsPage() {
    const router = useRouter();
    const { user, profile, refreshProfile, signOut } = useAuth();

    // Profile form state
    const [displayName, setDisplayName] = useState('');
    const [username, setUsername] = useState('');
    const [bio, setBio] = useState('');
    const [saving, setSaving] = useState(false);
    const [usernameError, setUsernameError] = useState('');

    // Proficiency level state
    const [proficiency, setProficiency] = useState<{
        label: string;
        level: number;
        hasTakenTest: boolean;
    } | null>(null);

    // Preferences state
    const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
    const [weeklyDigest, setWeeklyDigest] = useState(false);
    const [productUpdates, setProductUpdates] = useState(true);
    const [activityHistory, setActivityHistory] = useState(true);

    useEffect(() => {
        if (profile) {
            setDisplayName(profile.displayName || '');
            setUsername(profile.username || '');
            setBio(profile.bio || '');
        }
    }, [profile]);

    // Fetch proficiency on mount
    useEffect(() => {
        async function fetchProficiency() {
            if (!user) return;
            try {
                const token = await user.getJwt();
                const res = await fetch('/api/user/get-proficiency', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'x-user-id': user.$id
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    setProficiency(data);
                }
            } catch (e) {
                console.error('Failed to fetch proficiency:', e);
            }
        }
        fetchProficiency();
    }, [user]);

    const handleSaveProfile = async () => {
        if (!user || !profile) return;

        setSaving(true);
        setUsernameError('');

        try {
            // Check if username changed and is available
            if (username.toLowerCase() !== profile.username.toLowerCase()) {
                const isAvailable = await checkUsernameAvailable(username, user.$id);
                if (!isAvailable) {
                    setUsernameError('Username is already taken');
                    setSaving(false);
                    return;
                }
            }

            await updateUserProfile(user.$id, {
                displayName,
                username: username.toLowerCase(),
                bio,
            });

            // Update username in all comments if it changed
            if (username.toLowerCase() !== profile.username.toLowerCase()) {
                await updateCommentsUsername(user.$id, username.toLowerCase());
            }

            // Refresh the profile in context
            await refreshProfile();
            toast.success('Profile updated successfully!');
        } catch (error) {
            console.error('Error updating profile:', error);
            toast.error('Failed to update profile');
        }

        setSaving(false);
    };

    if (!profile) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <EditorialLoader size="md" />
            </div>
        );
    }

    return (
        <div className="w-full py-8 px-8 font-sans">
            <div className="w-full">
                <div className="flex flex-col gap-10">

                    {/* My Profile Section */}
                    <section>
                        <div className="bg-white border border-neutral-200">
                            <div className="flex items-center justify-between p-6 md:p-8 border-b border-neutral-100">
                                <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-[0.1em]">My Profile</h2>
                                <button
                                    onClick={handleSaveProfile}
                                    disabled={saving}
                                    className="px-4 py-2 bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : 'Save changes'}
                                </button>
                            </div>
                            <div className="p-6 md:p-8">
                                <div className="flex flex-col md:flex-row gap-8 items-start">
                                    {/* Avatar */}
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="relative group cursor-pointer">
                                            <Avatar className="h-24 w-24 border-2 border-neutral-200">
                                                <AvatarImage src={profile.photoURL} />
                                                <AvatarFallback className="text-2xl bg-neutral-900 text-white">
                                                    {profile.displayName?.charAt(0) || 'U'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                                                <span className="text-white text-sm">Edit</span>
                                            </div>
                                        </div>
                                        <button className="text-xs font-medium text-neutral-400 hover:text-neutral-900 transition-colors">
                                            Change Avatar
                                        </button>
                                    </div>

                                    {/* Form Fields */}
                                    <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-[11px] uppercase tracking-[0.15em] font-medium text-neutral-400">Full Name</label>
                                            <Input
                                                value={displayName}
                                                onChange={(e) => setDisplayName(e.target.value)}
                                                className="border-neutral-200 bg-neutral-50 focus:ring-neutral-900 focus:border-neutral-900"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label className="text-[11px] uppercase tracking-[0.15em] font-medium text-neutral-400">Email Address</label>
                                            <Input
                                                value={profile.email}
                                                disabled
                                                className="border-neutral-200 bg-neutral-50"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label className="text-[11px] uppercase tracking-[0.15em] font-medium text-neutral-400">Username</label>
                                            <Input
                                                value={username}
                                                onChange={(e) => {
                                                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                                                    setUsernameError('');
                                                }}
                                                className="border-neutral-200 bg-neutral-50 focus:ring-neutral-900 focus:border-neutral-900"
                                            />
                                            {usernameError && (
                                                <p className="text-red-600 text-xs flex items-center gap-1">
                                                    <AlertCircle className="h-3 w-3" />
                                                    {usernameError}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-2 md:col-span-2">
                                            <label className="text-[11px] uppercase tracking-[0.15em] font-medium text-neutral-400">Bio</label>
                                            <Textarea
                                                value={bio}
                                                onChange={(e) => setBio(e.target.value)}
                                                placeholder="Tell others about yourself..."
                                                className="border-neutral-200 bg-neutral-50 focus:ring-neutral-900 focus:border-neutral-900 min-h-[80px]"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* English Level Section */}
                    <section>
                        <div className="bg-white border border-neutral-200">
                            <div className="flex items-center justify-between p-6 md:p-8 border-b border-neutral-100">
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 border border-[#1e3a5f]/20 bg-[#1e3a5f]/5 flex items-center justify-center">
                                        <GraduationCap className="w-4 h-4 text-[#1e3a5f]" />
                                    </div>
                                    <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-[0.1em]">English Level</h2>
                                </div>
                            </div>
                            <div className="p-6 md:p-8">
                                {proficiency ? (
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="px-4 py-2 bg-neutral-900">
                                                <span className="text-white font-serif text-lg">
                                                    {proficiency.label}
                                                </span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm text-neutral-500">
                                                    {proficiency.hasTakenTest
                                                        ? 'Based on your placement test'
                                                        : 'Default level — take a test for accurate assessment'
                                                    }
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => router.push('/placement-test')}
                                            className="flex items-center gap-2 px-4 py-2 border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors text-sm font-medium"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            {proficiency.hasTakenTest ? 'Retake Test' : 'Take Test'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <span className="text-neutral-400 text-sm">Loading level...</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Account Settings Section */}
                    <section>
                        <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-[0.1em] mb-6">Account Settings</h2>
                        <div className="bg-white border border-neutral-200 divide-y divide-neutral-100">
                            {/* Password */}
                            <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-sm font-medium text-neutral-900">Password</h3>
                                    <p className="text-sm text-neutral-400">Managed through Google sign-in</p>
                                </div>
                                <button className="px-4 py-2 border border-neutral-200 text-sm font-medium hover:bg-neutral-50 transition-colors text-neutral-700">
                                    Update Password
                                </button>
                            </div>

                            {/* Subscription */}
                            <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-sm font-medium text-neutral-900">Subscription Plan</h3>
                                    <p className="text-sm text-neutral-400">
                                        You are currently on the <span className="font-semibold text-neutral-700">Free Plan</span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#1e3a5f] bg-[#1e3a5f]/5 border border-[#1e3a5f]/20 px-2 py-1">
                                        Active
                                    </span>
                                    <button className="px-4 py-2 bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors">
                                        Upgrade to Pro
                                    </button>
                                </div>
                            </div>

                            {/* Log Out */}
                            <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-sm font-medium text-neutral-900">Sign Out</h3>
                                    <p className="text-sm text-neutral-400">Sign out of your account on this device.</p>
                                </div>
                                <button 
                                    onClick={async () => {
                                        await signOut();
                                        router.push('/');
                                    }}
                                    className="px-4 py-2 border border-neutral-200 text-neutral-700 text-sm font-medium hover:bg-neutral-50 transition-colors"
                                >
                                    Log Out
                                </button>
                            </div>

                            {/* Danger Zone */}
                            <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-sm font-medium text-red-700">Danger Zone</h3>
                                    <p className="text-sm text-neutral-400">Permanently delete your account and all of your content.</p>
                                </div>
                                <button className="px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 text-sm font-medium transition-colors flex items-center gap-2">
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete Account
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Preferences Section */}
                    <section>
                        <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-[0.1em] mb-6">Preferences</h2>
                        <div className="bg-white border border-neutral-200 p-6 md:p-8">
                            <div className="grid grid-cols-1 gap-8">

                                {/* Appearance */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="flex flex-col gap-1">
                                        <h3 className="text-sm font-medium text-neutral-900">Appearance</h3>
                                        <p className="text-sm text-neutral-400">Customize how the app looks on your device.</p>
                                    </div>
                                    <div className="md:col-span-2 flex flex-col gap-4">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-[11px] uppercase tracking-[0.15em] font-medium text-neutral-400">Theme</label>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setTheme('light')}
                                                    className={`flex-1 flex flex-col items-center gap-2 p-3 border-2 transition-colors ${theme === 'light'
                                                        ? 'border-neutral-900 bg-neutral-50'
                                                        : 'border-neutral-200 hover:bg-neutral-50'
                                                        }`}
                                                >
                                                    <Sun className={`h-5 w-5 ${theme === 'light' ? 'text-neutral-900' : 'text-neutral-400'}`} />
                                                    <span className={`text-sm font-medium ${theme === 'light' ? 'text-neutral-900' : 'text-neutral-500'}`}>Light</span>
                                                </button>
                                                <button
                                                    onClick={() => setTheme('dark')}
                                                    className={`flex-1 flex flex-col items-center gap-2 p-3 border-2 transition-colors ${theme === 'dark'
                                                        ? 'border-neutral-900 bg-neutral-50'
                                                        : 'border-neutral-200 hover:bg-neutral-50'
                                                        }`}
                                                >
                                                    <Moon className={`h-5 w-5 ${theme === 'dark' ? 'text-neutral-900' : 'text-neutral-400'}`} />
                                                    <span className={`text-sm font-medium ${theme === 'dark' ? 'text-neutral-900' : 'text-neutral-500'}`}>Dark</span>
                                                </button>
                                                <button
                                                    onClick={() => setTheme('system')}
                                                    className={`flex-1 flex flex-col items-center gap-2 p-3 border-2 transition-colors ${theme === 'system'
                                                        ? 'border-neutral-900 bg-neutral-50'
                                                        : 'border-neutral-200 hover:bg-neutral-50'
                                                        }`}
                                                >
                                                    <Monitor className={`h-5 w-5 ${theme === 'system' ? 'text-neutral-900' : 'text-neutral-400'}`} />
                                                    <span className={`text-sm font-medium ${theme === 'system' ? 'text-neutral-900' : 'text-neutral-500'}`}>System</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="h-px bg-neutral-100 w-full"></div>

                                {/* Notifications */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="flex flex-col gap-1">
                                        <h3 className="text-sm font-medium text-neutral-900">Notifications</h3>
                                        <p className="text-sm text-neutral-400">Manage what emails you receive.</p>
                                    </div>
                                    <div className="md:col-span-2 flex flex-col gap-4">
                                        <div className="flex items-start gap-3">
                                            <input
                                                type="checkbox"
                                                id="weekly-digest"
                                                checked={weeklyDigest}
                                                onChange={(e) => setWeeklyDigest(e.target.checked)}
                                                className="w-4 h-4 text-neutral-900 border-neutral-300 focus:ring-neutral-900 mt-0.5 accent-neutral-900"
                                            />
                                            <div className="flex flex-col">
                                                <label htmlFor="weekly-digest" className="text-sm font-medium text-neutral-900">Weekly Digest</label>
                                                <p className="text-xs text-neutral-400">A summary of your vocabulary progress and reading stats.</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <input
                                                type="checkbox"
                                                id="product-updates"
                                                checked={productUpdates}
                                                onChange={(e) => setProductUpdates(e.target.checked)}
                                                className="w-4 h-4 text-neutral-900 border-neutral-300 focus:ring-neutral-900 mt-0.5 accent-neutral-900"
                                            />
                                            <div className="flex flex-col">
                                                <label htmlFor="product-updates" className="text-sm font-medium text-neutral-900">Product Updates</label>
                                                <p className="text-xs text-neutral-400">News about features and improvements.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="h-px bg-neutral-100 w-full"></div>

                                {/* Data & Privacy */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="flex flex-col gap-1">
                                        <h3 className="text-sm font-medium text-neutral-900">Data & Privacy</h3>
                                        <p className="text-sm text-neutral-400">Control how your data is used.</p>
                                    </div>
                                    <div className="md:col-span-2 flex flex-col gap-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-neutral-900">Activity History</span>
                                                <span className="text-xs text-neutral-400">Save your reading history to improve recommendations</span>
                                            </div>
                                            <button
                                                onClick={() => setActivityHistory(!activityHistory)}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center border transition-colors duration-200 ${activityHistory ? 'bg-neutral-900 border-neutral-900' : 'bg-neutral-200 border-neutral-300'}`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-4 w-4 transform bg-white shadow transition duration-200 ease-in-out ${activityHistory ? 'translate-x-6' : 'translate-x-0.5'}`}
                                                />
                                            </button>
                                        </div>
                                        <div className="mt-2">
                                            <button className="text-sm text-neutral-500 hover:text-neutral-900 underline decoration-neutral-300 underline-offset-4 transition-colors">
                                                Download my data
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
