/**
 * Client-side import parsing utilities
 * 
 * Supports:
 * - Paste text (auto-detects delimiter: | \t ,)
 * - CSV/TSV/TXT file upload
 * - In-batch deduplication via baseForm
 */

// ─── Types ────────────────────────────────────────────

export interface ImportRow {
    phrase: string;
    meaning: string;
    context?: string;
    status: 'valid' | 'duplicate' | 'invalid';
    error?: string;
}

// ─── Delimiter Detection ──────────────────────────────

/**
 * Auto-detect the delimiter used in the text.
 * Priority: pipe > tab > comma (pipe is least ambiguous)
 */
export function detectDelimiter(text: string): '|' | '\t' | ',' {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) return '|';

    // Sample first 10 lines
    const sample = lines.slice(0, 10);

    const pipeCount = sample.filter(l => l.includes('|')).length;
    const tabCount = sample.filter(l => l.includes('\t')).length;
    const commaCount = sample.filter(l => l.includes(',')).length;

    // Pipe is most explicit — if most lines have it, use it
    if (pipeCount >= sample.length * 0.5) return '|';
    // Tab is next most unambiguous
    if (tabCount >= sample.length * 0.5) return '\t';
    // Comma is fallback (can appear in meanings, so least reliable)
    if (commaCount >= sample.length * 0.5) return ',';

    // Default to pipe
    return '|';
}

// ─── Text Parsing ─────────────────────────────────────

/**
 * Parse pasted text into ImportRow[].
 * Each line = one phrase. Delimiter is auto-detected.
 * Format: phrase <delimiter> meaning [<delimiter> context]
 */
export function parseTextInput(text: string): ImportRow[] {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) return [];

    const delimiter = detectDelimiter(text);
    const rows: ImportRow[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Split by delimiter, max 3 parts (phrase, meaning, context)
        const parts = trimmed.split(delimiter).map(p => p.trim());

        const phrase = parts[0] || '';
        const meaning = parts[1] || '';
        const context = parts[2] || undefined;

        if (!phrase) {
            rows.push({ phrase: '', meaning: '', status: 'invalid', error: 'Empty phrase' });
            continue;
        }

        if (!meaning) {
            rows.push({ phrase, meaning: '', status: 'invalid', error: 'Missing meaning' });
            continue;
        }

        rows.push({ phrase, meaning, context, status: 'valid' });
    }

    return rows;
}

// ─── CSV File Parsing ─────────────────────────────────

/**
 * Parse a CSV/TSV/TXT file into ImportRow[].
 * Handles:
 * - BOM stripping (UTF-8 BOM)
 * - Quoted fields (e.g., "phrase, with comma")
 * - Various line endings (\r\n, \n, \r)
 */
export async function parseCsvFile(file: File): Promise<ImportRow[]> {
    const text = await file.text();

    // Strip BOM
    const cleaned = text.replace(/^\uFEFF/, '');

    // Detect delimiter from content
    const delimiter = detectDelimiter(cleaned);

    const lines = cleaned.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return [];

    // Check if first line is a header
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('phrase') || firstLine.includes('word') ||
        firstLine.includes('term') || firstLine.includes('front') ||
        firstLine.includes('meaning') || firstLine.includes('definition') ||
        firstLine.includes('back');

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rows: ImportRow[] = [];

    for (const line of dataLines) {
        const parts = parseQuotedLine(line, delimiter);

        const phrase = (parts[0] || '').trim();
        const meaning = (parts[1] || '').trim();
        const context = (parts[2] || '').trim() || undefined;

        if (!phrase) {
            rows.push({ phrase: '', meaning: '', status: 'invalid', error: 'Empty phrase' });
            continue;
        }

        if (!meaning) {
            rows.push({ phrase, meaning: '', status: 'invalid', error: 'Missing meaning' });
            continue;
        }

        rows.push({ phrase, meaning, context, status: 'valid' });
    }

    return rows;
}

/**
 * Parse a single CSV line, handling quoted fields.
 * "phrase, with comma" | meaning → ["phrase, with comma", "meaning"]
 */
function parseQuotedLine(line: string, delimiter: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            // Check for escaped quote ""
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            parts.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    parts.push(current); // Last field
    return parts;
}

// ─── Deduplication ────────────────────────────────────

/**
 * In-batch deduplication: collapse rows with the same baseForm.
 * Keeps the first occurrence, marks subsequent as 'duplicate'.
 */
export function deduplicateRows(rows: ImportRow[]): ImportRow[] {
    const seen = new Set<string>();

    return rows.map(row => {
        if (row.status !== 'valid') return row;

        const baseForm = row.phrase.trim().toLowerCase();

        if (seen.has(baseForm)) {
            return { ...row, status: 'duplicate' as const, error: 'Duplicate in import' };
        }

        seen.add(baseForm);
        return row;
    });
}

/**
 * Mark rows that already exist in the user's database.
 * Call this with existing baseForm strings from the DB.
 */
export function markExistingDuplicates(rows: ImportRow[], existingBaseForms: Set<string>): ImportRow[] {
    return rows.map(row => {
        if (row.status !== 'valid') return row;

        const baseForm = row.phrase.trim().toLowerCase();

        if (existingBaseForms.has(baseForm)) {
            return { ...row, status: 'duplicate' as const, error: 'Already in your glossary' };
        }

        return row;
    });
}

// ─── Stats ────────────────────────────────────────────

export function getImportStats(rows: ImportRow[]) {
    const valid = rows.filter(r => r.status === 'valid').length;
    const duplicates = rows.filter(r => r.status === 'duplicate').length;
    const invalid = rows.filter(r => r.status === 'invalid').length;

    return { valid, duplicates, invalid, total: rows.length };
}
