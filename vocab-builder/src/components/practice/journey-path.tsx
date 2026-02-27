'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Sparkles, Lock, Check, Trophy, Gift, Zap, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExerciseSessionType } from '@/lib/db/types';
import { useRouter } from 'next/navigation';

interface Cluster {
    id: string;
    theme: string;
    skill?: string;
    phrases: Array<{ id: string; phrase: string; meaning: string }>;
    context: string;
    pragmatics: {
        register: string;
        relationship: string;
    };
}

interface NodeProgress {
    [nodeId: string]: 'locked' | 'available' | 'completed';
}

interface JourneyPathProps {
    clusters: Cluster[];
    dailyProgress: {
        quickPracticeCompleted: boolean;
        storyCompleted: boolean;
        listeningCompleted: boolean;
        completedClusterIds?: string[];
    };
    onStartSession: (clusterId: string, sessionType: ExerciseSessionType) => void;
    onShowSummary?: () => void;
    onReviewSession?: (clusterId: string) => void;
    isStarting: boolean;
    immersiveEligible?: boolean;
}

type NodeType = 'practice' | 'chest' | 'summary' | 'immersive';

interface PathNode {
    id: string;
    type: NodeType;
    clusterId?: string;
    clusterIndex?: number;
    label: string;
    theme?: string;
    phrases?: Array<{ phrase: string; meaning: string }>;
}

function NodeIcon({ type, className }: { type: NodeType; className?: string }) {
    switch (type) {
        case 'practice':
            return <Star className={className} />;
        case 'chest':
            return <Gift className={className} />;
        case 'summary':
            return <Trophy className={className} />;
        case 'immersive':
            return <Sparkles className={className} />;
    }
}

// Editorial color scheme — subtle differentiation per type
function getNodeColors(type: NodeType, state: 'locked' | 'available' | 'completed') {
    if (state === 'completed') {
        return {
            bg: 'bg-stone-300',
            border: 'border-stone-400',
            shadow: '',
            text: 'text-stone-600'
        };
    }
    if (state === 'locked') {
        return {
            bg: 'bg-neutral-50',
            border: 'border-neutral-200',
            shadow: '',
            text: 'text-neutral-300'
        };
    }
    // Available — different accent per type
    switch (type) {
        case 'practice':
            return {
                bg: 'bg-stone-800',
                border: 'border-stone-700',
                shadow: 'shadow-stone-200',
                text: 'text-stone-100'
            };
        case 'immersive':
            return {
                bg: 'bg-slate-700',
                border: 'border-slate-600',
                shadow: 'shadow-slate-200',
                text: 'text-slate-100'
            };
        case 'chest':
            return {
                bg: 'bg-amber-800',
                border: 'border-amber-700',
                shadow: 'shadow-amber-100',
                text: 'text-amber-100'
            };
        case 'summary':
            return {
                bg: 'bg-neutral-900',
                border: 'border-neutral-800',
                shadow: '',
                text: 'text-white'
            };
    }
}

// Alternate nodes left and right with wide horizontal spread
function getXOffset(index: number): number {
    return index % 2 === 0 ? -140 : 140;
}

export default function JourneyPath({
    clusters,
    dailyProgress,
    onStartSession,
    onShowSummary,
    onReviewSession,
    isStarting,
    immersiveEligible = false,
}: JourneyPathProps) {
    const router = useRouter();
    const [selectedNode, setSelectedNode] = useState<PathNode | null>(null);
    const completedClusterIds = dailyProgress.completedClusterIds || [];

    const pathNodes = useMemo<PathNode[]>(() => {
        const nodes: PathNode[] = [];

        clusters.forEach((cluster, i) => {
            nodes.push({
                id: `cluster-${cluster.id}`,
                type: 'practice',
                clusterId: cluster.id,
                clusterIndex: i,
                label: cluster.skill || cluster.theme,
                theme: cluster.skill ? cluster.theme : undefined,
                phrases: cluster.phrases,
            });

            if ((i + 1) % 3 === 0 && i < clusters.length - 1) {
                nodes.push({
                    id: `chest-${i}`,
                    type: 'chest',
                    label: 'Bonus Reward',
                });
            }
        });

        if (immersiveEligible) {
            nodes.push({
                id: 'immersive-session',
                type: 'immersive',
                label: 'Immersive Mode',
            });
        }

        if (clusters.length > 0) {
            nodes.push({
                id: 'summary',
                type: 'summary',
                label: 'Session Complete',
            });
        }

        return nodes;
    }, [clusters, immersiveEligible]);

    const nodeStates = useMemo<NodeProgress>(() => {
        const states: NodeProgress = {};

        pathNodes.forEach((node, i) => {
            if (node.type === 'chest' || node.type === 'summary') {
                const prevClusterNode = pathNodes.slice(0, i).reverse().find(n => n.clusterId);
                if (node.type === 'summary') {
                    if (completedClusterIds.length >= clusters.length) {
                        states[node.id] = 'available';
                    } else {
                        states[node.id] = 'locked';
                    }
                } else if (prevClusterNode && completedClusterIds.includes(prevClusterNode.clusterId!)) {
                    states[node.id] = 'available';
                } else {
                    states[node.id] = 'locked';
                }
            } else if (node.type === 'immersive') {
                states[node.id] = 'available';
            } else if (node.clusterId) {
                if (completedClusterIds.includes(node.clusterId)) {
                    states[node.id] = 'completed';
                } else {
                    states[node.id] = 'available';
                }
            }
        });

        if (pathNodes.length > 0 && Object.keys(states).length === 0) {
            states[pathNodes[0].id] = 'available';
        }

        return states;
    }, [pathNodes, completedClusterIds, clusters.length]);

    const nextAvailableNode = pathNodes.find(n => nodeStates[n.id] === 'available');

    const handleNodeClick = (node: PathNode) => {
        const state = nodeStates[node.id];
        if (state === 'locked') return;

        if (node.type === 'summary' && (state === 'available' || state === 'completed')) {
            if (onShowSummary) {
                onShowSummary();
                return;
            }
        }

        if (node.type === 'immersive') {
            router.push('/practice/immersive');
            return;
        }

        if (state === 'completed' && node.clusterId) {
            if (onReviewSession) {
                onReviewSession(node.clusterId);
                return;
            }
        }

        if (node.type === 'chest' || node.type === 'summary') {
            setSelectedNode(node);
        } else if (node.clusterId) {
            onStartSession(node.clusterId, 'quick_practice');
        }
    };

    return (
        <div className="w-full py-12 px-4 flex flex-col items-center">
            {/* Unit Header — Editorial */}
            <div className="w-full mb-12">
                <div className="bg-neutral-900 p-6 flex justify-between items-center">
                    <div>
                        <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-400 font-bold block mb-1">Today</span>
                        <h1 className="text-2xl font-bold text-white tracking-tight">
                            Daily Practice
                        </h1>
                        <p className="text-xs text-neutral-400 mt-1">
                            {clusters.reduce((sum, c) => sum + c.phrases.length, 0)} phrases · {clusters.length} lessons
                        </p>
                    </div>
                    <div className="w-12 h-12 bg-white/10 border border-white/20 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-white" />
                    </div>
                </div>
            </div>

            {/* Path Container */}
            <div className="max-w-[600px] w-full relative pb-32">
                {/* Right-angle dotted connector lines */}
                <svg
                    className="absolute inset-0 w-full pointer-events-none"
                    style={{ height: pathNodes.length * 240 + 80 }}
                >
                    {pathNodes.map((node, index) => {
                        if (index === 0) return null;
                        const prevNode = pathNodes[index - 1];
                        const nodeHalf = node.type === 'chest' ? 32 : node.type === 'summary' ? 48 : 40;
                        const prevHalf = prevNode.type === 'chest' ? 32 : prevNode.type === 'summary' ? 48 : 40;

                        // Node centers
                        const x1 = 300 + getXOffset(index - 1);
                        const y1 = (index - 1) * 240 + 40 + prevHalf; // bottom center of prev
                        const x2 = 300 + getXOffset(index);
                        const y2 = index * 240 + 40; // top center of next

                        // Right-angle path: go horizontal to the far X, then vertical down, then horizontal to node
                        // Pick whichever X is further right as the elbow point
                        const elbowX = Math.max(x1, x2) + 60;

                        return (
                            <path
                                key={`line-${index}`}
                                d={`M ${x1} ${y1} L ${x1} ${y1 + 20} L ${elbowX} ${y1 + 20} L ${elbowX} ${y2 - 20} L ${x2} ${y2 - 20} L ${x2} ${y2}`}
                                fill="none"
                                stroke="#d4d4d4"
                                strokeWidth="1"
                                strokeDasharray="4 4"
                            />
                        );
                    })}
                </svg>

                <div className="relative" style={{ height: pathNodes.length * 240 + 80 }}>
                    {pathNodes.map((node, index) => {
                        const state = nodeStates[node.id] || 'locked';
                        const colors = getNodeColors(node.type, state);
                        const xOffset = getXOffset(index);
                        const isNext = nextAvailableNode?.id === node.id;
                        const size = node.type === 'summary' ? 'w-24 h-24' :
                            node.type === 'chest' ? 'w-16 h-16' : 'w-20 h-20';
                        const iconSize = node.type === 'summary' ? 'w-10 h-10' :
                            node.type === 'chest' ? 'w-8 h-8' : 'w-8 h-8';

                        return (
                            <motion.div
                                key={node.id}
                                initial={{ opacity: 0, scale: 0.8, x: `calc(-50% + ${xOffset}px)` }}
                                animate={{ opacity: 1, scale: 1, x: `calc(-50% + ${xOffset}px)` }}
                                transition={{ delay: index * 0.1, type: 'spring', stiffness: 200 }}
                                className="absolute left-1/2 z-10"
                                style={{ top: index * 240 }}
                            >
                                {/* START label */}
                                {isNext && state === 'available' && (
                                    <motion.div
                                        initial={{ y: -5, opacity: 0 }}
                                        animate={{ y: -12, opacity: 1 }}
                                        transition={{ y: { repeat: Infinity, repeatType: "reverse", duration: 1 } }}
                                        className="absolute -top-10 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap"
                                    >
                                        <div className="bg-neutral-900 text-white px-3 py-1 text-xs font-bold tracking-widest uppercase">
                                            Start
                                        </div>
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-neutral-900 mt-[1px]" />
                                    </motion.div>
                                )}

                                {/* Main Node — SQUARE */}
                                <button
                                    onClick={() => handleNodeClick(node)}
                                    disabled={state === 'locked' || isStarting}
                                    className={cn(
                                        'relative flex items-center justify-center transition-all duration-200',
                                        size,
                                        state === 'locked'
                                            ? 'bg-neutral-50 border-2 border-neutral-200'
                                            : `border-b-[4px] active:border-b-0 active:translate-y-[4px] hover:-translate-y-1 ${colors.bg} ${colors.border}`,
                                        state === 'completed' && 'opacity-60',
                                        isStarting && 'cursor-wait'
                                    )}
                                >
                                    <div className="relative z-10">
                                        {state === 'completed' ? (
                                            <Check className={cn(iconSize, 'text-white')} strokeWidth={3} />
                                        ) : state === 'locked' ? (
                                            <Lock className={cn(iconSize, 'text-neutral-300')} />
                                        ) : (
                                            <NodeIcon type={node.type} className={cn(iconSize, colors.text)} />
                                        )}
                                    </div>
                                </button>

                                {/* Label */}
                                {(state === 'available' || state === 'completed') && (
                                    <div className="absolute top-1/2 -right-32 -translate-y-1/2 w-28 text-left pl-3">
                                        <div className={cn(
                                            "text-sm font-semibold",
                                            state === 'completed' ? 'text-neutral-400 line-through' : 'text-neutral-700'
                                        )}>
                                            {node.label}
                                        </div>
                                        {node.theme && (
                                            <div className="text-xs text-neutral-400 truncate">{node.theme}</div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Selected Node Modal — Editorial */}
            <AnimatePresence>
                {selectedNode && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center sm:p-4"
                        onClick={() => setSelectedNode(null)}
                    >
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-sm bg-white sm:border sm:border-neutral-200 p-6"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3
                                        className="text-xl font-normal text-neutral-900 tracking-tight"
                                        style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                    >
                                        {selectedNode.label}
                                    </h3>
                                    {selectedNode.theme && (
                                        <p className="text-sm text-neutral-500">{selectedNode.theme}</p>
                                    )}
                                </div>
                                <button
                                    onClick={() => setSelectedNode(null)}
                                    className="p-2 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {selectedNode.phrases && selectedNode.phrases.length > 0 && (
                                <div className="mb-6">
                                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.15em] mb-3">Phrases</p>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedNode.phrases.map((p, i) => (
                                            <span
                                                key={i}
                                                className="px-2.5 py-1 bg-neutral-50 border border-neutral-200 text-xs font-medium text-neutral-600"
                                            >
                                                {p.phrase}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedNode.type === 'summary' && (
                                <div className={cn(
                                    "p-4 border flex gap-4 items-center",
                                    nodeStates[selectedNode.id] === 'available' || nodeStates[selectedNode.id] === 'completed'
                                        ? "bg-neutral-50 border-neutral-200"
                                        : "bg-neutral-50 border-neutral-200"
                                )}>
                                    <div className="w-10 h-10 bg-neutral-900 flex items-center justify-center flex-shrink-0">
                                        <Trophy className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        {nodeStates[selectedNode.id] === 'available' || nodeStates[selectedNode.id] === 'completed' ? (
                                            <>
                                                <p className="font-semibold text-neutral-900 text-sm">All Lessons Complete!</p>
                                                <p className="text-xs text-neutral-500">Great work on today&apos;s practice!</p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="font-semibold text-neutral-900 text-sm">Session Summary</p>
                                                <p className="text-xs text-neutral-500">Unlock by completing all lessons.</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {selectedNode.type === 'chest' && (
                                <div className="bg-neutral-50 p-4 border border-neutral-200 flex gap-4 items-center">
                                    <div className="w-10 h-10 bg-neutral-900 flex items-center justify-center flex-shrink-0">
                                        <Gift className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-neutral-900 text-sm">Bonus Reward</p>
                                        <p className="text-xs text-neutral-500">A special reward awaits!</p>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
