export type SourceType = 'magazine' | 'reddit' | 'website';

export interface SourceSection {
    id: string;        // e.g. "talk-of-the-town"
    label: string;     // e.g. "Talk of the Town"
}

export interface SourceDefinition {
    id: string;               // e.g. "the-new-yorker"
    label: string;            // e.g. "The New Yorker"
    type: SourceType;
    icon?: string;            // e.g. emoji or URL
    hasSections: boolean;     // Whether Layer 2 is needed
    dynamicSections?: boolean;// If true (Reddit), sections are fetched from DB/dynamic.
    sections?: SourceSection[];// If static (Magazines), list them here.
    needsBypass: boolean;     // If true, wrap URLs in smry.ai/ during phase 2 import.
    rssFeeds?: Record<string, string>; // section id → RSS URL (used instead of crawling for paywalled sites)
    autoSync?: boolean;       // If true, Discovery step is fully automated via rssFeeds (no URL paste needed)
    // CSS/UI theme variables for the feed
    themeParams?: {
        accentColor: string;     // Hex
        accentColorDark: string; // Hex
        logoDark?: string;       // URL mapping
        logoLight?: string;      // URL mapping
    };
}

export const SOURCE_CATALOG: SourceDefinition[] = [
    {
        id: 'the-new-yorker',
        label: 'The New Yorker',
        type: 'magazine',
        icon: '🗽',
        hasSections: true,
        needsBypass: true,
        autoSync: true,
        rssFeeds: {
            'everything':  'https://www.newyorker.com/feed/everything',
            'latest':      'https://www.newyorker.com/feed/latest/rss',
            'magazine':    'https://www.newyorker.com/feed/magazine/rss',
            'reporting':   'https://www.newyorker.com/feed/magazine/reporting/rss',
            'news':        'https://www.newyorker.com/feed/news/rss',
            'the Lede':    'https://www.newyorker.com/feed/the-lede/rss',
            'open questions': 'https://www.newyorker.com/feed/culture/open-questions/rss',
            'infinite scroll':'https://www.newyorker.com/feed/culture/infinite-scroll/rss',
            'trump washington':'https://www.newyorker.com/feed/news/letter-from-trumps-washington/rss',
            'fault lines':    'https://www.newyorker.com/feed/news/fault-lines/rss',
            'finance':        'https://www.newyorker.com/feed/magazine/the-financial-page/rss',
            'culture':        'https://www.newyorker.com/feed/culture/rss',
            'science':     'https://www.newyorker.com/feed/science/science-and-technology/rss',
            'fiction':     'https://www.newyorker.com/feed/fiction-and-poetry/rss',
            'humor':       'https://www.newyorker.com/feed/humor/rss',
            'sports':      'https://www.newyorker.com/feed/sports/sporting-scene/rss',
            'critics':     'https://www.newyorker.com/feed/culture/critics-notebook/rss',
        },
        sections: [
            { id: 'talk-of-the-town', label: 'Talk of the Town' },
            { id: 'shouts-and-murmurs', label: 'Shouts & Murmurs' },
            { id: 'annals-of-technology', label: 'Annals of Technology' },
            { id: 'personal-history', label: 'Personal History' },
            { id: 'critics-notebook', label: "Critic's Notebook" },
        ],
        themeParams: {
            accentColor: '#000000',
            accentColorDark: '#ffffff'
        }
    },
    {
        id: 'the-atlantic',
        label: 'The Atlantic',
        type: 'magazine',
        icon: '🌊',
        hasSections: true,
        needsBypass: true,
        autoSync: true,
        // RSS feeds bypass anti-bot protection for link discovery
        rssFeeds: {
            'all':      'https://www.theatlantic.com/feed/all/',
            'ideas':    'https://www.theatlantic.com/feed/channel/ideas/',
            'science':  'https://www.theatlantic.com/feed/channel/science/',
            'culture':  'https://www.theatlantic.com/feed/channel/entertainment/',
            'politics': 'https://www.theatlantic.com/feed/channel/politics/',
            'technology': 'https://www.theatlantic.com/feed/channel/technology/',
            'health':   'https://www.theatlantic.com/feed/channel/health/',
            'business': 'https://www.theatlantic.com/feed/channel/business/',
            'books':    'https://www.theatlantic.com/feed/channel/books/',
            'family':   'https://www.theatlantic.com/feed/channel/family/',
            'education': 'https://www.theatlantic.com/feed/channel/education/',
        },
        sections: [
            { id: 'ideas', label: 'Ideas' },
            { id: 'science', label: 'Science' },
            { id: 'culture', label: 'Culture' },
            { id: 'politics', label: 'Politics & Policy' },
            { id: 'technology', label: 'Technology' },
            { id: 'health', label: 'Health' },
            { id: 'business', label: 'Business' },
            { id: 'books', label: 'Books' },
            { id: 'family', label: 'Family' },
            { id: 'education', label: 'Education' },
        ],
        themeParams: {
            accentColor: '#e02727',
            accentColorDark: '#ff4c4c'
        }
    },
    {
        id: 'aeon',
        label: 'Aeon',
        type: 'website',
        icon: '🏛️',
        hasSections: false,
        needsBypass: false,
        autoSync: true,
        rssFeeds: {
            'all': 'https://aeon.co/feed.rss',
        },
        themeParams: {
            accentColor: '#0c0c0c',
            accentColorDark: '#f0f0f0'
        }
    },

    {
        id: 'reedy',
        label: 'Reedsy',
        type: 'website',
        icon: '📖',
        hasSections: false,
        needsBypass: false,
        themeParams: {
            accentColor: '#4f46e5',
            accentColorDark: '#818cf8'
        }
    },

    {
        id: 'new-scientist',
        label: 'New Scientist',
        type: 'magazine',
        icon: '🔬',
        hasSections: true,
        needsBypass: false,
        autoSync: true,
        rssFeeds: {
            'home':        'https://www.newscientist.com/feed/home/',
            'space':       'https://www.newscientist.com/subject/space/feed/',
            'physics':     'https://www.newscientist.com/subject/physics/feed/',
            'environment': 'https://www.newscientist.com/subject/environment/feed/',
            'technology':  'https://www.newscientist.com/subject/technology/feed/',
            'health':      'https://www.newscientist.com/subject/health/feed/',
            'life':        'https://www.newscientist.com/subject/life/feed/',
            'humans':      'https://www.newscientist.com/subject/humans/feed/',
            'mind':        'https://www.newscientist.com/subject/mind/feed/',
        },
        sections: [
            { id: 'space', label: 'Space' },
            { id: 'physics', label: 'Physics' },
            { id: 'environment', label: 'Environment' },
            { id: 'technology', label: 'Technology' },
            { id: 'health', label: 'Health' },
            { id: 'life', label: 'Life Sciences' },
            { id: 'humans', label: 'Humans' },
            { id: 'mind', label: 'Mind' },
        ],
        themeParams: {
            accentColor: '#e4002b',
            accentColorDark: '#ff3355'
        }
    },
];


export function getSourceDefinition(id: string): SourceDefinition | undefined {
    return SOURCE_CATALOG.find((s) => s.id === id);
}

export function getAllSources(): SourceDefinition[] {
    return SOURCE_CATALOG;
}
