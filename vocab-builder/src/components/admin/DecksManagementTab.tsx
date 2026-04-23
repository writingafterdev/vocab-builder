'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Plus, Trash2, Loader2, Sparkles, BookOpen, ArrowLeft,
    CheckCircle, AlertCircle, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Deck, DeckPhrase, DeckType, DeckStatus } from '@/lib/db/types';

// ── Deck Colors ──
const DECK_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#ef4444',
    '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
    '#3b82f6', '#6b7280',
];

const DECK_ICONS = ['📚', '🧠', '🌍', '💼', '🔬', '🎨', '💭', '⚖️', '🤬', '📖', '🏛', '🎭', '🧪', '💡', '🎓'];

// ── Status badge ──
function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { class: string; label: string }> = {
        pending:   { class: 'bg-yellow-100 text-yellow-700', label: '⏳ Pending' },
        generated: { class: 'bg-green-100 text-green-700',   label: '✅ Done' },
        failed:    { class: 'bg-red-100 text-red-700',       label: '❌ Failed' },
        draft:     { class: 'bg-neutral-100 text-neutral-600', label: 'Draft' },
        active:    { class: 'bg-green-100 text-green-700',   label: 'Active' },
        archived:  { class: 'bg-neutral-200 text-neutral-500', label: 'Archived' },
    };
    const c = config[status] || { class: 'bg-neutral-100', label: status };
    return <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${c.class}`}>{c.label}</span>;
}

export function DecksManagementTab() {
    // ── State ──
    const [decks, setDecks] = useState<Deck[]>([]);
    const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
    const [phrases, setPhrases] = useState<DeckPhrase[]>([]);
    const [loading, setLoading] = useState(false);
    const [phrasesLoading, setPhrasesLoading] = useState(false);

    // Create deck form
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState<DeckType>('linguistic');
    const [newDesc, setNewDesc] = useState('');
    const [newIcon, setNewIcon] = useState('📚');
    const [newColor, setNewColor] = useState('#6366f1');

    // Import phrases
    const [importText, setImportText] = useState('');
    const [importing, setImporting] = useState(false);

    // Generation states
    const [generatingMeta, setGeneratingMeta] = useState(false);
    const [generatingContent, setGeneratingContent] = useState(false);
    const [contentCount, setContentCount] = useState(10);

    // ── Load decks ──
    const loadDecks = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/decks');
            if (res.ok) {
                const data = await res.json();
                setDecks(data.decks || []);
            }
        } catch (e) {
            console.error('Failed to load decks:', e);
        } finally {
            setLoading(false);
        }
    };

    // ── Load phrases for selected deck ──
    const loadPhrases = async (deckId: string) => {
        setPhrasesLoading(true);
        try {
            const res = await fetch(`/api/admin/decks/${deckId}/phrases`);
            if (res.ok) {
                const data = await res.json();
                setPhrases(data.phrases || []);
            }
        } catch (e) {
            console.error('Failed to load phrases:', e);
        } finally {
            setPhrasesLoading(false);
        }
    };

    useEffect(() => { loadDecks(); }, []);

    // ── Create deck ──
    const handleCreate = async () => {
        if (!newName.trim()) return;
        setLoading(true);
        try {
            const res = await fetch('/api/admin/decks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, type: newType, description: newDesc, icon: newIcon, color: newColor }),
            });
            if (res.ok) {
                toast.success(`Deck "${newName}" created`);
                setShowCreate(false);
                setNewName(''); setNewDesc('');
                await loadDecks();
            } else {
                toast.error('Failed to create deck');
            }
        } catch { toast.error('Error creating deck'); }
        finally { setLoading(false); }
    };

    // ── Delete deck ──
    const handleDeleteDeck = async (deckId: string) => {
        if (!confirm('Delete this deck and all its phrases?')) return;
        try {
            const res = await fetch(`/api/admin/decks/${deckId}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Deck deleted');
                setSelectedDeck(null);
                await loadDecks();
            }
        } catch { toast.error('Error deleting deck'); }
    };

    // ── Toggle deck status ──
    const handleToggleStatus = async (deck: Deck) => {
        const newStatus: DeckStatus = deck.status === 'active' ? 'draft' : 'active';
        try {
            await fetch(`/api/admin/decks/${deck.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            toast.success(`Deck ${newStatus === 'active' ? 'activated' : 'set to draft'}`);
            await loadDecks();
            if (selectedDeck?.id === deck.id) {
                setSelectedDeck({ ...deck, status: newStatus });
            }
        } catch { toast.error('Error updating status'); }
    };

    // ── Import phrases ──
    const handleImport = async () => {
        if (!selectedDeck || !importText.trim()) return;
        setImporting(true);
        try {
            const res = await fetch(`/api/admin/decks/${selectedDeck.id}/phrases`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phrases: importText.split('\n').map(l => l.trim()).filter(Boolean) }),
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(`Added ${data.added} phrases (${data.skipped} skipped)`);
                setImportText('');
                await loadPhrases(selectedDeck.id);
                await loadDecks();
            }
        } catch { toast.error('Error importing phrases'); }
        finally { setImporting(false); }
    };

    // ── Generate metadata ──
    const handleGenerateMetadata = async () => {
        if (!selectedDeck) return;
        setGeneratingMeta(true);
        try {
            const res = await fetch('/api/admin/deck-generate-metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deckId: selectedDeck.id }),
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(`Metadata: ${data.processed} processed, ${data.failed} failed`);
                await loadPhrases(selectedDeck.id);
            } else {
                toast.error('Metadata generation failed');
            }
        } catch { toast.error('Error generating metadata'); }
        finally { setGeneratingMeta(false); }
    };

    // ── Generate content ──
    const handleGenerateContent = async () => {
        if (!selectedDeck) return;
        setGeneratingContent(true);
        try {
            const res = await fetch('/api/admin/deck-generate-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deckId: selectedDeck.id, count: contentCount }),
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(`Generated ${data.generated} quotes/facts for "${data.deckName}"`);
            } else {
                toast.error('Content generation failed');
            }
        } catch { toast.error('Error generating content'); }
        finally { setGeneratingContent(false); }
    };

    // ── Delete phrase ──
    const handleDeletePhrase = async (phraseId: string) => {
        if (!selectedDeck) return;
        try {
            await fetch(`/api/admin/decks/${selectedDeck.id}/phrases/${phraseId}`, { method: 'DELETE' });
            toast.success('Phrase deleted');
            await loadPhrases(selectedDeck.id);
            await loadDecks();
        } catch { toast.error('Error deleting phrase'); }
    };

    // ── Deck detail view ──
    if (selectedDeck) {
        const pendingCount = phrases.filter(p => p.metadataStatus === 'pending').length;
        const generatedCount = phrases.filter(p => p.metadataStatus === 'generated').length;
        const failedCount = phrases.filter(p => p.metadataStatus === 'failed').length;

        return (
            <div className="space-y-6">
                {/* Back button + deck header */}
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedDeck(null); setPhrases([]); }}>
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <span className="text-2xl">{selectedDeck.icon}</span>
                    <div>
                        <h2 className="text-lg font-bold">{selectedDeck.name}</h2>
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                            <StatusBadge status={selectedDeck.status} />
                            <Badge variant="outline" className="text-[10px]">{selectedDeck.type}</Badge>
                        </div>
                    </div>
                    <div className="ml-auto flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleToggleStatus(selectedDeck)}>
                            {selectedDeck.status === 'active' ? 'Set Draft' : 'Activate'}
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteDeck(selectedDeck.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>

                {/* Import phrases */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Import Phrases</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Textarea
                            placeholder="One phrase per line, e.g.&#10;ubiquitous&#10;paradigm shift&#10;notwithstanding"
                            rows={5}
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                            className="font-mono text-sm"
                        />
                        <Button size="sm" onClick={handleImport} disabled={importing || !importText.trim()}>
                            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                            Import {importText.split('\n').filter(l => l.trim()).length} phrases
                        </Button>
                    </CardContent>
                </Card>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3">
                    <Button
                        onClick={handleGenerateMetadata}
                        disabled={generatingMeta || pendingCount === 0}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        {generatingMeta ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        Generate Metadata ({pendingCount} pending)
                    </Button>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={handleGenerateContent}
                            disabled={generatingContent}
                            className="bg-violet-600 hover:bg-violet-700 text-white"
                        >
                            {generatingContent ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BookOpen className="w-4 h-4 mr-2" />}
                            Generate Quotes & Facts
                        </Button>
                        <Input
                            type="number"
                            value={contentCount}
                            onChange={(e) => setContentCount(Math.max(1, Math.min(30, parseInt(e.target.value) || 10)))}
                            className="w-16 h-9 text-center"
                            min={1} max={30}
                        />
                    </div>
                </div>

                {/* Phrases table */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-3">
                            Phrases ({phrases.length})
                            <span className="text-xs font-normal text-neutral-400">
                                {generatedCount} done · {pendingCount} pending · {failedCount} failed
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {phrasesLoading ? (
                            <div className="flex items-center justify-center py-8 text-neutral-400">
                                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
                            </div>
                        ) : phrases.length === 0 ? (
                            <p className="text-sm text-neutral-400 py-4 text-center">No phrases yet. Import some above.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-neutral-200 text-left text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                            <th className="py-2 pr-3">Phrase</th>
                                            <th className="py-2 pr-3">Meaning</th>
                                            <th className="py-2 pr-3">POS</th>
                                            <th className="py-2 pr-3">Register</th>
                                            <th className="py-2 pr-3">Status</th>
                                            <th className="py-2 w-8"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {phrases.map(p => (
                                            <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                                                <td className="py-2 pr-3 font-medium">{p.phrase}</td>
                                                <td className="py-2 pr-3 text-neutral-500 max-w-[200px] truncate">{p.meaning || '—'}</td>
                                                <td className="py-2 pr-3 text-neutral-400 text-xs">{p.partOfSpeech || '—'}</td>
                                                <td className="py-2 pr-3 text-neutral-400 text-xs">
                                                    {typeof p.register === 'string' ? p.register : '—'}
                                                </td>
                                                <td className="py-2 pr-3"><StatusBadge status={p.metadataStatus} /></td>
                                                <td className="py-2">
                                                    <button onClick={() => handleDeletePhrase(p.id)} className="text-neutral-300 hover:text-red-500 transition-colors">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ── Deck list view ──
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Vocabulary Decks</h2>
                <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> New Deck
                </Button>
            </div>

            {/* Create form */}
            {showCreate && (
                <Card className="border-dashed border-2 border-indigo-200 bg-indigo-50/30">
                    <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Input placeholder="Deck name" value={newName} onChange={e => setNewName(e.target.value)} />
                            <select
                                value={newType}
                                onChange={e => setNewType(e.target.value as DeckType)}
                                className="border rounded-md px-3 py-2 text-sm bg-white"
                            >
                                <option value="linguistic">📝 Linguistic (phrase list)</option>
                                <option value="thematic">🎯 Thematic (topic-based)</option>
                            </select>
                        </div>
                        <Input placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
                        <div className="flex items-center gap-4">
                            <div className="flex gap-1">
                                {DECK_ICONS.slice(0, 8).map(icon => (
                                    <button
                                        key={icon}
                                        onClick={() => setNewIcon(icon)}
                                        className={`w-8 h-8 flex items-center justify-center rounded transition-all ${newIcon === icon ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'hover:bg-neutral-100'}`}
                                    >
                                        {icon}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-1">
                                {DECK_COLORS.slice(0, 6).map(color => (
                                    <button
                                        key={color}
                                        onClick={() => setNewColor(color)}
                                        className={`w-6 h-6 rounded-full transition-all ${newColor === color ? 'ring-2 ring-offset-2 ring-indigo-400' : ''}`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>Create Deck</Button>
                            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Deck list */}
            {loading ? (
                <div className="flex items-center justify-center py-12 text-neutral-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading decks...
                </div>
            ) : decks.length === 0 ? (
                <Card className="py-12">
                    <CardContent className="text-center text-neutral-400">
                        <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>No decks yet. Create your first vocabulary deck.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {decks.map(deck => (
                        <Card
                            key={deck.id}
                            className="cursor-pointer hover:shadow-md transition-all border-l-4 group"
                            style={{ borderLeftColor: deck.color || '#6366f1' }}
                            onClick={() => { setSelectedDeck(deck); loadPhrases(deck.id); }}
                        >
                            <CardContent className="pt-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">{deck.icon}</span>
                                        <div>
                                            <h3 className="font-semibold text-sm group-hover:text-indigo-600 transition-colors">{deck.name}</h3>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <Badge variant="outline" className="text-[9px] px-1.5">{deck.type}</Badge>
                                                <StatusBadge status={deck.status} />
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-xs text-neutral-400 font-mono">{deck.phraseCount || 0}</span>
                                </div>
                                {deck.description && (
                                    <p className="text-xs text-neutral-400 mt-2 line-clamp-2">{deck.description}</p>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
