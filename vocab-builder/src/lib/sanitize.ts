/**
 * HTML Sanitization utility for XSS prevention
 * Uses isomorphic-dompurify which works on both client and server
 */
import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param dirty - Untrusted HTML string
 * @returns Sanitized HTML safe for rendering
 */
export function sanitizeHtml(dirty: string): string {
    if (!dirty) return '';
    return DOMPurify.sanitize(dirty, {
        // Allow common formatting tags
        ALLOWED_TAGS: [
            'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li',
            'a', 'span', 'div',
            'blockquote', 'pre', 'code',
            'mark', // For phrase highlighting
        ],
        ALLOWED_ATTR: [
            'href', 'target', 'rel',
            'class', 'id',
            'style', // Allow inline styles for highlighting
        ],
        // Force safe link behavior
        ADD_ATTR: ['target'],
        FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
    });
}

/**
 * Sanitize HTML but allow more tags (for rich content like articles)
 */
export function sanitizeRichHtml(dirty: string): string {
    if (!dirty) return '';
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: [
            'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li',
            'a', 'span', 'div',
            'blockquote', 'pre', 'code',
            'mark', 'sub', 'sup',
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'img', 'figure', 'figcaption',
        ],
        ALLOWED_ATTR: [
            'href', 'target', 'rel',
            'class', 'id',
            'style',
            'src', 'alt', 'width', 'height',
        ],
        ADD_ATTR: ['target'],
        FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
    });
}

/**
 * Strip all HTML tags, returning plain text only
 */
export function stripHtml(dirty: string): string {
    if (!dirty) return '';
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
    });
}
