import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const port = Number(process.env.PORT) || 3000;
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const summarizeRateWindows = new Map();
app.set('trust proxy', 1);

app.use(express.json({ limit: '24kb' }));

app.post('/api/ai/summarize', async (req, res) => {
  const now = Date.now();
  const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
  const currentWindow = summarizeRateWindows.get(clientKey);
  if (!currentWindow || now - currentWindow.startedAt >= 60_000) {
    if (summarizeRateWindows.size > 5000) {
      for (const [key, value] of summarizeRateWindows) if (now - value.startedAt >= 60_000) summarizeRateWindows.delete(key);
    }
    summarizeRateWindows.set(clientKey, { startedAt: now, count: 1 });
  } else if (currentWindow.count >= 12) {
    return res.status(429).json({ error: 'Too many summaries in a short time. Please wait a minute and try again.' });
  } else {
    currentWindow.count += 1;
  }

  const selectedText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const context = typeof req.body?.context === 'string' ? req.body.context.trim().slice(0, 1600) : '';
  const pageNumber = Number.isInteger(req.body?.pageNumber) ? req.body.pageNumber : null;
  const documentName = typeof req.body?.documentName === 'string' ? req.body.documentName.slice(0, 160) : 'PDF document';
  if (!selectedText) return res.status(400).json({ error: 'Select some PDF text first.' });
  if (selectedText.length > 12000) return res.status(413).json({ error: 'Please select a shorter passage (12,000 characters maximum).' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'AI summaries are not configured. Add GEMINI_API_KEY to the server secrets.' });
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const requestedMode = req.body?.mode;
    const mode = ['explain', 'meaning', 'summarize'].includes(requestedMode) ? requestedMode : 'explain';
    const looksLikeQuestion = /\?\s*$/.test(selectedText) || /^(what|why|how|when|where|who|which|is|are|was|were|do|does|did|can|could|would|should|will|define|explain|describe|name|list)\b/i.test(selectedText);
    const isShortSelection = selectedText.split(/\s+/).filter(Boolean).length <= 4;
    const instruction = mode === 'meaning'
      ? 'Explain the meaning of the selected word or short phrase in very simple everyday English. Give a clear, direct definition and explain how it is used in this passage using the surrounding context. Include one short example only if it genuinely helps. Do not summarize the whole passage. Keep the answer under 70 words.'
      : mode === 'summarize'
        ? 'Summarize the selected passage in very simple, everyday English. Be brief: use no more than 3 short bullet points and stay under 70 words. Include only the most important ideas. Do not add facts, examples, background information, introductions, or repeated points. Preserve the original meaning.'
        : (looksLikeQuestion
          ? 'The selected text is a QUESTION. Answer the question directly; do not explain or paraphrase the question. Give the correct answer in very simple everyday English, in 1-3 short sentences (maximum 70 words). Use the surrounding page context when it helps. If the page does not contain enough information, answer from reliable general knowledge and say briefly if something is uncertain.'
          : isShortSelection
            ? 'The selected text is a WORD or SHORT PHRASE. Explain what it means in very simple everyday English. Give a clear definition and, when surrounding context is available, explain what it means in this specific passage. If it is one word, do not summarize it as a passage or merely repeat it. Use 1-3 short sentences (maximum 70 words).'
            : 'Explain the selected passage in very simple, everyday English for a university student. Be brief: use 2-4 short sentences and stay under 70 words. Explain only the main idea and define a difficult term only if it is necessary to understand the passage. Do not add facts, examples, background information, introductions, or repeated points that are not needed. Preserve the original meaning.');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a clear, careful university study assistant. ${instruction}\n\nDocument: ${documentName}\nPage: ${pageNumber ?? 'unknown'}\n\nSurrounding page context (use only when relevant):\n${context || '(not available)'}\n\nSelected text:\n${selectedText}`
    });
    const summary = response.text?.trim();
    if (!summary) return res.status(502).json({ error: 'The AI returned an empty summary. Please try again.' });
    return res.json({ summary });
  } catch (error) {
    console.error('PDF passage AI request failed:', error);
    const rawMessage = error instanceof Error ? error.message : 'Unknown AI service error';
    const safeMessage = rawMessage
      .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[API key hidden]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [hidden]')
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 240);
    return res.status(502).json({ error: `AI request failed: ${safeMessage || 'The AI provider returned an unknown error.'}` });
  }
});

const productionIndex = path.join(rootDir, 'dist', 'index.html');

if ((process.env.NODE_ENV === 'production' || process.env.K_SERVICE) && existsSync(productionIndex)) {
  app.use(express.static(path.join(rootDir, 'dist')));
  app.get('*', (_req, res) => res.sendFile(productionIndex));
} else {
  if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) {
    console.warn('Production build not found at dist/index.html; starting Vite middleware for the AI Studio preview.');
  }
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(port, '0.0.0.0', () => {
  console.log('University Study Tracker listening on port ' + port);
});
