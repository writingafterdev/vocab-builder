'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, ArrowRight, ArrowLeft, Check, AlertTriangle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import {
    parseTextInput,
    parseCsvFile,
    deduplicateRows,
    markExistingDuplicates,
    getImportStats,
    type ImportRow,
} from '@/lib/import/parse-import';
import { getUserPhrases } from '@/lib/db/srs';

// ─── Step Indicator ───────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
    return (
        <div className="flex items-center gap-3">
            {Array.from({ length: total }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                    <div
                        className={`w-6 h-6 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider
                            ${i + 1 < current ? 'bg-neutral-900 text-white' : i + 1 === current ? 'border-2 border-neutral-900 text-neutral-900' : 'border border-neutral-200 text-neutral-300'}`}
                    >
                        {i + 1 < current ? <Check className="w-3 h-3" /> : i + 1}
                    </div>
                    {i < total - 1 && (
                        <div className={`w-8 h-px ${i + 1 < current ? 'bg-neutral-900' : 'bg-neutral-200'}`} />
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── Preview Table ────────────────────────────────────

function PreviewTable({ rows }: { rows: ImportRow[] }) {
    const displayRows = rows.slice(0, 200);

    return (
        <div className="border border-neutral-200 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[40px_1fr_1fr_100px] bg-neutral-50 border-b border-neutral-200">
                <div className="px-3 py-2 text-[9px] uppercase tracking-[0.12em] font-bold text-neutral-400">#</div>
                <div className="px-3 py-2 text-[9px] uppercase tracking-[0.12em] font-bold text-neutral-400 border-l border-neutral-200">Phrase</div>
                <div className="px-3 py-2 text-[9px] uppercase tracking-[0.12em] font-bold text-neutral-400 border-l border-neutral-200">Meaning</div>
                <div className="px-3 py-2 text-[9px] uppercase tracking-[0.12em] font-bold text-neutral-400 border-l border-neutral-200">Status</div>
            </div>

            {/* Rows */}
            <div className="max-h-[320px] overflow-y-auto">
                {displayRows.map((row, i) => (
                    <div
                        key={i}
                        className={`grid grid-cols-[40px_1fr_1fr_100px] border-b border-neutral-100 last:border-b-0
                            ${row.status === 'invalid' ? 'bg-red-50/50' : row.status === 'duplicate' ? 'bg-amber-50/50' : ''}`}
                    >
                        <div className="px-3 py-2.5 text-[11px] text-neutral-300 tabular-nums">{i + 1}</div>
                        <div className="px-3 py-2.5 text-[13px] text-neutral-900 font-medium border-l border-neutral-100 truncate">
                            {row.phrase || <span className="text-neutral-300 italic">—</span>}
                        </div>
                        <div className="px-3 py-2.5 text-[13px] text-neutral-500 border-l border-neutral-100 truncate italic"
                            style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                        >
                            {row.meaning || <span className="text-neutral-300">—</span>}
                        </div>
                        <div className="px-3 py-2.5 border-l border-neutral-100">
                            {row.status === 'valid' && (
                                <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] font-bold text-emerald-700 bg-emerald-100">
                                    ✓ Valid
                                </span>
                            )}
                            {row.status === 'duplicate' && (
                                <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] font-bold text-amber-700 bg-amber-100">
                                    ⚠ Dup
                                </span>
                            )}
                            {row.status === 'invalid' && (
                                <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] font-bold text-red-700 bg-red-100">
                                    ✗ {row.error || 'Invalid'}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Pace Selector ────────────────────────────────────

function PaceSelector({ pace, onChange }: { pace: number; onChange: (p: number) => void }) {
    const options = [5, 10, 15];

    return (
        <div className="flex gap-2">
            {options.map(p => (
                <button
                    key={p}
                    onClick={() => onChange(p)}
                    className={`w-14 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors
                        ${pace === p
                            ? 'bg-neutral-900 text-white'
                            : 'border border-neutral-200 text-neutral-400 hover:border-neutral-900 hover:text-neutral-900'
                        }`}
                >
                    {p}
                </button>
            ))}
        </div>
    );
}

// ─── Main Modal ───────────────────────────────────────

interface ImportVocabModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: () => void;
}

export default function ImportVocabModal({
    isOpen,
    onClose,
    onImportComplete,
}: ImportVocabModalProps) {
    const { user } = useAuth();
    const [step, setStep] = useState(1);
    const [inputMode, setInputMode] = useState<'paste' | 'upload'>('paste');
    const [textInput, setTextInput] = useState('');
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [dripPace, setDripPace] = useState(10);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{
        imported: number;
        skipped: number;
        daysToComplete: number;
    } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset state when modal opens/closes
    const handleClose = useCallback(() => {
        setStep(1);
        setTextInput('');
        setFileName('');
        setRows([]);
        setDripPace(10);
        setImporting(false);
        setImportResult(null);
        onClose();
    }, [onClose]);

    // ─── Step 1: Parse input ───
    const handleParseText = useCallback(async () => {
        const parsed = parseTextInput(textInput);
        if (parsed.length === 0) {
            toast.error('No phrases detected. Check your format.');
            return;
        }

        // Dedup within batch
        let processed = deduplicateRows(parsed);

        // Dedup against existing phrases
        if (user?.$id) {
            try {
                const existing = await getUserPhrases(user.$id, 5000);
                const existingBaseForms = new Set(
                    existing.map(p => ((p as any).baseForm || p.phrase || '').toLowerCase())
                );
                processed = markExistingDuplicates(processed, existingBaseForms);
            } catch (e) {
                console.warn('Could not check existing phrases for dedup:', e);
            }
        }

        setRows(processed);
        setStep(2);
    }, [textInput, user?.$id]);

    const handleFileUpload = useCallback(async (file: File) => {
        setFileName(file.name);
        try {
            const parsed = await parseCsvFile(file);
            if (parsed.length === 0) {
                toast.error('No phrases found in file.');
                return;
            }

            let processed = deduplicateRows(parsed);

            if (user?.$id) {
                try {
                    const existing = await getUserPhrases(user.$id, 5000);
                    const existingBaseForms = new Set(
                        existing.map(p => ((p as any).baseForm || p.phrase || '').toLowerCase())
                    );
                    processed = markExistingDuplicates(processed, existingBaseForms);
                } catch (e) {
                    console.warn('Could not check existing phrases for dedup:', e);
                }
            }

            setRows(processed);
            setStep(2);
        } catch (e) {
            toast.error('Failed to parse file.');
        }
    }, [user?.$id]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    }, [handleFileUpload]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileUpload(file);
    }, [handleFileUpload]);

    // ─── Stats ───
    const stats = useMemo(() => getImportStats(rows), [rows]);

    // ─── Step 3: Import ───
    const handleImport = useCallback(async () => {
        if (!user?.$id || stats.valid === 0) return;

        setImporting(true);
        try {
            const validPhrases = rows
                .filter(r => r.status === 'valid')
                .map(r => ({ phrase: r.phrase, meaning: r.meaning, context: r.context }));

            const token = await user.getJwt();
            const res = await fetch('/api/user/import-phrases', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-user-id': user.$id,
                },
                body: JSON.stringify({
                    phrases: validPhrases,
                    dripPace,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Import failed');
                setImporting(false);
                return;
            }

            setImportResult({
                imported: data.imported,
                skipped: data.skipped,
                daysToComplete: data.daysToComplete,
            });
            setStep(4); // Success state
            onImportComplete();
        } catch (e) {
            toast.error('Import failed. Please try again.');
        } finally {
            setImporting(false);
        }
    }, [user, rows, stats.valid, dripPace, onImportComplete]);

    if (!isOpen) return null;

    const slideVariants = {
        enter: (direction: number) => ({ x: direction > 0 ? 100 : -100, opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (direction: number) => ({ x: direction > 0 ? -100 : 100, opacity: 0 }),
    };

    return (
        <div className="fixed inset-0 z-[100]">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-neutral-900/50 backdrop-blur-sm" onClick={handleClose} />

            {/* Modal */}
            <div className="fixed inset-0 z-10 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4" onClick={handleClose}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 8 }}
                        className="relative w-full max-w-2xl bg-white shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-8 pt-8 pb-0 flex items-start justify-between">
                            <div>
                                <h2
                                    className="text-[36px] font-normal text-neutral-900 leading-none tracking-tight"
                                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                >
                                    Import Vocabulary.
                                </h2>
                                {step < 4 && (
                                    <p className="text-[11px] text-neutral-400 tracking-[0.1em] uppercase font-bold mt-2">
                                        Step {step} of 3 ·{' '}
                                        {step === 1 ? 'Input' : step === 2 ? 'Preview' : 'Configure'}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-4">
                                {step < 4 && <StepIndicator current={step} total={3} />}
                                <button onClick={handleClose} className="p-2 text-neutral-300 hover:text-neutral-900 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="px-8 pt-6 pb-8 min-h-[400px]">
                            <AnimatePresence mode="wait" custom={step}>
                                {/* ─── Step 1: Input ─── */}
                                {step === 1 && (
                                    <motion.div
                                        key="step1"
                                        custom={1}
                                        variants={slideVariants}
                                        initial="enter"
                                        animate="center"
                                        exit="exit"
                                        transition={{ duration: 0.2 }}
                                    >
                                        {/* Tab bar */}
                                        <div className="flex border-b border-neutral-200 mb-6">
                                            <button
                                                onClick={() => setInputMode('paste')}
                                                className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] border-b-2 transition-colors
                                                    ${inputMode === 'paste'
                                                        ? 'border-neutral-900 text-neutral-900'
                                                        : 'border-transparent text-neutral-400 hover:text-neutral-600'
                                                    }`}
                                            >
                                                Paste Text
                                            </button>
                                            <button
                                                onClick={() => setInputMode('upload')}
                                                className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] border-b-2 transition-colors
                                                    ${inputMode === 'upload'
                                                        ? 'border-neutral-900 text-neutral-900'
                                                        : 'border-transparent text-neutral-400 hover:text-neutral-600'
                                                    }`}
                                            >
                                                Upload File
                                            </button>
                                        </div>

                                        {inputMode === 'paste' ? (
                                            <div>
                                                <textarea
                                                    value={textInput}
                                                    onChange={(e) => setTextInput(e.target.value)}
                                                    placeholder={`break the ice | to initiate conversation in an awkward situation\nhit the ground running | to start something with immediate effort\nspill the beans | to reveal a secret`}
                                                    className="w-full h-48 p-4 border border-neutral-200 text-sm text-neutral-800 placeholder:text-neutral-300 focus:outline-none focus:border-neutral-900 resize-none font-mono"
                                                    autoFocus
                                                />
                                                <p className="text-[11px] text-neutral-400 mt-2">
                                                    One phrase per line. Format: <span className="font-mono text-neutral-500">phrase | meaning</span>
                                                    {' '}— also supports tab or comma as delimiter.
                                                </p>
                                            </div>
                                        ) : (
                                            <div
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={handleDrop}
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-full h-48 border-2 border-dashed border-neutral-200 hover:border-neutral-400 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors"
                                            >
                                                {fileName ? (
                                                    <>
                                                        <FileText className="w-8 h-8 text-neutral-400" />
                                                        <p className="text-sm font-medium text-neutral-700">{fileName}</p>
                                                        <p className="text-[11px] text-neutral-400">Click to change file</p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload className="w-8 h-8 text-neutral-300" />
                                                        <p className="text-sm text-neutral-400">
                                                            Drop a <span className="font-mono">.csv</span>, <span className="font-mono">.tsv</span>, or <span className="font-mono">.txt</span> file here
                                                        </p>
                                                        <p className="text-[11px] text-neutral-300">or click to browse</p>
                                                    </>
                                                )}
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept=".csv,.tsv,.txt"
                                                    onChange={handleFileInput}
                                                    className="hidden"
                                                />
                                            </div>
                                        )}

                                        {/* Continue button */}
                                        <div className="flex justify-end mt-6">
                                            <button
                                                onClick={inputMode === 'paste' ? handleParseText : undefined}
                                                disabled={inputMode === 'paste' && !textInput.trim()}
                                                className="px-6 py-3 bg-neutral-900 text-white text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                            >
                                                Continue
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </motion.div>
                                )}

                                {/* ─── Step 2: Preview ─── */}
                                {step === 2 && (
                                    <motion.div
                                        key="step2"
                                        custom={2}
                                        variants={slideVariants}
                                        initial="enter"
                                        animate="center"
                                        exit="exit"
                                        transition={{ duration: 0.2 }}
                                    >
                                        <PreviewTable rows={rows} />

                                        {/* Stats footer */}
                                        <div className="flex items-center gap-4 mt-4 text-[11px] font-bold uppercase tracking-[0.08em]">
                                            <span className="text-emerald-600">{stats.valid} Valid</span>
                                            {stats.duplicates > 0 && (
                                                <span className="text-amber-600">{stats.duplicates} Duplicates</span>
                                            )}
                                            {stats.invalid > 0 && (
                                                <span className="text-red-500">{stats.invalid} Invalid</span>
                                            )}
                                        </div>

                                        {stats.valid === 0 && (
                                            <div className="flex items-start gap-2 mt-4 p-3 bg-red-50 border border-red-200">
                                                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                                <p className="text-xs text-red-700">
                                                    No valid phrases found. Check your format: each line needs both a phrase and a meaning, separated by a pipe (|), tab, or comma.
                                                </p>
                                            </div>
                                        )}

                                        {/* Navigation */}
                                        <div className="flex justify-between mt-6">
                                            <button
                                                onClick={() => setStep(1)}
                                                className="px-5 py-3 border border-neutral-200 text-neutral-500 text-[11px] font-bold uppercase tracking-[0.1em] hover:border-neutral-900 hover:text-neutral-900 transition-colors flex items-center gap-2"
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5" />
                                                Back
                                            </button>
                                            <button
                                                onClick={() => setStep(3)}
                                                disabled={stats.valid === 0}
                                                className="px-6 py-3 bg-neutral-900 text-white text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                            >
                                                Continue
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </motion.div>
                                )}

                                {/* ─── Step 3: Configure ─── */}
                                {step === 3 && (
                                    <motion.div
                                        key="step3"
                                        custom={3}
                                        variants={slideVariants}
                                        initial="enter"
                                        animate="center"
                                        exit="exit"
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div className="space-y-6">
                                            {/* Pace selector */}
                                            <div>
                                                <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-400 font-bold block mb-3">
                                                    How many new words per day?
                                                </label>
                                                <PaceSelector pace={dripPace} onChange={setDripPace} />
                                            </div>

                                            {/* Timeline visualization */}
                                            <div className="border border-neutral-200 p-5">
                                                <div className="flex items-baseline gap-2 mb-3">
                                                    <span
                                                        className="text-[28px] font-normal text-neutral-900 tracking-tight"
                                                        style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                                    >
                                                        {Math.ceil(stats.valid / dripPace)}
                                                    </span>
                                                    <span className="text-sm text-neutral-400 italic" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                                                        days to complete
                                                    </span>
                                                </div>

                                                <p className="text-xs text-neutral-500 mb-4">
                                                    {stats.valid} phrases ÷ {dripPace}/day = {Math.ceil(stats.valid / dripPace)} days
                                                </p>

                                                {/* Progress bar */}
                                                <div className="w-full h-2 bg-neutral-100 overflow-hidden">
                                                    <motion.div
                                                        className="h-full bg-neutral-900"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${Math.min(100, (dripPace / stats.valid) * 100)}%` }}
                                                        transition={{ duration: 0.4 }}
                                                    />
                                                </div>
                                                <div className="flex justify-between mt-1.5 text-[10px] text-neutral-400">
                                                    <span>Day 1: {Math.min(dripPace, stats.valid)} due</span>
                                                    <span>Day {Math.ceil(stats.valid / dripPace)}: all absorbed</span>
                                                </div>

                                                {/* Info notes */}
                                                <div className="mt-5 space-y-1.5 text-[11px] text-neutral-400">
                                                    <p>· Topics, register, and variants will be enriched automatically.</p>
                                                    <p>· First batch of {Math.min(dripPace, stats.valid)} phrases ready for review tomorrow.</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Navigation */}
                                        <div className="flex justify-between mt-6">
                                            <button
                                                onClick={() => setStep(2)}
                                                className="px-5 py-3 border border-neutral-200 text-neutral-500 text-[11px] font-bold uppercase tracking-[0.1em] hover:border-neutral-900 hover:text-neutral-900 transition-colors flex items-center gap-2"
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5" />
                                                Back
                                            </button>
                                            <button
                                                onClick={handleImport}
                                                disabled={importing}
                                                className="px-6 py-3 bg-neutral-900 text-white text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-neutral-800 disabled:opacity-50 transition-colors flex items-center gap-2"
                                            >
                                                {importing ? (
                                                    <>
                                                        <EditorialLoader size="sm" />
                                                        <span>Importing...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        Import {stats.valid} Phrases
                                                        <ArrowRight className="w-3.5 h-3.5" />
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </motion.div>
                                )}

                                {/* ─── Step 4: Success ─── */}
                                {step === 4 && importResult && (
                                    <motion.div
                                        key="step4"
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex flex-col items-center justify-center py-8"
                                    >
                                        <div className="w-14 h-14 bg-emerald-600 flex items-center justify-center mb-6">
                                            <Check className="w-7 h-7 text-white" />
                                        </div>

                                        <h3
                                            className="text-[28px] font-normal text-neutral-900 tracking-tight text-center"
                                            style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                                        >
                                            {importResult.imported} phrases imported.
                                        </h3>

                                        <p className="text-sm text-neutral-400 mt-2 text-center max-w-sm">
                                            First {Math.min(dripPace, importResult.imported)} ready for review tomorrow.
                                            {importResult.daysToComplete > 1 && ` All absorbed in ${importResult.daysToComplete} days.`}
                                        </p>

                                        {importResult.skipped > 0 && (
                                            <p className="text-[11px] text-amber-600 mt-3">
                                                {importResult.skipped} duplicate{importResult.skipped !== 1 ? 's' : ''} skipped.
                                            </p>
                                        )}

                                        <div className="mt-3 text-[11px] text-neutral-400 italic">
                                            Enrichment processing in background...
                                        </div>

                                        <button
                                            onClick={handleClose}
                                            className="mt-8 px-6 py-3 bg-neutral-900 text-white text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-neutral-800 transition-colors"
                                        >
                                            View in Glossary
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
