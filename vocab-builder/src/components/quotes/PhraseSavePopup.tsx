'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, Bookmark, Loader2 } from 'lucide-react';

interface PhraseSavePopupProps {
    phrase: string;
    position: { x: number; y: number };
    onSave: () => void;
    onClose: () => void;
}

export function PhraseSavePopup({ phrase, position, onSave, onClose }: PhraseSavePopupProps) {
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            await onSave();
        } finally {
            // Note: onClose is usually called by the parent after onSave completes,
            // so we might not even need to set isSaving back to false.
            setIsSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="fixed z-50 bg-white rounded-xl shadow-2xl border border-neutral-200 p-4 max-w-xs"
            style={{
                // Position near click but ensure visible
                top: Math.min(position.y + 10, window.innerHeight - 150),
                left: Math.min(Math.max(position.x - 100, 16), window.innerWidth - 250),
            }}
        >
            <div className="flex items-start justify-between gap-2 mb-3">
                <p className="text-sm font-medium text-neutral-900 flex-1">
                    Save this phrase?
                </p>
                <button
                    onClick={onClose}
                    className="text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <p className="text-base font-serif text-neutral-700 mb-4 bg-amber-50 p-2 rounded-lg border border-amber-100">
                "{phrase}"
            </p>

            <div className="flex gap-2">
                <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    size="sm"
                    className="flex-1 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50"
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>
                            <Bookmark className="w-4 h-4 mr-1" />
                            Save to Vocab Bank
                        </>
                    )}
                </Button>
            </div>
        </motion.div>
    );
}
