'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { EditorialLoader } from '@/components/ui/editorial-loader';

const GoogleLogo = () => (
    <svg width="20" height="20" viewBox="0 0 18 18" className="mr-2">
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
        <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.96H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.04l3.007-2.333z"/>
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.507.454 3.44 1.357l2.58-2.58C13.464.844 11.43 0 9 0 5.483 0 2.455 2.048.957 4.96l3.007 2.332C4.672 5.164 6.656 3.58 9 3.58z"/>
    </svg>
);

export default function LandingPage() {
    const { user, loading, signInWithGoogle } = useAuth();
    const router = useRouter();

    // Redirect if already logged in
    useEffect(() => {
        if (user && !loading) {
            router.push('/feed');
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <EditorialLoader size="md" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white text-black flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="max-w-md w-full text-center space-y-6"
            >
                {/* Logo / Splash */}
                <div className="space-y-2">
                    <h1 className="text-4xl md:text-5xl font-light tracking-tight text-black">
                        Vocab Builder
                    </h1>
                    <p className="text-lg md:text-xl font-normal text-slate-500 leading-relaxed max-w-sm mx-auto">
                        Acquire English vocabulary naturally through stories, context, and real usage.
                    </p>
                </div>

                {/* Login Action Card */}
                <div className="pt-4">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            signInWithGoogle();
                        }}
                        className="w-full flex items-center justify-center px-4 py-3.5 border border-slate-200 rounded-xl shadow-sm bg-white hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 cursor-pointer font-medium text-slate-700 text-lg"
                    >
                        <GoogleLogo />
                        Continue with Google
                    </button>
                    
                    <p className="mt-4 text-xs text-slate-400">
                        By continuing, you agree to start acquiring language naturally.
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
