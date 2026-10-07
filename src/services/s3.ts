import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
import path from 'node:path';
import type { Readable } from 'node:stream';

export interface S3Config {
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  region: string;
  bucketName: string | undefined;
  folderPrefix: string;
  isValid: boolean;
}

export function getS3Config(): S3Config {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'ap-northeast-2';
  const bucketName = process.env.AWS_BUCKET_NAME;
  const folderPrefix = (process.env.AWS_S3_FOLDER_PREFIX || 'notion-clone/uploads').replace(/^\/+|\/+$/g, '');

  const isValid = Boolean(
    accessKeyId &&
    secretAccessKey &&
    bucketName &&
    accessKeyId !== 'mock_access_key' &&
    accessKeyId !== 'your_aws_access_key_id'
  );

  return { accessKeyId, secretAccessKey, region, bucketName, folderPrefix, isValid };
}

export function getS3Client(): S3Client | null {
  const config = getS3Config();
  if (!config.isValid || !config.accessKeyId || !config.secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export interface PresignedUrlResult {
  uploadUrl: string;
  fileUrl: string;
  streamUrl: string;
  key: string;
  isMockFallback: boolean;
  bucket?: string;
  region?: string;
}

export async function createPresignedUploadUrl(
  filename: string,
  contentType: string,
  baseUrl: string
): Promise<PresignedUrlResult> {
  const config = getS3Config();
  const fileExt = path.extname(filename) || '.png';
  const cleanBaseName = path.basename(filename, fileExt).replace(/[^a-zA-Z0-9_-]/g, '_');
  const uniqueKey = `${config.folderPrefix}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${cleanBaseName}${fileExt}`;

  const client = getS3Client();

  // If real AWS credentials are active, create authentic S3 presigned PUT URL
  if (client && config.bucketName && config.isValid) {
    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: uniqueKey,
      ContentType: contentType,
    });

    // 1-hour expiration
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
    const fileUrl = `https://${config.bucketName}.s3.${config.region}.amazonaws.com/${uniqueKey}`;
    const streamUrl = `${baseUrl}/api/s3/stream?key=${encodeURIComponent(uniqueKey)}`;

    return {
      uploadUrl,
      fileUrl,
      streamUrl,
      key: uniqueKey,
      isMockFallback: false,
      bucket: config.bucketName,
      region: config.region,
    };
  }

  // Graceful local simulated S3 upload endpoint for local development
  const localKey = `uploads/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${cleanBaseName}${fileExt}`;
  const uploadUrl = `${baseUrl}/api/upload/direct?key=${encodeURIComponent(localKey)}&contentType=${encodeURIComponent(contentType)}`;
  const fileUrl = `${baseUrl}/${localKey}`;
  const streamUrl = fileUrl;

  return {
    uploadUrl,
    fileUrl,
    streamUrl,
    key: localKey,
    isMockFallback: true,
  };
}

export async function streamFromS3(key: string) {
  const client = getS3Client();
  const config = getS3Config();

  if (!client || !config.bucketName) {
    throw new Error('AWS S3 is not configured');
  }

  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  const response = await client.send(command);

  return {
    bodyStream: response.Body as Readable,
    contentType: response.ContentType || 'application/octet-stream',
    contentLength: response.ContentLength,
  };
}

export async function uploadDirectToS3(
  key: string,
  body: Buffer | Uint8Array | Readable,
  contentType: string
) {
  const client = getS3Client();
  const config = getS3Config();

  if (!client || !config.bucketName) {
    throw new Error('AWS S3 is not configured');
  }

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await client.send(command);
  const fileUrl = `https://${config.bucketName}.s3.${config.region}.amazonaws.com/${key}`;
  return { fileUrl, key };
}

export function getS3Status() {
  const config = getS3Config();
  return {
    connected: config.isValid,
    bucket: config.bucketName,
    region: config.region,
    folderPrefix: config.folderPrefix,
  };
}

export async function syncDatabaseToS3(jsonString: string): Promise<boolean> {
  try {
    const config = getS3Config();
    const client = getS3Client();
    if (!client || !config.bucketName || !config.isValid) return false;

    const basePrefix = config.folderPrefix.split('/')[0] || 'notion-clone';
    const dbKey = `${basePrefix}/data/notion.db.json`;

    await client.send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: dbKey,
      Body: jsonString,
      ContentType: 'application/json',
    }));
    return true;
  } catch (err) {
    console.warn('[S3 Database Sync Warning]:', err);
    return false;
  }
}

export async function fetchDatabaseFromS3(): Promise<string | null> {
  try {
    const config = getS3Config();
    const client = getS3Client();
    if (!client || !config.bucketName || !config.isValid) return null;

    const basePrefix = config.folderPrefix.split('/')[0] || 'notion-clone';
    const dbKey = `${basePrefix}/data/notion.db.json`;

    const res = await client.send(new GetObjectCommand({
      Bucket: config.bucketName,
      Key: dbKey,
    }));

    if (!res.Body) return null;
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  } catch {
    return null;
  }
}
