import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { db } from './db/storage.ts';
import {
  createPresignedUploadUrl,
  streamFromS3,
  uploadDirectToS3,
  getS3Status,
} from './services/s3.ts';

// Load environment variables (.env.local, .env)
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = Boolean(process.env.VERCEL);
const UPLOADS_DIR = isVercel ? '/tmp/uploads' : path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch {}
}

import multer from 'multer';
import crypto from 'node:crypto';

// Setup multer for reliable multipart uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${cleanName}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain',
  '.json': 'application/json',
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

// Serve uploaded files statically with open CORS and caching headers
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  })
);

// 1. Multipart Form-Data upload endpoint (Fast & rock-solid)
app.post('/api/upload/file', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filename = req.file.filename;
  const relativeKey = `uploads/${filename}`;
  const fileUrl = `/uploads/${filename}`;
  const streamUrl = `/api/files/stream?key=${encodeURIComponent(relativeKey)}`;

  // Optional background S3 sync if S3 credentials exist
  const s3Config = getS3Status();
  if (s3Config.connected) {
    try {
      const buffer = fs.readFileSync(req.file.path);
      uploadDirectToS3(relativeKey, buffer, req.file.mimetype).catch((e) => {
        console.warn('[S3 Background Sync Warning]:', e);
      });
    } catch {}
  }

  return res.status(200).json({
    success: true,
    url: fileUrl,
    streamUrl,
    key: relativeKey,
    filename,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });
});

// S3 simulated direct upload handler (receives binary stream/buffer via PUT)
app.put('/api/upload/direct', (req: Request, res: Response) => {
  const key = req.query.key as string;
  if (!key) {
    return res.status(400).json({ error: 'Missing key parameter' });
  }

  const targetPath = path.resolve(process.cwd(), key);
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch {}
  }

  const writeStream = fs.createWriteStream(targetPath);
  req.pipe(writeStream);

  writeStream.on('finish', () => {
    return res.status(200).json({ success: true, key, url: `/${key}` });
  });

  writeStream.on('error', (err) => {
    console.error('[Upload Direct Error]', err);
    return res.status(500).json({ error: 'Failed to write uploaded file' });
  });
});

// S3 live direct upload handler (streams binary directly to S3 via backend)
app.put('/api/s3/direct-upload', async (req: Request, res: Response) => {
  const key = req.query.key as string;
  const contentType = (req.headers['content-type'] as string) || 'application/octet-stream';

  if (!key) {
    return res.status(400).json({ error: 'Missing key parameter' });
  }

  try {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const fileBuffer = Buffer.concat(chunks);
        const result = await uploadDirectToS3(key, fileBuffer, contentType);
        return res.status(200).json({ success: true, ...result });
      } catch (err: unknown) {
        console.error('[S3 Direct Upload Error]:', err);
        const message = err instanceof Error ? err.message : 'S3 upload failed';
        return res.status(500).json({ error: message });
      }
    });
    req.on('error', (err) => {
      console.error('[S3 Direct Stream Error]:', err);
      return res.status(500).json({ error: 'Failed to read request stream' });
    });
  } catch (err: unknown) {
    console.error('[S3 Direct Upload Route Error]:', err);
    return res.status(500).json({ error: 'S3 direct upload failed' });
  }
});

// JSON middleware for standard API endpoints
app.use(express.json({ limit: '50mb' }));

// 2. Base64 upload endpoint
app.post('/api/upload/base64', (req: Request, res: Response) => {
  const { data, filename, contentType } = req.body;
  if (!data) {
    return res.status(400).json({ error: 'Missing data field' });
  }

  try {
    const base64Data = data.replace(/^data:([A-Za-z-+\/]+);base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = path.extname(filename || '') || (contentType ? `.${contentType.split('/')[1]}` : '.png');
    const cleanName = path.basename(filename || 'upload', ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${cleanName}${ext}`;
    const targetPath = path.join(UPLOADS_DIR, uniqueName);

    fs.writeFileSync(targetPath, buffer);
    const relativeKey = `uploads/${uniqueName}`;
    const fileUrl = `/uploads/${uniqueName}`;
    const streamUrl = `/api/files/stream?key=${encodeURIComponent(relativeKey)}`;

    return res.status(200).json({
      success: true,
      url: fileUrl,
      streamUrl,
      key: relativeKey,
      filename: uniqueName,
      size: buffer.length,
    });
  } catch (err) {
    console.error('[Base64 Upload Error]:', err);
    return res.status(500).json({ error: 'Failed to save base64 file' });
  }
});

// S3 connection status check endpoint
app.get('/api/s3/status', (_req: Request, res: Response) => {
  return res.json(getS3Status());
});

// Universal file stream handler (serves local disk file or delegates to S3)
async function handleFileStream(req: Request, res: Response) {
  const key = req.query.key as string;
  if (!key) {
    return res.status(400).json({ error: 'Missing key parameter' });
  }

  // Sanitize path traversal
  const cleanKey = key.replace(/^\/+/, '');
  const localCandidates = [
    path.resolve(process.cwd(), cleanKey),
    path.resolve(UPLOADS_DIR, path.basename(cleanKey)),
    path.resolve(UPLOADS_DIR, cleanKey),
  ];

  for (const localPath of localCandidates) {
    if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
      const stat = fs.statSync(localPath);
      const mime = getMimeType(localPath);

      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', stat.size.toString());
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const stream = fs.createReadStream(localPath);
      return stream.pipe(res);
    }
  }

  // If not found locally, try streaming from S3 if configured
  try {
    const s3Result = await streamFromS3(cleanKey);
    if (s3Result.contentType) {
      res.setHeader('Content-Type', s3Result.contentType);
    }
    if (s3Result.contentLength) {
      res.setHeader('Content-Length', s3Result.contentLength.toString());
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return s3Result.bodyStream.pipe(res);
  } catch (_err) {
    return res.status(404).json({ error: 'File not found' });
  }
}

app.get('/api/files/stream', handleFileStream);
app.get('/api/s3/stream', handleFileStream);

// Physical file deletion endpoint
app.delete('/api/files/delete', (req: Request, res: Response) => {
  const key = (req.query.key as string) || (req.body?.key as string);
  if (!key) {
    return res.status(400).json({ error: 'Missing key parameter' });
  }

  const cleanKey = key.replace(/^\/+/, '');
  const localCandidates = [
    path.resolve(process.cwd(), cleanKey),
    path.resolve(UPLOADS_DIR, path.basename(cleanKey)),
    path.resolve(UPLOADS_DIR, cleanKey),
  ];

  let deleted = false;
  for (const localPath of localCandidates) {
    if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
      try {
        fs.unlinkSync(localPath);
        deleted = true;
      } catch (err) {
        console.error('[File Delete Error]:', err);
      }
    }
  }

  return res.json({ success: true, deleted, key });
});

// --- S3 Presigned Upload API Route ---
app.post('/api/upload', async (req: Request, res: Response) => {
  try {
    const { filename, contentType } = req.body;
    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }

    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;

    const presignedData = await createPresignedUploadUrl(filename, contentType, baseUrl);
    return res.status(200).json(presignedData);
  } catch (err: unknown) {
    console.error('[API /api/upload error]:', err);
    const message = err instanceof Error ? err.message : 'Upload initialization failed';
    return res.status(500).json({ error: message });
  }
});

// --- Page API Routes ---
app.get('/api/pages', (_req: Request, res: Response) => {
  const pages = db.getPages();
  return res.json(pages);
});

app.post('/api/pages', (req: Request, res: Response) => {
  const { title, icon, content, parentId } = req.body;
  const page = db.createPage({ title, icon, content, parentId });
  return res.status(201).json(page);
});

app.get('/api/pages/:id', (req: Request, res: Response) => {
  const page = db.getPage(req.params.id);
  if (!page) {
    return res.status(404).json({ error: 'Page not found' });
  }
  return res.json(page);
});

app.put('/api/pages/:id', (req: Request, res: Response) => {
  const existing = db.getPage(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Page not found' });
  }
  const updates: Record<string, unknown> = {};
  if (req.body.title !== undefined) updates.title = req.body.title;
  if (req.body.icon !== undefined) updates.icon = req.body.icon;
  if (req.body.content !== undefined) updates.content = req.body.content;
  if (req.body.parentId !== undefined) updates.parentId = req.body.parentId;

  const page = db.updatePage(req.params.id, updates);
  return res.json(page);
});

app.delete('/api/pages/:id', (req: Request, res: Response) => {
  const success = db.deletePage(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Page not found' });
  }
  return res.json({ success: true });
});

// --- Database API Routes ---
app.get('/api/databases', (_req: Request, res: Response) => {
  const databases = db.getDatabases();
  return res.json(databases);
});

app.post('/api/databases', (req: Request, res: Response) => {
  const { title, icon, schema } = req.body;
  const database = db.createDatabase({ title, icon, schema });
  return res.status(201).json(database);
});

app.get('/api/databases/:id', (req: Request, res: Response) => {
  const database = db.getDatabase(req.params.id);
  if (!database) {
    return res.status(404).json({ error: 'Database not found' });
  }
  return res.json(database);
});

app.put('/api/databases/:id', (req: Request, res: Response) => {
  const existing = db.getDatabase(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Database not found' });
  }
  const updates: Record<string, unknown> = {};
  if (req.body.title !== undefined) updates.title = req.body.title;
  if (req.body.icon !== undefined) updates.icon = req.body.icon;
  if (req.body.schema !== undefined) updates.schema = req.body.schema;

  const database = db.updateDatabase(req.params.id, updates);
  return res.json(database);
});

app.delete('/api/databases/:id', (req: Request, res: Response) => {
  const success = db.deleteDatabase(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Database not found' });
  }
  return res.json({ success: true });
});

// --- Row API Routes ---
app.post('/api/databases/:id/rows', (req: Request, res: Response) => {
  const properties = req.body.properties || {};
  const row = db.addRow(req.params.id, properties);
  return res.status(201).json(row);
});

app.put('/api/databases/:id/rows/:rowId', (req: Request, res: Response) => {
  const properties = req.body.properties || {};
  const updatedRow = db.updateRow(req.params.id, req.params.rowId, properties);
  if (!updatedRow) {
    return res.status(404).json({ error: 'Row not found' });
  }
  return res.json(updatedRow);
});

app.delete('/api/databases/:id/rows/:rowId', (req: Request, res: Response) => {
  const success = db.deleteRow(req.params.id, req.params.rowId);
  if (!success) {
    return res.status(404).json({ error: 'Row not found' });
  }
  return res.json({ success: true });
});

export default app;
