import { GoogleGenAI } from '@google/genai';
console.log("SDK loaded", Object.keys(GoogleGenAI));
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
console.log("ai objects", Object.keys(ai));
console.log("ai.batches", Boolean(ai.batches));
