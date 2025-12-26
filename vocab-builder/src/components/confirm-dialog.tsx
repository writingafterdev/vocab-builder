'use client';

import { useState } from 'react';
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

interface ConfirmOptions {
    title?: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
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
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle>{options.title || 'Confirm'}</AlertDialogTitle>
                    <AlertDialogDescription>{options.description}</AlertDialogDescription>
                </AlertDialogHeader>
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
