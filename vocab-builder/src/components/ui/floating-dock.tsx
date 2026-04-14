'use client';

import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface DockItem {
    href: string;
    icon: React.ReactNode;
    label: string;
    isActive?: boolean;
    showBadge?: boolean;
    onClick?: () => void;
}

interface FloatingDockProps {
    items: DockItem[];
    className?: string;
}

function DockIcon({
    item,
    mouseX,
}: {
    item: DockItem;
    mouseX: ReturnType<typeof useMotionValue<number>>;
}) {
    const ref = useRef<HTMLDivElement>(null);

    const distance = useTransform(mouseX, (val) => {
        const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
        return val - bounds.x - bounds.width / 2;
    });

    // Magnification effect
    const widthSync = useTransform(distance, [-150, 0, 150], [48, 64, 48]);
    const width = useSpring(widthSync, {
        mass: 0.1,
        stiffness: 150,
        damping: 12,
    });

    const content = (
        <motion.div
            ref={ref}
            style={{ width, height: width }}
            className={cn(
                "relative flex items-center justify-center rounded-none transition-colors duration-200 group border border-transparent cursor-pointer",
                item.isActive
                    ? "bg-neutral-900 text-white shadow-sm"
                    : "bg-white/80 text-neutral-600 hover:bg-neutral-900 hover:text-white hover:border-neutral-900"
            )}
        >
            <div className="flex items-center justify-center w-6 h-6">
                {item.icon}
            </div>

            {/* Notification badge dot */}
            {item.showBadge && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white" />
            )}

            {/* Tooltip */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-neutral-900 text-white text-xs font-medium rounded-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
                {item.label}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-900 rotate-45" />
            </div>
        </motion.div>
    );

    if (item.onClick) {
        return <div onClick={item.onClick}>{content}</div>;
    }

    return <Link href={item.href}>{content}</Link>;
}

export function FloatingDock({ items, className }: FloatingDockProps) {
    const mouseX = useMotionValue(Infinity);

    return (
        <motion.div
            onMouseMove={(e) => mouseX.set(e.pageX)}
            onMouseLeave={() => mouseX.set(Infinity)}
            className={cn(
                "fixed bottom-0 md:bottom-6 left-1/2 -translate-x-1/2 z-50",
                "w-full md:w-auto",
                "flex items-end justify-evenly md:justify-center gap-1 md:gap-2",
                "px-2 md:px-4 py-2 pb-6 md:py-3 md:pb-3",
                "bg-white/95 md:bg-white/90 backdrop-blur-xl border-t md:border border-neutral-200",
                "rounded-none shadow-sm overflow-x-auto no-scrollbar",
                className
            )}
        >
            {items.map((item) => (
                <DockIcon key={item.href} item={item} mouseX={mouseX} />
            ))}
        </motion.div>
    );
}
