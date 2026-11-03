import express from 'express';
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
  const pageNumber = Number.isInteger(req.body?.pageNumber) ? req.body.pageNumber : null;
  const documentName = typeof req.body?.documentName === 'string' ? req.body.documentName.slice(0, 160) : 'PDF document';
  if (!selectedText) return res.status(400).json({ error: 'Select some PDF text first.' });
  if (selectedText.length > 12000) return res.status(413).json({ error: 'Please select a shorter passage (12,000 characters maximum).' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'AI summaries are not configured. Add GEMINI_API_KEY to the server secrets.' });
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a clear, careful university study assistant. Summarize the selected passage from a student's PDF in simple English. Keep the summary short, explain important terms, preserve the original meaning, and do not add facts that are not in the passage. Use 3-5 concise bullet points where appropriate.\n\nDocument: ${documentName}\nPage: ${pageNumber ?? 'unknown'}\n\nSelected passage:\n${selectedText}`
    });
    const summary = response.text?.trim();
    if (!summary) return res.status(502).json({ error: 'The AI returned an empty summary. Please try again.' });
    return res.json({ summary });
  } catch (error) {
    console.error('PDF passage summarization failed:', error);
    return res.status(502).json({ error: 'Could not summarize this passage right now. Please try again.' });
  }
});

if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) {
  app.use(express.static(path.join(rootDir, 'dist')));
  app.get('*', (_req, res) => res.sendFile(path.join(rootDir, 'dist', 'index.html')));
} else {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(port, '0.0.0.0', () => {
  console.log('University Study Tracker listening on port ' + port);
});
