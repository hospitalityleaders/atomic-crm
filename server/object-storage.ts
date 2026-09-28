import crypto from "node:crypto";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { CrmSession } from "./auth.js";
import { withWorkspace } from "./tenant.js";

let client: S3Client | undefined;

function storageClient() {
  client ??= new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
  return client;
}

function bucket() {
  const value = process.env.S3_BUCKET;
  if (!value) throw new Error("S3_BUCKET is not configured");
  return value;
}

export async function ensureStorageBucket() {
  if (process.env.S3_CREATE_BUCKET !== "true") return;
  try {
    await storageClient().send(new HeadBucketCommand({ Bucket: bucket() }));
  } catch {
    await storageClient().send(new CreateBucketCommand({ Bucket: bucket() }));
  }
}

function safeFilename(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 180) || "file"
  );
}

export async function uploadFile(
  session: CrmSession,
  body: Buffer,
  filename: string,
  mimeType: string,
) {
  const id = crypto.randomUUID();
  const key = `${session.workspaceId}/${id}/${safeFilename(filename)}`;
  await storageClient().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: mimeType,
      Metadata: { workspace: session.workspaceId, uploadedBy: session.userId },
    }),
  );
  await withWorkspace(session, (database) =>
    database.query(
      `INSERT INTO crm_file_objects
        (id, workspace_id, object_key, filename, mime_type, size_bytes, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        session.workspaceId,
        key,
        filename,
        mimeType,
        body.byteLength,
        session.userId,
      ],
    ),
  );
  return { id, src: `/api/files/${id}`, title: filename };
}

export async function getFileUrl(session: CrmSession, fileId: string) {
  const result = await withWorkspace(session, (database) =>
    database.query(
      "SELECT object_key, filename, mime_type FROM crm_file_objects WHERE id = $1",
      [fileId],
    ),
  );
  const file = result.rows[0];
  if (!file) return null;
  return getSignedUrl(
    storageClient(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: file.object_key,
      ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      ResponseContentType: file.mime_type,
    }),
    { expiresIn: 300 },
  );
}
