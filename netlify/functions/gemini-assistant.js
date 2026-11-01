/**
 * Netlify Serverless Function: Gemini Assistant
 * Phase 1: ESM format.
 */

export const handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: 'ok' };
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 503,
            headers,
            body: JSON.stringify({ error: 'Gemini is not configured. The site will use local search.' })
        };
    }

    try {
        const { task, prompt, payload } = JSON.parse(event.body || '{}');
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
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown task' }) };
        }

        const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const geminiResp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\nInput: ${userInput}` }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
            })
        });

        const geminiData = await geminiResp.json();
        const jsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) throw new Error('Gemini returned no content.');

        return { statusCode: 200, headers, body: jsonText };
    } catch (err) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};