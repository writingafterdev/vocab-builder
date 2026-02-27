/**
 * Tests for sanitize utility functions
 * These tests ensure XSS protection is working correctly
 */
import { sanitizeHtml, sanitizeRichHtml, stripHtml } from '@/lib/sanitize';

describe('sanitizeHtml', () => {
    it('should allow basic formatting tags', () => {
        const input = '<p><strong>Hello</strong> <em>World</em></p>';
        const result = sanitizeHtml(input);
        expect(result).toContain('<strong>Hello</strong>');
        expect(result).toContain('<em>World</em>');
    });

    it('should remove script tags', () => {
        const input = '<p>Hello</p><script>alert("xss")</script>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('alert');
    });

    it('should remove onclick handlers', () => {
        const input = '<button onclick="alert(1)">Click</button>';
        const result = sanitizeHtml(input);
        expect(result).not.toContain('onclick');
    });

    it('should allow mark tags for highlighting', () => {
        const input = '<p>This is <mark class="highlight">important</mark></p>';
        const result = sanitizeHtml(input);
        expect(result).toContain('<mark');
    });

    it('should handle empty strings', () => {
        expect(sanitizeHtml('')).toBe('');
    });

    it('should handle null/undefined gracefully', () => {
        expect(sanitizeHtml(undefined as unknown as string)).toBe('');
        expect(sanitizeHtml(null as unknown as string)).toBe('');
    });
});

describe('sanitizeRichHtml', () => {
    it('should allow table elements', () => {
        const input = '<table><tr><td>Cell</td></tr></table>';
        const result = sanitizeRichHtml(input);
        expect(result).toContain('<table>');
        expect(result).toContain('<td>');
    });

    it('should allow images with safe attributes', () => {
        const input = '<img src="https://example.com/img.jpg" alt="test">';
        const result = sanitizeRichHtml(input);
        expect(result).toContain('<img');
        expect(result).toContain('src=');
    });

    it('should remove onerror from images', () => {
        const input = '<img src="x" onerror="alert(1)">';
        const result = sanitizeRichHtml(input);
        expect(result).not.toContain('onerror');
    });
});

describe('stripHtml', () => {
    it('should remove all HTML tags', () => {
        const input = '<p><strong>Hello</strong> World</p>';
        const result = stripHtml(input);
        expect(result).toBe('Hello World');
    });

    it('should handle nested tags', () => {
        const input = '<div><span><a href="#">Link</a></span></div>';
        const result = stripHtml(input);
        expect(result).toBe('Link');
    });
});
