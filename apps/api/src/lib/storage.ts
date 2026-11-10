import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { z } from 'zod';
import { formatIssues } from './validation';

export type StorageObject = {
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: string | undefined;
  readonly contentLength: number | undefined;
};

export type Storage = {
  upload(
    key: string,
    body: Uint8Array | ReadableStream<Uint8Array>,
    contentType: string,
  ): Promise<void>;
  download(key: string): Promise<StorageObject>;
  remove(key: string): Promise<void>;
  copy(sourceKey: string, destinationKey: string): Promise<void>;
};

export type StorageConfig = {
  readonly endpoint: string | undefined;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
};

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const storageEnvSchema = z.object({
  S3_ENDPOINT: z.preprocess(emptyToUndefined, z.url().optional()),
  S3_REGION: z.preprocess(emptyToUndefined, z.string().trim().min(1).default('us-east-1')),
  S3_BUCKET: z.string().trim().min(1),
  S3_ACCESS_KEY_ID: z.string().trim().min(1),
  S3_SECRET_ACCESS_KEY: z.string().trim().min(1),
  S3_FORCE_PATH_STYLE: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).default('true')),
});

const STORAGE_CREDENTIALS = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];

export function createStorageFromEnv(
  env: Record<string, string | undefined> = process.env,
): Storage {
  const configured = STORAGE_CREDENTIALS.some((name) => (env[name] ?? '').trim() !== '');
  if (!configured) {
    throw new Error(
      'Object storage is not configured. Set S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.',
    );
  }

  const parsed = storageEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid object storage configuration:\n${formatIssues(parsed.error, 'S3')}`);
  }

  return createStorage({
    endpoint: parsed.data.S3_ENDPOINT,
    region: parsed.data.S3_REGION,
    bucket: parsed.data.S3_BUCKET,
    accessKeyId: parsed.data.S3_ACCESS_KEY_ID,
    secretAccessKey: parsed.data.S3_SECRET_ACCESS_KEY,
    forcePathStyle: parsed.data.S3_FORCE_PATH_STYLE === 'true',
  });
}

export function createStorage(config: StorageConfig): Storage {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async upload(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },

    async download(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      if (!result.Body) throw new Error(`Stored object has no body: ${key}`);

      return {
        body: result.Body.transformToWebStream() as ReadableStream<Uint8Array>,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
      };
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },

    async copy(sourceKey, destinationKey) {
      const encodedSource = sourceKey.split('/').map(encodeURIComponent).join('/');
      await client.send(
        new CopyObjectCommand({
          Bucket: config.bucket,
          CopySource: `/${config.bucket}/${encodedSource}`,
          Key: destinationKey,
        }),
      );
    },
  };
}
