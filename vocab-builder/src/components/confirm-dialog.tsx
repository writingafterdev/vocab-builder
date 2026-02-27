'use client';

import { useState, useEffect } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';

interface ConfirmOptions {
    title?: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
    dontAskAgainKey?: string;
}

let confirmResolve: ((value: boolean) => void) | null = null;

export function ConfirmDialog({
    open,
    onOpenChange,
    options,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    options: ConfirmOptions;
}) {
    const [dontAsk, setDontAsk] = useState(false);

    // Reset when dialog opens
    useEffect(() => {
        if (open) setDontAsk(false);
    }, [open]);

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle>{options.title || 'Confirm'}</AlertDialogTitle>
                    <AlertDialogDescription>{options.description}</AlertDialogDescription>
                </AlertDialogHeader>

                {options.dontAskAgainKey && (
                    <div className="flex items-center space-x-2 py-2">
                        <Checkbox
                            id="dont-ask"
                            checked={dontAsk}
                            onCheckedChange={(checked) => setDontAsk(checked as boolean)}
                        />
                        <label
                            htmlFor="dont-ask"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-600 cursor-pointer"
                        >
                            Don't ask me again
                        </label>
                    </div>
                )}

                <AlertDialogFooter>
                    <AlertDialogCancel
                        onClick={() => {
                            confirmResolve?.(false);
                            onOpenChange(false);
                        }}
                    >
                        {options.cancelText || 'Cancel'}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => {
                            if (dontAsk && options.dontAskAgainKey) {
                                localStorage.setItem(`confirm_dont_ask_${options.dontAskAgainKey}`, 'true');
                            }
                            confirmResolve?.(true);
                            onOpenChange(false);
                        }}
                        className={options.destructive ? 'bg-red-600 hover:bg-red-700' : ''}
                    >
                        {options.confirmText || 'Confirm'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// Hook for using confirm dialog
export function useConfirm() {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions>({ description: '' });

    const confirm = (opts: ConfirmOptions): Promise<boolean> => {
        // Check if "Don't ask again" was previously checked
        if (opts.dontAskAgainKey) {
            const saved = localStorage.getItem(`confirm_dont_ask_${opts.dontAskAgainKey}`);
            if (saved === 'true') {
                return Promise.resolve(true);
            }
        }

        setOptions(opts);
        setOpen(true);
        return new Promise((resolve) => {
            confirmResolve = resolve;
        });
    };

    const DialogComponent = (
        <ConfirmDialog open={open} onOpenChange={setOpen} options={options} />
    );

    return { confirm, DialogComponent };
}
