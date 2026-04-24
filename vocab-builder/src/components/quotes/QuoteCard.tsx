'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen } from 'lucide-react';
import { toast } from 'sonner';

export interface Quote {
    id: string;
    text: string;
    postId: string;
    postTitle: string;
    author: string;
    source: string;
    topic?: string;
    tags?: string[];
    highlightedPhrases?: string[];
    vocabularyData?: Record<string, any>;
}

interface QuoteCardProps {
    quote: Quote;
    onPhraseClick?: (phrase: string, position: { x: number; y: number }) => void;
}

export function QuoteCard({ quote, onPhraseClick }: QuoteCardProps) {
    const router = useRouter();
    const hasArticleTarget = Boolean(quote.postId && quote.postId !== 'null');

    const handleTextClick = (e: React.MouseEvent<HTMLParagraphElement>) => {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();

        if (selectedText && selectedText.length > 2 && onPhraseClick) {
            onPhraseClick(selectedText, { x: e.clientX, y: e.clientY });
        }
    };

    const goToArticle = () => {
        if (!hasArticleTarget) {
            toast.error('This quote does not have a linked article');
            return;
        }
        router.push(`/post/${quote.postId}`);
    };

    return (
        <Card className="h-full bg-white border-neutral-200 shadow-lg flex flex-col">
            <CardContent className="flex-1 p-8 flex flex-col justify-center">
                {/* Quote - Large and Prominent */}
                <p
                    className={`font-serif leading-relaxed text-neutral-900 mb-8 cursor-text select-text ${
                        quote.text?.length > 250
                            ? 'text-lg md:text-xl'
                            : quote.text?.length > 150
                                ? 'text-xl md:text-2xl'
                                : 'text-2xl md:text-3xl'
                    }`}
                    onClick={handleTextClick}
                >
                    "{quote.text}"
                </p>

                {/* Metadata */}
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                    <span className="font-medium text-neutral-700">{quote.postTitle}</span>
                    {quote.author && (
                        <>
                            <span>•</span>
                            <span>{quote.author}</span>
                        </>
                    )}
                </div>
            </CardContent>

            <CardFooter className="p-6 pt-0 flex justify-between items-center">
                <span className="text-xs text-neutral-400 uppercase tracking-wider">
                    {quote.source}
                </span>
                <Button
                    onClick={goToArticle}
                    variant="default"
                    disabled={!hasArticleTarget}
                    className="bg-neutral-900 hover:bg-neutral-800"
                >
                    <BookOpen className="w-4 h-4 mr-2" />
                    Read Full Article
                </Button>
            </CardFooter>
        </Card>
    );
}
