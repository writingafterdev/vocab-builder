'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    User,
    Mail,
    AtSign,
    Save,
    Calendar,
    CheckCircle,
    AlertCircle,
    RefreshCw
} from 'lucide-react';
import { updateUserProfile, checkUsernameAvailable, updateCommentsUsername } from '@/lib/db/users';
import { toast } from 'sonner';

export default function SettingsPage() {
    const { user, profile, refreshProfile } = useAuth();

    // Profile form state
    const [displayName, setDisplayName] = useState('');
    const [username, setUsername] = useState('');
    const [bio, setBio] = useState('');
    const [saving, setSaving] = useState(false);
    const [usernameError, setUsernameError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        if (profile) {
            setDisplayName(profile.displayName || '');
            setUsername(profile.username || '');
            setBio(profile.bio || '');
        }
    }, [profile]);

    const handleSaveProfile = async () => {
        if (!user || !profile) return;

        setSaving(true);
        setUsernameError('');
        setSuccessMessage('');

        try {
            // Check if username changed and is available
            if (username.toLowerCase() !== profile.username.toLowerCase()) {
                const isAvailable = await checkUsernameAvailable(username, user.uid);
                if (!isAvailable) {
                    setUsernameError('Username is already taken');
                    setSaving(false);
                    return;
                }
            }

            await updateUserProfile(user.uid, {
                displayName,
                username: username.toLowerCase(),
                bio,
            });

            // Update username in all comments if it changed
            if (username.toLowerCase() !== profile.username.toLowerCase()) {
                await updateCommentsUsername(user.uid, username.toLowerCase());
            }

            // Refresh the profile in context
            await refreshProfile();
            setSuccessMessage('Profile updated successfully!');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
            console.error('Error updating profile:', error);
            setUsernameError('Failed to update profile');
        }

        setSaving(false);
    };

    const formatDate = (date: Date | undefined) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    if (!profile) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl mx-auto font-sans">
            <div>
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-neutral-500">Manage your account and learning preferences</p>
            </div>

            {/* Profile Section */}
            <div className="bg-white border border-neutral-100 rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 pb-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        <User className="h-5 w-5" />
                        <h2 className="font-semibold text-lg">Edit Profile</h2>
                    </div>
                    <p className="text-sm text-neutral-500">
                        Update your personal information
                    </p>
                </div>
                <div className="p-6 space-y-6">
                    {/* Avatar */}
                    <div className="flex items-center gap-4">
                        <Avatar className="h-20 w-20">
                            <AvatarImage src={profile.photoURL} />
                            <AvatarFallback className="text-xl bg-neutral-900 text-white">
                                {profile.displayName?.charAt(0) || 'U'}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <p className="font-medium">{profile.displayName}</p>
                            <p className="text-sm text-neutral-500">@{profile.username}</p>
                        </div>
                    </div>

                    <Separator />

                    {/* Form Fields */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium flex items-center gap-2 mb-2">
                                <User className="h-4 w-4" />
                                Display Name
                            </label>
                            <Input
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Your display name"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium flex items-center gap-2 mb-2">
                                <AtSign className="h-4 w-4" />
                                Username
                            </label>
                            <Input
                                value={username}
                                onChange={(e) => {
                                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                                    setUsernameError('');
                                }}
                                placeholder="username"
                            />
                            {usernameError && (
                                <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    {usernameError}
                                </p>
                            )}
                            <p className="text-xs text-neutral-500 mt-1">
                                Only lowercase letters, numbers, and underscores
                            </p>
                        </div>

                        <div>
                            <label className="text-sm font-medium flex items-center gap-2 mb-2">
                                <Mail className="h-4 w-4" />
                                Email
                            </label>
                            <Input
                                value={profile.email}
                                disabled
                                className="bg-neutral-50"
                            />
                            <p className="text-xs text-neutral-500 mt-1">
                                Email cannot be changed
                            </p>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">Bio</label>
                            <Textarea
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Tell others about yourself..."
                                className="min-h-[100px]"
                            />
                        </div>
                    </div>

                    {/* Success Message */}
                    {successMessage && (
                        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" />
                            {successMessage}
                        </div>
                    )}

                    {/* Save Button */}
                    <Button
                        onClick={handleSaveProfile}
                        disabled={saving}
                        className="bg-neutral-900 text-white hover:bg-neutral-800 active:scale-95 transition-all"
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </div>

            {/* Learning Preferences */}
            <div className="bg-white border border-neutral-100 rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 pb-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        <RefreshCw className="h-5 w-5" />
                        <h2 className="font-semibold text-lg">Learning Preferences</h2>
                    </div>
                    <p className="text-sm text-neutral-500">
                        Customize your learning experience
                    </p>
                </div>
                <div className="p-6 space-y-4">
                    {/* SRS Info */}
                    <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <RefreshCw className="h-5 w-5 text-neutral-500" />
                            <div>
                                <p className="font-medium">Review Schedule</p>
                                <p className="text-sm text-neutral-500">
                                    Spaced repetition: 1, 3, 7, 14, 30, 90 days
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Account Info */}
            <div className="bg-white border border-neutral-100 rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 pb-0">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        <h2 className="font-semibold text-lg">Account Info</h2>
                    </div>
                </div>
                <div className="p-6 space-y-2 text-sm text-neutral-600">
                    <p><strong>Member since:</strong> {formatDate(profile.createdAt)}</p>
                    <p><strong>Total phrases saved:</strong> {profile.stats?.totalPhrases || 0}</p>
                    <p><strong>Current streak:</strong> {profile.stats?.currentStreak || 0} days</p>
                </div>
            </div>
        </div>
    );
}
