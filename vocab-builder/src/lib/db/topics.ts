/**
 * Dynamic Topics System
 * Topics and subtopics are stored in Firestore and can grow dynamically
 */

import {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    arrayUnion,
    serverTimestamp,
} from '@/lib/firebase/firestore';
import { getDbAsync } from './core';

// Topic document structure in Firestore
export interface TopicDocument {
    id: string;                  // Normalized ID: "business", "daily_life"
    label: string;               // Display name: "Business", "Daily Life"
    subtopics: {
        id: string;              // "decision_making"
        label: string;           // "Decision Making"
    }[];
    createdAt: any;
    updatedAt: any;
}

/**
 * Get all topics from Firestore
 */
export async function getAllTopics(): Promise<TopicDocument[]> {
    const firestore = await getDbAsync();
    const topicsRef = collection(firestore, 'topics');
    const snapshot = await getDocs(topicsRef);

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as TopicDocument[];
}

/**
 * Get a single topic by ID
 */
export async function getTopic(topicId: string): Promise<TopicDocument | null> {
    const firestore = await getDbAsync();
    const topicRef = doc(firestore, 'topics', topicId);
    const snapshot = await getDoc(topicRef);

    if (!snapshot.exists()) return null;

    return {
        id: snapshot.id,
        ...snapshot.data()
    } as TopicDocument;
}

/**
 * Create a new topic (if doesn't exist)
 */
export async function createTopic(id: string, label: string): Promise<TopicDocument> {
    const firestore = await getDbAsync();
    const topicRef = doc(firestore, 'topics', id);

    const existing = await getDoc(topicRef);
    if (existing.exists()) {
        return { id: existing.id, ...existing.data() } as TopicDocument;
    }

    const newTopic: Omit<TopicDocument, 'id'> = {
        label,
        subtopics: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    await setDoc(topicRef, newTopic);

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
    const firestore = await getDbAsync();
    const topicRef = doc(firestore, 'topics', topicId);

    await updateDoc(topicRef, {
        subtopics: arrayUnion({ id: subtopicId, label: subtopicLabel }),
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
        .replace(/[^a-z0-9\s]/g, '')  // Remove special chars
        .replace(/\s+/g, '_');         // Spaces to underscores
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

    const firestore = await getDbAsync();

    for (const topic of initialTopics) {
        const topicRef = doc(firestore, 'topics', topic.id);
        await setDoc(topicRef, {
            label: topic.label,
            subtopics: topic.subtopics,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }

    console.log('Seeded initial topics');
}
