/**
 * Netlify Function (v2): Gemini Assistant
 * Uses Netlify AI Gateway — credentials are injected at runtime.
 */
import { GoogleGenAI } from '@google/genai';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

const json = (status, body) => new Response(JSON.stringify(body), { status, headers });

export default async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers });
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

    try {
        const { task, prompt, payload } = await req.json().catch(() => ({}));
        let systemPrompt;
        let userInput;

        if (task === 'parse_sermon_search') {
            systemPrompt = `You are a church database search helper. Analyze the user's natural language request for church sermons.
Return ONLY valid JSON with this schema:
{
  "keywords": ["key words without punctuation"],
  "scripture": "Book Chapter:Verse" or null,
  "preacher": "Preacher Name" or null,
  "topics": ["Faith", "Healing", "Prayer", etc.]
}`;
            userInput = prompt;
        } else if (task === 'classify_contact_inquiry') {
            systemPrompt = `You are a pastoral care intake assistant for AIC Egerton Chapel. Analyze this contact message.
Identify:
1. Category: 'Prayer Request', 'Counseling', 'Bereavement', 'Thanksgiving', or 'General Inquiry'
2. Urgency Level: 'Normal', 'High', or 'Urgent Pastoral Care'
3. Department: 'Senior Pastor', 'Pastoral Care', 'Youth Ministry', or 'Secretariat'
4. Sentiment: 'Positive', 'Distressed', 'Neutral'
5. Summary: 1 concise sentence.
Return ONLY valid JSON.`;
            userInput = JSON.stringify(payload);
        } else {
            return json(400, { error: 'Unknown task' });
        }

        const ai = new GoogleGenAI({});
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `${systemPrompt}\n\nInput: ${userInput}`,
            config: { responseMimeType: 'application/json', temperature: 0.1 }
        });

        const jsonText = response.text;
        if (!jsonText) throw new Error('Gemini returned no content.');

        return new Response(jsonText, { status: 200, headers });
    } catch (err) {
        return json(500, { error: err.message });
    }
};
