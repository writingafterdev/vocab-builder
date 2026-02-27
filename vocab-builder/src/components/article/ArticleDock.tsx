'use client';

import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';

// --- Types ---

export interface ArticleDockAction {
    id: string;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
}

export interface ArticleDockGroup {
    actions: ArticleDockAction[];
}

interface ArticleDockProps {
    groups: ArticleDockGroup[];
    className?: string;
}

// --- Dock Icon ---

function DockActionIcon({
    action,
    mouseX,
}: {
    action: ArticleDockAction;
    mouseX: ReturnType<typeof useMotionValue<number>>;
}) {
    const ref = useRef<HTMLButtonElement>(null);

    const distance = useTransform(mouseX, (val) => {
        const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
        return val - bounds.x - bounds.width / 2;
    });

    const widthSync = useTransform(distance, [-150, 0, 150], [44, 56, 44]);
    const width = useSpring(widthSync, {
        mass: 0.1,
        stiffness: 150,
        damping: 12,
    });

    return (
        <motion.button
            ref={ref}
            style={{ width, height: width }}
            onClick={action.onClick}
            disabled={action.disabled}
            className={cn(
                'relative flex items-center justify-center transition-colors duration-200 group',
                action.disabled
                    ? 'opacity-30 cursor-not-allowed'
                    : action.isActive
                        ? 'bg-neutral-900 text-white'
                        : 'bg-white/80 text-neutral-500 hover:bg-neutral-900 hover:text-white'
            )}
            aria-label={action.label}
        >
            <div className="flex items-center justify-center w-5 h-5">
                {action.icon}
            </div>

            {/* Tooltip */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-neutral-900 text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
                {action.label}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-neutral-900 rotate-45" />
            </div>
        </motion.button>
    );
}

// --- Separator ---

function DockSeparator() {
    return <div className="w-px h-8 bg-neutral-200 mx-1 flex-shrink-0" />;
}

// --- Main Dock ---

export function ArticleDock({ groups, className }: ArticleDockProps) {
    const mouseX = useMotionValue(Infinity);

    return (
        <motion.div
            onMouseMove={(e) => mouseX.set(e.pageX)}
            onMouseLeave={() => mouseX.set(Infinity)}
            className={cn(
                'fixed bottom-8 left-1/2 -translate-x-1/2 z-50',
                'flex items-center gap-1 px-3 py-2',
                'bg-white/95 backdrop-blur-xl border border-neutral-200/50',
                'shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-none',
                className
            )}
        >
            {groups.map((group, groupIndex) => (
                <React.Fragment key={groupIndex}>
                    {groupIndex > 0 && <DockSeparator />}
                    {group.actions.map((action) => (
                        <DockActionIcon
                            key={action.id}
                            action={action}
                            mouseX={mouseX}
                        />
                    ))}
                </React.Fragment>
            ))}
        </motion.div>
    );
}
