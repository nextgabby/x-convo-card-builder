import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { createSession } from './lib/session.js';
import authRoutes from './routes/auth.js';
import cardsRoutes from './routes/cards.js';
import mediaRoutes from './routes/media.js';
import publishRoutes from './routes/publish.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for secure cookies behind Render's proxy
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());
app.use(createSession());

// Serve static client in production (before API routes so requireAuth doesn't block them)
const clientDist = join(__dirname, '..', 'client', 'dist');
console.log('[Startup] NODE_ENV:', process.env.NODE_ENV);
console.log('[Startup] clientDist path:', clientDist);
console.log('[Startup] clientDist exists:', existsSync(clientDist));
if (process.env.NODE_ENV === 'production' && existsSync(clientDist)) {
  console.log('[Startup] Serving static files from', clientDist);
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
      return next();
    }
    res.sendFile(join(clientDist, 'index.html'));
  });
}

// API routes
app.use(authRoutes);
app.use(cardsRoutes);
app.use(mediaRoutes);
app.use(publishRoutes);

app.listen(PORT, () => {
  console.log(`CardForge server running on port ${PORT}`);
});
