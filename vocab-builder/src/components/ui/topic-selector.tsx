'use client';

import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Search, Check } from 'lucide-react';
import { TOPIC_OPTIONS, TopicValue } from '@/lib/db/types';

interface TopicSelectorProps {
    selected: TopicValue[];
    onChange: (topics: TopicValue[]) => void;
    className?: string;
}

export function TopicSelector({ selected, onChange, className = '' }: TopicSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = TOPIC_OPTIONS.filter(option =>
        option.label.toLowerCase().includes(search.toLowerCase())
    );

    const toggleTopic = (value: TopicValue) => {
        if (selected.includes(value)) {
            onChange(selected.filter(t => t !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const removeTopic = (value: TopicValue, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(selected.filter(t => t !== value));
    };

    const getLabel = (value: TopicValue) => {
        return TOPIC_OPTIONS.find(o => o.value === value)?.label || value;
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* Trigger / Selected chips display */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full min-h-[42px] px-3 py-2 text-left bg-white border border-neutral-200 rounded-lg hover:border-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-colors"
            >
                <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5 flex-1">
                        {selected.length === 0 ? (
                            <span className="text-sm text-neutral-400">Select topics...</span>
                        ) : (
                            selected.map(value => (
                                <span
                                    key={value}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 rounded-md text-sm text-neutral-700"
                                >
                                    {getLabel(value)}
                                    <X
                                        className="h-3 w-3 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                                        onClick={(e) => removeTopic(value, e)}
                                    />
                                </span>
                            ))
                        )}
                    </div>
                    <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden">
                    {/* Search */}
                    <div className="p-2 border-b border-neutral-100">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search topics..."
                                className="w-full pl-8 pr-8 py-1.5 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-300"
                                autoFocus
                            />
                            {search && (
                                <X
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                                    onClick={() => setSearch('')}
                                />
                            )}
                        </div>
                    </div>

                    {/* Options list */}
                    <div className="max-h-48 overflow-y-auto">
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-neutral-400 text-center">
                                No topics found
                            </div>
                        ) : (
                            filteredOptions.map(option => {
                                const isSelected = selected.includes(option.value);
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => toggleTopic(option.value)}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-neutral-50 transition-colors ${isSelected ? 'bg-neutral-50' : ''
                                            }`}
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected
                                                ? 'bg-neutral-900 border-neutral-900'
                                                : 'border-neutral-300'
                                            }`}>
                                            {isSelected && <Check className="h-3 w-3 text-white" />}
                                        </div>
                                        <span className={isSelected ? 'font-medium text-neutral-900' : 'text-neutral-600'}>
                                            {option.label}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
