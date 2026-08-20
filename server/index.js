import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'fs';
import { createSession } from './lib/session.js';
import { sendError } from './lib/errors.js';
import authRoutes from './routes/auth.js';
import cardsRoutes from './routes/cards.js';
import mediaRoutes from './routes/media.js';
import publishRoutes from './routes/publish.js';

function assertProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = [];
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'dev-secret-change-me') {
    missing.push('SESSION_SECRET');
  }
  if (!process.env.TOKEN_ENCRYPTION_KEY) missing.push('TOKEN_ENCRYPTION_KEY');
  if (!process.env.CLIENT_URL?.startsWith('https://')) missing.push('CLIENT_URL (https)');
  if (!process.env.X_REDIRECT_URI?.startsWith('https://')) missing.push('X_REDIRECT_URI (https)');
  if (missing.length) {
    console.error('[Fatal] Missing or invalid production config:', missing.join(', '));
    process.exit(1);
  }
}

assertProductionConfig();

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://pbs.twimg.com', 'https://abs.twimg.com', 'https://video.twimg.com', 'https://ton.twimg.com'],
      mediaSrc: ["'self'", 'blob:', 'https://video.twimg.com'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'", 'https://x.com', 'https://api.x.com'],
    },
  } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());
app.use(createSession());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const publishLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/auth/login', authLimiter);
app.use('/auth/callback', authLimiter);
app.use('/auth/ads/login', authLimiter);
app.use('/api/media/upload', uploadLimiter);
app.use('/api/publish', publishLimiter);

const clientDist = join(__dirname, '..', 'client', 'dist');
console.log('[Startup] NODE_ENV:', process.env.NODE_ENV);
console.log('[Startup] clientDist path:', clientDist);
console.log('[Startup] clientDist exists:', existsSync(clientDist));
if (isProduction && existsSync(clientDist)) {
  console.log('[Startup] Serving static files from', clientDist);
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
      return next();
    }
    res.sendFile(join(clientDist, 'index.html'));
  });
}

app.use(authRoutes);
app.use(cardsRoutes);
app.use(mediaRoutes);
app.use(publishRoutes);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  sendError(res, err);
});

app.listen(PORT, () => {
  console.log(`CardForge server running on port ${PORT}`);
});
