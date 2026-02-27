'use client';

import React, { useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

interface Phrase {
    id: string;
    phrase: string;
    meaning: string;
    topics?: string[];
    children?: {
        id: string;
        phrase: string;
        meaning: string;
    }[];
}

interface VocabGraphProps {
    phrases: Phrase[];
    onNodeClick?: (node: any) => void;
    width?: number;
    height?: number;
}

const TOPIC_COLORS: Record<string, string> = {
    business: '#2563eb', career: '#2563eb', finance: '#059669',
    academic: '#7c3aed', science: '#7c3aed', education: '#7c3aed',
    daily_life: '#d97706', relationships: '#db2777', family: '#db2777',
    travel: '#0891b2', entertainment: '#e11d48', sports: '#ea580c',
    technology: '#475569', media: '#c026d3',
    health: '#16a34a', environment: '#65a30d',
    politics: '#dc2626', culture: '#9333ea',
    nature: '#059669', emotion: '#db2777', time: '#475569',
    art: '#d97706', memory: '#4f46e5', philosophy: '#7c3aed',
    experience: '#0d9488', history: '#57534e', reflection: '#0284c7',
    personal_growth: '#059669', lifestyle: '#e11d48',
    Uncategorized: '#9ca3af'
};

function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

export default function VocabGraph({ phrases, onNodeClick, width, height }: VocabGraphProps) {
    const graphData = useMemo(() => {
        const nodes: any[] = [];
        const links: any[] = [];
        const topicNodesAdded = new Set<string>();

        phrases.forEach(phrase => {
            const primaryTopic = phrase.topics?.[0] || 'Uncategorized';
            const topicNodeId = `topic-${primaryTopic}`;

            // 1. Ensure Topic Hub Node exists
            if (!topicNodesAdded.has(primaryTopic)) {
                nodes.push({
                    id: topicNodeId,
                    name: capitalize(primaryTopic),
                    group: 'topic',
                    val: 12, // Large size
                    color: TOPIC_COLORS[primaryTopic] || '#475569'
                });
                topicNodesAdded.add(primaryTopic);
            }

            // 2. Add Parent Phrase Node
            nodes.push({
                id: phrase.id,
                name: phrase.phrase,
                meaning: phrase.meaning,
                group: 'phrase',
                val: 6, // Medium size
                color: '#ffffff',
                strokeColor: TOPIC_COLORS[primaryTopic] || '#475569',
                originalPhrase: phrase
            });

            // Link Phrase -> Topic Hub
            links.push({
                source: phrase.id,
                target: topicNodeId
            });

            // 3. Add Child Expression Nodes
            if (phrase.children && phrase.children.length > 0) {
                phrase.children.forEach(child => {
                    nodes.push({
                        id: child.id,
                        name: child.phrase,
                        meaning: child.meaning,
                        group: 'child',
                        val: 3, // Small size
                        color: '#f8fafc',
                        strokeColor: '#cbd5e1'
                    });

                    // Link Child -> Parent Phrase
                    links.push({
                        source: child.id,
                        target: phrase.id
                    });
                });
            }
        });

        return { nodes, links };
    }, [phrases]);

    const handleNodePaint = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const label = node.name;
        const fontSize = node.group === 'topic' ? 14 / globalScale : 10 / globalScale;
        ctx.font = `${fontSize}px "Georgia", serif`;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);

        // Node Fill
        ctx.fillStyle = node.color;
        ctx.fill();

        // Node Border
        if (node.strokeColor) {
            ctx.lineWidth = node.group === 'topic' ? 0 : 1.5;
            ctx.strokeStyle = node.group === 'topic' ? 'transparent' : node.strokeColor;
            ctx.stroke();
        }

        // Label handling
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (node.group === 'topic') {
            // Draw label directly for topics
            ctx.fillStyle = '#ffffff';
            // ctx.fillText(label, node.x, node.y); // Optional: put text inside if bubble is big enough

            ctx.fillStyle = node.color;
            ctx.fillText(label, node.x, node.y + node.val + fontSize);
        } else {
            // Draw labels for phrases if zoomed in enough
            if (globalScale > 1.5) {
                const textY = node.y + node.val + fontSize;

                // Add tiny background to text for readability
                const textWidth = ctx.measureText(label).width;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.fillRect(node.x - textWidth / 2 - 2, textY - fontSize / 2 - 2, textWidth + 4, fontSize + 4);

                ctx.fillStyle = '#1e293b';
                ctx.fillText(label, node.x, textY);
            }
        }
    }, []);

    return (
        <div className="w-full h-full border border-neutral-100 bg-neutral-50/30 overflow-hidden relative">
            <ForceGraph2D
                width={width}
                height={height}
                graphData={graphData}
                nodeRelSize={1}
                nodeVal="val"
                nodeLabel={(node: any) => node.group === 'topic'
                    ? `<div style="padding:4px; font-family:serif;"><b>${node.name} Hub</b></div>`
                    : `<div style="padding:4px; max-width:200px; font-family:serif;">
                        <b>${node.name}</b><br/>
                        <span style="font-size:11px; opacity:0.8; font-style:italic;">${node.meaning}</span>
                       </div>`
                }
                linkColor={() => '#e2e8f0'}
                linkWidth={(link: any) => {
                    const isTopicLink = link.target.id?.startsWith('topic-');
                    return isTopicLink ? 1.5 : 1;
                }}
                nodeCanvasObject={handleNodePaint}
                onNodeClick={onNodeClick}
                cooldownTicks={100}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.3}
            />
        </div>
    );
}
