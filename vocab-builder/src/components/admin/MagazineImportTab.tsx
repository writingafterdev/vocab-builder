'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Upload, Loader2, CheckCircle, AlertCircle, FileText, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

type JobStatus = 'queued' | 'extracting-text' | 'discovering' | 'processing' | 'saving' | 'done' | 'error';

interface JobState {
    id: string;
    status: JobStatus;
    progress: { current: number; total: number; currentTitle?: string };
    result?: { count: number; articles: { title: string; detectedTopic: string; sections: number }[] };
    error?: string;
}

const STATUS_LABELS: Record<JobStatus, string> = {
    queued:           'Queued…',
    'extracting-text':'Extracting text from PDF…',
    discovering:      'Identifying article boundaries…',
    processing:       'Cleaning & structuring articles…',
    saving:           'Saving to database…',
    done:             'Done!',
    error:            'Failed',
};

export function MagazineImportTab({ onSuccess }: { onSuccess?: () => void }) {
    const { user } = useAuth();
    const [file, setFile] = useState<File | null>(null);
    const [apiKey, setApiKey] = useState('');
    const [topic, setTopic] = useState('Technology');
    const [isUploading, setIsUploading] = useState(false);
    const [job, setJob] = useState<JobState | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Clean up polling on unmount
    useEffect(() => {
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    const startPolling = (jobId: string) => {
        if (pollRef.current) clearInterval(pollRef.current);

        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/admin/magazine-import?jobId=${jobId}`, {
                    headers: { 'x-user-email': user?.email || '' },
                });
                if (!res.ok) return;
                const data: JobState = await res.json();
                setJob(data);

                if (data.status === 'done' || data.status === 'error') {
                    clearInterval(pollRef.current!);
                    pollRef.current = null;
                    if (data.status === 'done' && onSuccess) onSuccess();
                }
            } catch {
                // Ignore transient network errors during polling
            }
        }, 2500);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFile(e.target.files[0]);
            setJob(null);
        }
    };

    const handleUpload = async () => {
        if (!apiKey.trim()) { alert('Please enter your Gemini API key'); return; }
        if (!file) { alert('Please select a PDF file'); return; }

        setIsUploading(true);
        setJob(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('apiKey', apiKey);
            formData.append('topic', topic);

            const res = await fetch('/api/admin/magazine-import', {
                method: 'POST',
                headers: { 'x-user-email': user?.email || '' },
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to start import');

            const { jobId } = data;
            setJob({ id: jobId, status: 'queued', progress: { current: 0, total: 0 } });
            setFile(null);
            setApiKey('');
            startPolling(jobId);
        } catch (err: any) {
            setJob({ id: '', status: 'error', error: err.message, progress: { current: 0, total: 0 } });
        } finally {
            setIsUploading(false);
        }
    };

    const isActive = isUploading || (job && job.status !== 'done' && job.status !== 'error');
    const fileSizeLabel = file ? (file.size / 1024 / 1024).toFixed(2) + ' MB' : 'Max size: 100MB';

    return (
        <Card className="border-neutral-200">
            <CardHeader className="bg-neutral-50/50 border-b border-neutral-100">
                <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-indigo-600" />
                    Magazine Bulk Import (AI parsing)
                </CardTitle>
                <CardDescription>
                    Upload a PDF magazine. Text is extracted directly from the PDF binary (all pages, no AI token limits), then Gemini cleans and structures each article in the background.
                    <span className="block mt-1 text-amber-600 text-xs font-medium">⚠ Images are not yet supported — text-only extraction.</span>
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Google Gemini API Key <span className="text-red-500">*</span></label>
                        <Input
                            type="password"
                            placeholder="AIzaSy..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            disabled={!!isActive}
                        />
                        <p className="text-xs text-neutral-500">Paste your Google AI Studio key. Rotate keys between imports to avoid rate limits.</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Fallback Topic</label>
                        <Input
                            placeholder="e.g. Technology, Science, Culture…"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            disabled={!!isActive}
                        />
                    </div>
                </div>

                <div className="space-y-2 border-2 border-dashed border-neutral-200 rounded-lg p-6 text-center hover:bg-neutral-50 transition-colors">
                    <input
                        type="file"
                        accept="application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                        id="magazine-upload"
                        disabled={!!isActive}
                    />
                    <label htmlFor="magazine-upload" className={`cursor-pointer flex flex-col items-center gap-2 ${isActive ? 'opacity-50 pointer-events-none' : ''}`}>
                        <Upload className="h-8 w-8 text-neutral-400" />
                        <span className="font-medium text-neutral-700">
                            {file ? file.name : 'Click to select PDF'}
                        </span>
                        <span className="text-sm text-neutral-500">{fileSizeLabel}</span>
                    </label>
                </div>

                {/* Job Progress */}
                {job && (
                    <div className={`p-4 rounded-lg border ${
                        job.status === 'done'  ? 'bg-green-50 border-green-200 text-green-900' :
                        job.status === 'error' ? 'bg-red-50 border-red-200 text-red-900' :
                        'bg-blue-50 border-blue-200 text-blue-900'
                    }`}>
                        <div className="flex items-start gap-3">
                            {job.status === 'done'  && <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />}
                            {job.status === 'error' && <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />}
                            {job.status !== 'done' && job.status !== 'error' && (
                                <RefreshCw className="h-5 w-5 text-blue-500 shrink-0 mt-0.5 animate-spin" />
                            )}

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-medium text-sm">{STATUS_LABELS[job.status]}</p>
                                    {job.status === 'processing' && job.progress.total > 0 && (
                                        <Badge variant="secondary" className="text-xs shrink-0">
                                            {job.progress.current}/{job.progress.total}
                                        </Badge>
                                    )}
                                </div>

                                {job.status === 'processing' && job.progress.currentTitle && (
                                    <p className="text-xs mt-1 truncate opacity-75">→ {job.progress.currentTitle}</p>
                                )}

                                {/* Progress bar */}
                                {job.status === 'processing' && job.progress.total > 0 && (
                                    <div className="mt-2 h-1.5 bg-blue-200 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                            style={{ width: `${(job.progress.current / job.progress.total) * 100}%` }}
                                        />
                                    </div>
                                )}

                                {job.status === 'error' && job.error && (
                                    <p className="text-xs mt-1 text-red-700">{job.error}</p>
                                )}

                                {job.status === 'done' && job.result && (
                                    <div className="mt-2">
                                        <p className="text-sm font-medium mb-1">
                                            Successfully imported {job.result.count} article{job.result.count !== 1 ? 's' : ''}
                                        </p>
                                        <ul className="text-sm space-y-1">
                                            {job.result.articles.map((a, i) => (
                                                <li key={i} className="flex items-center gap-2">
                                                    <span className="text-green-600">✓</span>
                                                    <span className="font-medium truncate">{a.title}</span>
                                                    <Badge variant="secondary" className="text-xs ml-auto shrink-0">
                                                        {a.sections} sections
                                                    </Badge>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <Button
                    onClick={handleUpload}
                    disabled={!file || !apiKey.trim() || !!isActive}
                    className="w-full gap-2"
                    size="lg"
                >
                    {isUploading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                    ) : (
                        <><Upload className="h-4 w-4" /> Extract & Import Magazine</>
                    )}
                </Button>

            </CardContent>
        </Card>
    );
}
