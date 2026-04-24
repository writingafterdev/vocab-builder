/**
 * Dynamic Topics System
 * Topics and subtopics are stored in Firestore and can grow dynamically
 */

import {
    getDocument,
    queryCollection,
    serverTimestamp,
    setDocument,
    updateDocument,
} from '@/lib/appwrite/client-db';

// Topic document structure in Firestore
export interface TopicDocument {
    id: string;                  // Normalized ID: "business", "daily_life"
    label: string;               // Display name: "Business", "Daily Life"
    subtopics: {
        id: string;              // "decision_making"
        label: string;           // "Decision Making"
    }[];
    createdAt: string | Date | null;
    updatedAt: string | Date | null;
}

/**
 * Get all topics from Firestore
 */
export async function getAllTopics(): Promise<TopicDocument[]> {
    return queryCollection<TopicDocument>('topics');
}

/**
 * Get a single topic by ID
 */
export async function getTopic(topicId: string): Promise<TopicDocument | null> {
    return getDocument<TopicDocument>('topics', topicId);
}

/**
 * Create a new topic (if doesn't exist)
 */
export async function createTopic(id: string, label: string): Promise<TopicDocument> {
    const existing = await getDocument<TopicDocument>('topics', id);
    if (existing) {
        return existing;
    }

    const newTopic: Omit<TopicDocument, 'id'> = {
        label,
        subtopics: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    await setDocument('topics', id, newTopic);

    return { id, ...newTopic };
}

/**
 * Add a subtopic to an existing topic
 */
export async function addSubtopic(
    topicId: string,
    subtopicId: string,
    subtopicLabel: string
): Promise<void> {
    const topic = await getDocument<TopicDocument>('topics', topicId);
    if (!topic) {
        throw new Error('Topic not found');
    }

    const subtopics = topic.subtopics.some((subtopic) => subtopic.id === subtopicId)
        ? topic.subtopics
        : [...topic.subtopics, { id: subtopicId, label: subtopicLabel }];

    await updateDocument('topics', topicId, {
        subtopics,
        updatedAt: serverTimestamp(),
    });
}

/**
 * Generate topic list for AI prompt
 * Fetches from database dynamically
 */
export async function getTopicListForAI(): Promise<string> {
    const topics = await getAllTopics();

    if (topics.length === 0) {
        return "No existing topics yet. You may create new ones.";
    }

    return topics.map(topic =>
        topic.subtopics.length > 0
            ? `- ${topic.label} (${topic.id}): ${topic.subtopics.map(s => `${s.label} (${s.id})`).join(', ')}`
            : `- ${topic.label} (${topic.id})`
    ).join('\n');
}

/**
 * Normalize a string to topic ID format
 * "Decision Making" -> "decision_making"
 */
export function normalizeTopicId(label: string): string {
    return label
        .toLowerCase()
        .trim()
        .replace(/_/g, ' ')            // Temporarily convert underscores to spaces
        .replace(/[^a-z0-9\s-]/g, '')   // Remove special chars (keep hyphens and spaces)
        .replace(/\s+/g, '_');         // Spaces back to underscores
}

/**
 * Seed initial topics (run once or when DB is empty)
 */
export async function seedInitialTopics(): Promise<void> {
    const existingTopics = await getAllTopics();
    if (existingTopics.length > 0) {
        console.log('Topics already seeded, skipping...');
        return;
    }

    const initialTopics = [
        {
            id: 'business',
            label: 'Business',
            subtopics: [
                { id: 'decision_making', label: 'Decision Making' },
                { id: 'negotiations', label: 'Negotiations' },
                { id: 'presentations', label: 'Presentations' },
                { id: 'meetings', label: 'Meetings' },
            ]
        },
        {
            id: 'career',
            label: 'Career',
            subtopics: [
                { id: 'job_interviews', label: 'Job Interviews' },
                { id: 'networking', label: 'Networking' },
                { id: 'workplace', label: 'Workplace Dynamics' },
            ]
        },
        {
            id: 'daily_life',
            label: 'Daily Life',
            subtopics: [
                { id: 'small_talk', label: 'Small Talk' },
                { id: 'shopping', label: 'Shopping' },
                { id: 'appointments', label: 'Appointments' },
            ]
        },
        {
            id: 'travel',
            label: 'Travel',
            subtopics: [
                { id: 'booking', label: 'Booking' },
                { id: 'directions', label: 'Directions' },
                { id: 'dining', label: 'Dining' },
            ]
        },
        {
            id: 'relationships',
            label: 'Relationships',
            subtopics: [
                { id: 'emotions', label: 'Expressing Emotions' },
                { id: 'advice', label: 'Giving Advice' },
            ]
        },
    ];

    for (const topic of initialTopics) {
        await setDocument('topics', topic.id, {
            label: topic.label,
            subtopics: topic.subtopics,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }

    console.log('Seeded initial topics');
}
