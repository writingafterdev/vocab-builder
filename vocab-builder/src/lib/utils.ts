import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Timestamp } from '@/lib/firebase/firestore'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely convert any timestamp format to a Date object
 * Handles: Firestore Timestamp, Date, REST API format, strings, numbers
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toDateSafe(timestamp: Timestamp | Date | any | null | undefined): Date | null {
  if (!timestamp) return null;

  if (timestamp instanceof Timestamp) {
    return timestamp.toDate();
  }

  if (timestamp instanceof Date) {
    return timestamp;
  }

  // REST API format: { _seconds, _nanoseconds }
  if (timestamp._seconds !== undefined) {
    return new Date(timestamp._seconds * 1000);
  }

  // Alternative REST format: { seconds, nanoseconds }
  if (timestamp.seconds !== undefined) {
    return new Date(timestamp.seconds * 1000);
  }

  // String or number timestamp
  if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}
