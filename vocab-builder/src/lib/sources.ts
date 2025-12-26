// Source logo mapping utility

export const SOURCE_LOGOS: Record<string, string> = {
    reddit: '/logos/reddit.png',
    substack: '/logos/substack.png',
    medium: '/logos/medium.png',
    thenewyorker: '/logos/thenewyorker.png',
    theatlantic: '/logos/theatlantic.png',
    wired: '/logos/wired.png',
    theconomist: '/logos/theconomist.png',
};

export function getSourceLogo(source: string | undefined): string | null {
    if (!source) return null;
    return SOURCE_LOGOS[source.toLowerCase()] || null;
}

export function getSourceDisplayName(source: string | undefined): string {
    const names: Record<string, string> = {
        reddit: 'Reddit',
        substack: 'Substack',
        medium: 'Medium',
        thenewyorker: 'The New Yorker',
        theatlantic: 'The Atlantic',
        wired: 'Wired',
        theconomist: 'The Economist',
        admin: 'Admin',
    };
    return source ? (names[source.toLowerCase()] || source) : 'Admin';
}
