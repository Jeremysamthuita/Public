/**
 * Netlify Function (v2): Gemini Assistant
 * POST /.netlify/functions/gemini-assistant (also /api/gemini-assistant)
 * Uses Netlify AI Gateway credentials, injected automatically at runtime.
 */
import { GoogleGenAI } from '@google/genai';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

const SERMON_SEARCH_PROMPT = `You are a church database search helper. Analyze the user's natural language request for church sermons.
Return ONLY valid JSON with this schema:
{
  "keywords": ["key words without punctuation"],
  "scripture": "Book Chapter:Verse" or null,
  "preacher": "Preacher Name" or null,
  "topics": ["Faith", "Healing", "Prayer", etc.]
}`;

const CONTACT_PROMPT = `You are a pastoral care intake assistant for AIC Egerton Chapel. Analyze this contact message.
Identify:
1. Category: 'Prayer Request', 'Counseling', 'Bereavement', 'Thanksgiving', or 'General Inquiry'
2. Urgency Level: 'Normal', 'High', or 'Urgent Pastoral Care'
3. Department: 'Senior Pastor', 'Pastoral Care', 'Youth Ministry', or 'Secretariat'
4. Sentiment: 'Positive', 'Distressed', 'Neutral'
5. Summary: 1 concise sentence.
Return ONLY valid JSON.`;

export default async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
        const { task, prompt, payload } = await req.json().catch(() => ({}));
        let systemPrompt;
        let userInput;

        if (task === 'parse_sermon_search') {
            systemPrompt = SERMON_SEARCH_PROMPT;
            userInput = prompt;
        } else if (task === 'classify_contact_inquiry') {
            systemPrompt = CONTACT_PROMPT;
            userInput = JSON.stringify(payload);
        } else {
            return json({ error: 'Unknown task' }, 400);
        }

        const ai = new GoogleGenAI({});
        const response = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
            contents: `${systemPrompt}\n\nInput: ${userInput}`,
            config: { responseMimeType: 'application/json', temperature: 0.1 }
        });

        const jsonText = response.text;
        if (!jsonText) throw new Error('Gemini returned no content.');

        return new Response(jsonText, { status: 200, headers });
    } catch (err) {
        return json({ error: err.message }, 500);
    }
};
