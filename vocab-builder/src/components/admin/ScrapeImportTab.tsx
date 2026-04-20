'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SOURCE_CATALOG } from '@/lib/source-catalog';
import { CheckCircle, Download, RefreshCw, AlertCircle, Link as LinkIcon, CheckSquare, Square, FileText, Rss, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface DiscoveredLink {
    url: string;
    sourceId: string;
}

interface ScrapedArticle {
    url: string;
    title: string;
    markdown: string;
    status: 'success' | 'error';
    error?: string;
    sourceId: string;
}

interface ActiveBatch {
    id: string;
    state: string;
    completedCount: number;
    requestCount: number;
    localUrlsMap: Record<string, any>;
    createdAt: number;
    failedCount?: number;
}

const matchSource = (url: string, forceSourceId?: string): string | null => {
    if (forceSourceId) return forceSourceId;
    const lUrl = url.toLowerCase();
    if (lUrl.includes('newyorker.com')) return 'the-new-yorker';
    if (lUrl.includes('theatlantic.com')) return 'the-atlantic';
    if (lUrl.includes('aeon.co')) return 'aeon';
    return null;
};

export function ScrapeImportTab({ onImportComplete, forceSourceId }: { onImportComplete: () => void, forceSourceId?: string }) {
    const { user } = useAuth();
    
    // Batch Tracker
    const [activeBatches, setActiveBatches] = useState<ActiveBatch[]>([]);

    // AutoSync Log
    const [autoSyncLog, setAutoSyncLog] = useState<string[]>([]);
    const [isAutoSyncing, setIsAutoSyncing] = useState(false);
    
    // Step 1: Discovery Phase
    const [rootUrlsStr, setRootUrlsStr] = useState('');
    const [discovering, setDiscovering] = useState(false);
    const [discoveredLinks, setDiscoveredLinks] = useState<DiscoveredLink[]>([]);
    const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
    
    // Step 2: Extract Phase (Raw)
    const [extracting, setExtracting] = useState(false);
    const [scrapedArticles, setScrapedArticles] = useState<ScrapedArticle[]>([]);
    const [selectedArticleIndex, setSelectedArticleIndex] = useState<number>(0);

    // Step 3: Process Phase (AI & Save)
    const [processing, setProcessing] = useState(false);
    const [extractResult, setExtractResult] = useState<{ success: number; errors: any[], isBatch?: boolean, message?: string } | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    const dedicatedSourceDef = forceSourceId ? SOURCE_CATALOG.find(s => s.id === forceSourceId) : null;
    const [selectedRssFeed, setSelectedRssFeed] = useState<string>('');
    const [manualMode, setManualMode] = useState(!dedicatedSourceDef?.autoSync);

    useEffect(() => {
        if (dedicatedSourceDef?.rssFeeds) {
            setSelectedRssFeed(Object.values(dedicatedSourceDef.rssFeeds)[0]);
        }
    }, [dedicatedSourceDef]);

    // Load Batches from LocalStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('gemini_batches');
            if (saved) {
                setActiveBatches(JSON.parse(saved));
            }
        } catch (e) {
            console.error("Failed to load batches", e);
        }
    }, []);

    // Save Batches to LocalStorage
    useEffect(() => {
        localStorage.setItem('gemini_batches', JSON.stringify(activeBatches));
    }, [activeBatches]);

    // Polling Batches
    useEffect(() => {
        const activeIds = activeBatches.filter(b => !['SUCCEEDED', 'FAILED', 'PARTIALLY_SUCCEEDED', 'COLLECTED'].includes(b.state)).map(b => b.id);
        if (activeIds.length === 0) return;

        const interval = setInterval(async () => {
            const updatedBatches = [...activeBatches];
            let changed = false;

            for (const batch of updatedBatches) {
                if (['SUCCEEDED', 'FAILED', 'PARTIALLY_SUCCEEDED', 'COLLECTED'].includes(batch.state)) continue;

                try {
                    const res = await fetch(`/api/admin/scrape-process/status?batchId=${batch.id}`, {
                        headers: { 'x-user-email': user?.email || '' }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.status !== batch.state || data.completedCount !== batch.completedCount) {
                            batch.state = data.status || batch.state;
                            batch.completedCount = data.completedCount || 0;
                            batch.failedCount = data.failedCount || 0;
                            changed = true;
                        }
                    }
                } catch (e) {}
            }

            if (changed) setActiveBatches([...updatedBatches]);
        }, 10000);

        return () => clearInterval(interval);
    }, [activeBatches, user?.email]);

    const handleCollectBatch = async (batchId: string, localMap: any) => {
        try {
            setErrorMsg('');
            // Mark as collected while fetching to UI block it
            setActiveBatches(batches => batches.map(b => b.id === batchId ? { ...b, state: 'COLLECTING...' } : b));
            
            const res = await fetch('/api/admin/scrape-process/collect', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-email': user?.email || '' 
                },
                body: JSON.stringify({ batchId, localUrlsMap: localMap })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Failed to collect batch');

            setActiveBatches(batches => batches.map(b => b.id === batchId ? { ...b, state: 'COLLECTED', completedCount: data.totalProcessed } : b));
            onImportComplete();
        } catch (e) {
            // Revert state on error
            setActiveBatches(batches => batches.map(b => b.id === batchId ? { ...b, state: 'SUCCEEDED' } : b));
            setErrorMsg(e instanceof Error ? e.message : 'Collect Error');
        }
    };

    const runAutoSync = async () => {
        setIsAutoSyncing(true);
        setAutoSyncLog(["Starting Global Auto-Sync Sequence..."]);
        const addLog = (msg: string) => setAutoSyncLog(prev => [...prev, msg]);

        try {
            // 1. REDDIT SYNC
            addLog("Executing Dedicated Reddit Importer API...");
            const redRes = await fetch('/api/admin/reddit-sync', {
                method: 'POST',
                headers: { 'x-user-email': user?.email || '' }
            });
            const redData = await redRes.json();
            if (redRes.ok) {
                addLog(`✅ Reddit Sync Complete: Saved ${redData.count} posts dynamically.`);
                onImportComplete();
            } else {
                addLog(`❌ Reddit Sync Failed: ${redData.error}`);
            }

            // 2. DISCOVER STATIC MAGAZINES
            addLog("Discovering new magazine links...");
            const toSync = SOURCE_CATALOG.filter(s => s.autoSync && s.rssFeeds);
            const discoveredUrls: DiscoveredLink[] = [];

            for (const source of toSync) {
                if (source.rssFeeds) {
                    for (const feedUrl of Object.values(source.rssFeeds)) {
                        addLog(`Fetching RSS for ${source.label}...`);
                        const res = await fetch('/api/admin/scrape-discover', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
                            body: JSON.stringify({ rootUrl: feedUrl, sourceId: source.id })
                        });
                        const data = await res.json();
                        if (res.ok && data.links) {
                            data.links.slice(0, 5).forEach((url: string) => {
                                discoveredUrls.push({ url, sourceId: source.id });
                            });
                        }
                    }
                }
            }

            if (discoveredUrls.length === 0) {
                addLog("✅ No new magazine links found capable of processing.");
                setIsAutoSyncing(false);
                return;
            }

            // 3. SCRAPE RAW
            addLog(`Scraping raw markdown for ${discoveredUrls.length} links...`);
            let allScraped: ScrapedArticle[] = [];
            const groupedSrcs = discoveredUrls.reduce((acc, curr) => {
                if (!acc[curr.sourceId]) acc[curr.sourceId] = [];
                acc[curr.sourceId].push(curr.url);
                return acc;
            }, {} as Record<string, string[]>);

            for (const [src, links] of Object.entries(groupedSrcs)) {
                addLog(`Pulling ${src} markdown...`);
                const sRes = await fetch('/api/admin/scrape-raw', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
                    body: JSON.stringify({ urls: links, sourceId: src })
                });
                if (sRes.ok) {
                    const sData = await sRes.json();
                    if (sData.results) {
                        allScraped.push(...sData.results.map((r:any) => ({...r, sourceId: src})));
                    }
                }
            }
            
            const validArticles = allScraped.filter(a => a.status === 'success');
            if (validArticles.length === 0) {
                addLog("✅ Scraping resulted in 0 valid articles. Finishing.");
                setIsAutoSyncing(false);
                return;
            }

            // 4. SUBMIT BATCH JOB
            addLog(`Submitting Gemini Batch Job for ${validArticles.length} clean articles...`);
            const pRes = await fetch('/api/admin/scrape-process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
                body: JSON.stringify({ articles: validArticles, sourceId: 'unified', section: '' })
            });

            const pData = await pRes.json();
            if (pRes.ok) {
                addLog(`✅ Gemini Batch Job ${pData.batchId} submitted successfully!`);
                
                const localUrlsMap: Record<string, any> = {};
                validArticles.forEach((a, i) => {
                    localUrlsMap[`article-${i}`] = { url: a.url, title: a.title, sourceId: a.sourceId, section: '' };
                });
                const newBatch: ActiveBatch = {
                    id: pData.batchId,
                    state: 'PROCESSING',
                    completedCount: 0,
                    requestCount: pData.totalProcessed,
                    localUrlsMap,
                    createdAt: Date.now()
                };
                setActiveBatches(b => [...b, newBatch]);
                addLog("🎉 Global Auto-Sync sequence successfully queued in background!");
            } else {
                throw new Error("Batch job submission failed: " + pData.error);
            }
        } catch (err: any) {
             addLog(`❌ Critical Error: ${err.message}`);
        } finally {
            setIsAutoSyncing(false);
        }
    };

    const handleDiscover = async (overrideUrl?: string) => {
        const targetUrlStr = typeof overrideUrl === 'string' ? overrideUrl : rootUrlsStr;
        if (!targetUrlStr.trim()) return;
        setDiscovering(true);
        setErrorMsg('');
        setDiscoveredLinks([]);
        setSelectedLinks(new Set());
        setScrapedArticles([]);
        setExtractResult(null);

        try {
            const lines = targetUrlStr.split('\n').map(u => u.trim()).filter(Boolean);
            const mapping = lines.map(u => ({ url: u, sourceId: matchSource(u, forceSourceId) }));
            
            const validTargets = mapping.filter(m => !!m.sourceId) as { url: string; sourceId: string }[];
            if (validTargets.length === 0) {
                throw new Error("No parsable sources found in the provided URLs.");
            }

            const responses = await Promise.all(validTargets.map(async (target) => {
                const res = await fetch('/api/admin/scrape-discover', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
                    body: JSON.stringify({ rootUrl: target.url, sourceId: target.sourceId })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(`${target.url}: ${data.error || 'Failed'}`);
                
                const childLinks = data.links || [];
                return childLinks.map((l: string) => ({ url: l, sourceId: target.sourceId }));
            }));
            
            const allLinksFlat = responses.flat() as DiscoveredLink[];
            
            const uniqueMap = new Map<string, DiscoveredLink>();
            for (const link of allLinksFlat) {
                if (!uniqueMap.has(link.url)) uniqueMap.set(link.url, link);
            }
            const uniqueLinks = Array.from(uniqueMap.values());

            setDiscoveredLinks(uniqueLinks);
            setSelectedLinks(new Set(uniqueLinks.map(l => l.url)));
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setDiscovering(false);
        }
    };

    const handleScrapeRaw = async () => {
        if (selectedLinks.size === 0) return;
        setExtracting(true);
        setErrorMsg('');
        setExtractResult(null);
        setScrapedArticles([]);

        try {
            const urlsToScrape = Array.from(selectedLinks)
                .map(url => discoveredLinks.find(l => l.url === url))
                .filter(l => !!l) as DiscoveredLink[];

            const grouped = urlsToScrape.reduce((acc, curr) => {
                if (!acc[curr.sourceId]) acc[curr.sourceId] = [];
                acc[curr.sourceId].push(curr.url);
                return acc;
            }, {} as Record<string, string[]>);

            const responses = await Promise.all(Object.entries(grouped).map(async ([sourceId, urls]) => {
                const res = await fetch('/api/admin/scrape-raw', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
                    body: JSON.stringify({ urls, sourceId })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(`${sourceId}: ${data.error || 'Failed'}`);
                return (data.results || []).map((r: any) => ({ ...r, sourceId }));
            }));
            
            const allExtracted = responses.flat() as ScrapedArticle[];
            
            setScrapedArticles(allExtracted);
            setSelectedArticleIndex(0);
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setExtracting(false);
        }
    };

    const handleProcess = async () => {
        if (scrapedArticles.length === 0) return;
        setProcessing(true);
        setErrorMsg('');

        try {
            const validArticles = scrapedArticles.filter(a => a.status === 'success');
            
            const res = await fetch('/api/admin/scrape-process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-email': user?.email || '' },
                body: JSON.stringify({ articles: validArticles, sourceId: 'unified', section: '' })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(`Batch Submit Error: ${data.error}`);

            const localUrlsMap: Record<string, any> = {};
            validArticles.forEach((a, i) => {
                localUrlsMap[`article-${i}`] = { url: a.url, title: a.title, sourceId: a.sourceId, section: '' };
            });

            const newBatch: ActiveBatch = {
                id: data.batchId,
                state: 'PROCESSING',
                completedCount: 0,
                requestCount: data.totalProcessed,
                localUrlsMap,
                createdAt: Date.now()
            };

            setActiveBatches(b => [...b, newBatch]);

            setExtractResult({ 
                success: 0, 
                errors: [], 
                isBatch: true,
                message: `Batch ${data.batchId} submitted! Monitor the Active Batches tracker above.`
            });
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setProcessing(false);
        }
    };

    const updateCurrentArticleMarkdown = (newMarkdown: string) => {
        const next = [...scrapedArticles];
        next[selectedArticleIndex] = { ...next[selectedArticleIndex], markdown: newMarkdown };
        setScrapedArticles(next);
    };

    const toggleLink = (link: string) => {
        const next = new Set(selectedLinks);
        if (next.has(link)) next.delete(link);
        else next.add(link);
        setSelectedLinks(next);
    };

    const toggleAll = () => {
        if (selectedLinks.size === discoveredLinks.length) {
            setSelectedLinks(new Set());
        } else {
            setSelectedLinks(new Set(discoveredLinks.map(l => l.url)));
        }
    };

    const clearBatch = (id: string) => {
        setActiveBatches(b => b.filter(x => x.id !== id));
    };

    return (
        <div className="space-y-6">
            
            {/* GLOBAL AUTO-SYNC SECTION */}
            {!forceSourceId && (
                <Card className="border-blue-200 shadow-md">
                    <CardHeader className="bg-blue-50/50 pb-4 border-b border-blue-100">
                        <CardTitle className="flex items-center gap-2 text-blue-900">
                            <Zap className="h-5 w-5 text-blue-600" />
                            Global Auto-Sync Orchestrator
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <p className="text-sm text-neutral-600">
                            This super-command executes a multi-phase background sync: it pulls directly from Reddit APIs, discovers RSS feeds across all valid magazines, extracts markdown, and queues the articles into <strong>Google Gemini Batch Models</strong> to save your daily limits.
                        </p>
                        
                        <Button 
                            onClick={runAutoSync}
                            disabled={isAutoSyncing}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm font-semibold h-12"
                        >
                            {isAutoSyncing ? <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> : <Zap className="mr-2 h-5 w-5 fill-current" />}
                            ⚡ AUTO-SYNC THE WORLD
                        </Button>

                        {autoSyncLog.length > 0 && (
                            <div className="mt-4 p-4 bg-gray-900 text-green-400 font-mono text-xs rounded-md h-[150px] overflow-y-auto">
                                {autoSyncLog.map((log, i) => <div key={i}>{log}</div>)}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* BATCH PROGRESS UI */}
            {activeBatches.length > 0 && (
                <Card className="border-indigo-200 shadow-sm animate-in fade-in">
                    <CardHeader className="bg-indigo-50/50 pb-3 border-b border-indigo-100">
                        <CardTitle className="text-base text-indigo-900 flex items-center gap-2">
                            Active Processing Batches
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 divide-y divide-indigo-100">
                        {activeBatches.map(batch => (
                            <div key={batch.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1 w-full max-w-sm">
                                    <div className="text-xs text-neutral-500 font-mono truncate" title={batch.id}>{batch.id}</div>
                                    <div className="flex items-center justify-between">
                                        <span className={`text-sm font-semibold ${batch.state === 'SUCCEEDED' ? 'text-green-600' : batch.state === 'FAILED' ? 'text-red-600' : 'text-blue-600'}`}>
                                            Status: {batch.state}
                                        </span>
                                        <span className="text-xs font-medium bg-neutral-100 px-2 py-0.5 rounded-full">
                                            {batch.completedCount} / {batch.requestCount} processed
                                        </span>
                                    </div>
                                    {/* Progress Bar */}
                                    <div className="w-full bg-neutral-200 rounded-full h-1.5 mt-2 overflow-hidden">
                                        <div 
                                            className={`h-1.5 rounded-full transition-all duration-500 ${batch.state === 'SUCCEEDED' ? 'bg-green-500' : batch.state === 'FAILED' ? 'bg-red-500' : 'bg-indigo-600'}`} 
                                            style={{ width: `${batch.requestCount > 0 ? (batch.completedCount / batch.requestCount) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {['SUCCEEDED', 'PARTIALLY_SUCCEEDED'].includes(batch.state) && (
                                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleCollectBatch(batch.id, batch.localUrlsMap)}>
                                            <Download className="h-4 w-4 mr-2" /> Download & Save
                                        </Button>
                                    )}
                                    {batch.state === 'COLLECTED' && (
                                        <span className="text-sm font-semibold text-green-600 px-2"><CheckCircle className="inline h-4 w-4 mr-1" /> Saved!</span>
                                    )}
                                    <Button size="sm" variant="ghost" className="text-neutral-400 hover:text-red-500" onClick={() => clearBatch(batch.id)}>
                                        Hide
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Download className="h-5 w-5" />
                        {dedicatedSourceDef ? `${dedicatedSourceDef.label} Importer` : 'Unified Multi-Source Importer'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    
                    {errorMsg && (
                        <div className="p-3 bg-red-50 text-red-700 rounded text-sm flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {errorMsg}
                        </div>
                    )}

                    <div className="space-y-4">
                        <h3 className="font-semibold border-b pb-2">Step 1: Discover Links</h3>
                        
                        {dedicatedSourceDef?.autoSync && dedicatedSourceDef.rssFeeds && (
                            <div className="space-y-3 bg-blue-50/50 p-4 rounded-lg border border-blue-100 mb-2">
                                <p className="text-sm text-neutral-600">
                                    <strong>Auto-Sync</strong>: Select a feed to automatically find the latest articles.
                                </p>
                                <div className="flex flex-col gap-2">
                                    <select 
                                        className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm transition-colors cursor-pointer"
                                        value={selectedRssFeed}
                                        onChange={(e) => setSelectedRssFeed(e.target.value)}
                                        disabled={discovering || extracting || processing}
                                    >
                                        {Object.entries(dedicatedSourceDef.rssFeeds).map(([key, url]) => (
                                            <option key={key} value={url}>{key.charAt(0).toUpperCase() + key.slice(1)} Feed</option>
                                        ))}
                                    </select>
                                    <Button 
                                        onClick={() => handleDiscover(selectedRssFeed)}
                                        disabled={discovering || extracting || processing || !selectedRssFeed}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                        {discovering ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Rss className="h-4 w-4 mr-2" />}
                                        Discover Latest from RSS
                                    </Button>
                                </div>
                                <div className="pt-3 border-t border-blue-100 flex justify-between items-center text-xs text-neutral-500">
                                    <span>Need to import older articles?</span>
                                    <Button variant="ghost" size="sm" onClick={() => setManualMode(!manualMode)} className="h-6">
                                        {manualMode ? 'Hide Manual Entry' : 'Manual Entry'}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {(!dedicatedSourceDef?.autoSync || manualMode) && (
                            <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                                <p className="text-sm text-neutral-500">
                                    {dedicatedSourceDef 
                                        ? `Paste multiple ${dedicatedSourceDef.label} URLs (one URL per line).`
                                        : `Paste multiple edition URLs from different sources (one URL per line). The source logic will be auto-detected.`}
                                </p>
                                <Textarea
                                    value={rootUrlsStr}
                                    onChange={(e) => setRootUrlsStr(e.target.value)}
                                    placeholder={dedicatedSourceDef ? `Paste ${dedicatedSourceDef.label} URLs here...` : "https://www.newyorker.com/magazine/2026/04/..."}
                                    className="min-h-[100px] font-mono text-xs"
                                    disabled={discovering || extracting || processing}
                                />
                                <Button 
                                    onClick={() => handleDiscover()} 
                                    disabled={discovering || extracting || processing || !rootUrlsStr.trim()}
                                    className="w-full"
                                    variant={dedicatedSourceDef?.autoSync ? "secondary" : "default"}
                                >
                                    {discovering ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <LinkIcon className="h-4 w-4 mr-2" />}
                                    {dedicatedSourceDef ? `Find Links for ${dedicatedSourceDef.label}` : 'Auto-Detect Sources & Find Links'}
                                </Button>
                            </div>
                        )}
                    </div>

                    {discoveredLinks.length > 0 && scrapedArticles.length === 0 && (
                        <div className="space-y-4 pt-4 border-t animate-in fade-in">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold">Step 2: Scrape Links</h3>
                                <Button variant="ghost" size="sm" onClick={toggleAll} disabled={extracting}>
                                    {selectedLinks.size === discoveredLinks.length ? (
                                        <><CheckSquare className="h-4 w-4 mr-2" /> Deselect All</>
                                    ) : (
                                        <><Square className="h-4 w-4 mr-2" /> Select All</>
                                    )}
                                </Button>
                            </div>
                            
                            <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto bg-neutral-50/50">
                                {discoveredLinks.map((linkObj, i) => {
                                    const isSelected = selectedLinks.has(linkObj.url);
                                    const sourceDef = SOURCE_CATALOG.find(s => s.id === linkObj.sourceId);
                                    
                                    return (
                                        <div 
                                            key={i} 
                                            className={`flex items-center p-3 gap-3 cursor-pointer hover:bg-neutral-100 transition-colors ${isSelected ? 'bg-blue-50/30' : 'opacity-60'}`}
                                            onClick={() => !extracting && toggleLink(linkObj.url)}
                                        >
                                            <div className={`w-5 h-5 flex items-center justify-center rounded border ${isSelected ? 'bg-primary border-primary text-white' : 'border-input bg-background'}`}>
                                                {isSelected && <CheckCircle className="h-3 w-3" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm truncate font-mono">{linkObj.url.replace(/^https?:\/\//, '')}</div>
                                                <div className="text-xs font-medium text-neutral-500 mt-0.5">
                                                    {sourceDef?.icon} {sourceDef?.label} • {sourceDef?.needsBypass ? 'Bypass Active' : 'Direct Scrape'}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            
                            <p className="text-sm text-neutral-500">
                                Selected {selectedLinks.size} of {discoveredLinks.length} articles to scrape.
                            </p>

                            <Button 
                                onClick={handleScrapeRaw} 
                                disabled={extracting || selectedLinks.size === 0}
                                className="w-full"
                                size="lg"
                            >
                                {extracting ? (
                                    <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Fetching Raw Markdown for multiple sources...</>
                                ) : (
                                    <><Download className="mr-2 h-4 w-4" /> Fetch Raw Markdown</>
                                )}
                            </Button>
                        </div>
                    )}

                    {scrapedArticles.length > 0 && !extractResult && (
                        <div className="space-y-4 pt-4 border-t animate-in fade-in">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold">Step 3: Review Markdown & Format via AI</h3>
                                <span className="text-sm text-neutral-500">
                                    {scrapedArticles.filter(a => a.status === 'success').length} successfully scraped
                                </span>
                            </div>

                            <div className="flex flex-col md:flex-row gap-4 border rounded-md min-h-[500px]">
                                <div className="w-full md:w-1/3 border-r flex flex-col bg-neutral-50/50">
                                    <div className="p-2 border-b font-medium text-sm">Target Articles</div>
                                    <div className="flex-1 overflow-y-auto max-h-[500px] divide-y">
                                        {scrapedArticles.map((article, idx) => {
                                            const sourceDef = SOURCE_CATALOG.find(s => s.id === article.sourceId);
                                            return (
                                                <div 
                                                    key={idx}
                                                    onClick={() => setSelectedArticleIndex(idx)}
                                                    className={`p-3 text-sm cursor-pointer hover:bg-neutral-100 transition-colors ${selectedArticleIndex === idx ? 'bg-white border-l-4 border-l-primary shadow-sm' : ''} ${article.status === 'error' ? 'opacity-50' : ''}`}
                                                >
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {article.status === 'success' ? (
                                                            <FileText className="h-3 w-3 text-blue-500" />
                                                        ) : (
                                                            <AlertCircle className="h-3 w-3 text-red-500" />
                                                        )}
                                                        <span className="font-medium truncate flex-1">{article.title || 'Untitled'}</span>
                                                    </div>
                                                    <div className="text-xs text-neutral-400 truncate flex items-center justify-between">
                                                        <span className="truncate pr-2 font-mono">{article.url.replace(/^https?:\/\//, '')}</span>
                                                        <span className="whitespace-nowrap">{sourceDef?.icon}</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                                
                                <div className="w-full md:w-2/3 flex flex-col">
                                    <div className="p-2 border-b font-medium text-sm flex justify-between items-center bg-neutral-50/50">
                                        Markdown Editor
                                    </div>
                                    <div className="p-4 flex-1">
                                        {scrapedArticles[selectedArticleIndex]?.status === 'error' ? (
                                            <div className="text-red-500 text-sm">
                                                Failed to scrape this URL. Error: {scrapedArticles[selectedArticleIndex].error}
                                            </div>
                                        ) : (
                                            <Textarea 
                                                className="w-full h-full min-h-[400px] font-mono text-xs resize-none"
                                                value={scrapedArticles[selectedArticleIndex]?.markdown || ''}
                                                onChange={(e) => updateCurrentArticleMarkdown(e.target.value)}
                                                placeholder="Extracted markdown will appear here..."
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            <Button 
                                onClick={handleProcess} 
                                disabled={processing}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                                size="lg"
                            >
                                {processing ? (
                                    <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Batch AI Job Submission...</>
                                ) : (
                                    <><Zap className="mr-2 h-4 w-4 fill-current" /> Submit {scrapedArticles.filter(a => a.status === 'success').length} articles to Gemini Batch</>
                                )}
                            </Button>
                        </div>
                    )}

                    {extractResult && (
                        <div className={`p-4 rounded-lg mt-4 animate-in zoom-in-95 ${extractResult.errors.length === 0 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                            <p className="font-medium flex items-center gap-2">
                                {extractResult.errors.length === 0 ? (
                                    <><CheckCircle className="h-4 w-4 text-green-600" /> {extractResult.isBatch ? 'Batch Job Queued' : 'Processing Complete'}</>
                                ) : (
                                    <><AlertCircle className="h-4 w-4 text-yellow-600" /> Completed with some AI processing errors</>
                                )}
                            </p>
                            
                            {extractResult.message ? (
                                <p className="text-sm mt-1">{extractResult.message}</p>
                            ) : (
                                <p className="text-sm mt-1">Successfully structured & imported: {extractResult.success} articles.</p>
                            )}
                            
                            {extractResult.errors.length > 0 && (
                                <div className="mt-2 text-sm text-red-600 max-h-[150px] overflow-y-auto bg-white/50 p-2 rounded">
                                    {extractResult.errors.map((err, i) => (
                                        <div key={i} className="mb-2 pb-2 border-b border-red-200 last:border-0 last:mb-0 last:pb-0">
                                            <div className="font-mono text-xs">{err.url}</div>
                                            <div>{err.error}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <Button variant="outline" className="mt-4" onClick={() => {
                                setExtractResult(null);
                                setScrapedArticles([]);
                                setDiscoveredLinks([]);
                                setRootUrlsStr('');
                            }}>
                                Import Another Batch
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
