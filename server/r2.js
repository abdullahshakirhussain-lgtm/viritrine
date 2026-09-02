// Cloudflare R2 (S3-compatible) media storage. When the R2_* env vars are set,
// uploads go to the bucket and are served from R2_PUBLIC_BASE; otherwise the app
// falls back to local disk (so local dev works with no R2 config). Mirrors the
// "unset key → disabled, app keeps working" pattern used by ai.js / sms.js.
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const r2Configured = !!(
  process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_ENDPOINT && process.env.R2_BUCKET && process.env.R2_PUBLIC_BASE
);

const PUBLIC = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");
let client = null;
if (r2Configured) {
  client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
}

const publicUrl = (key) => `${PUBLIC}/${String(key).replace(/^\/+/, "")}`;

// Store a buffer under `key`; returns the public URL. Long immutable cache — keys
// are content-random so a new upload always has a new URL.
async function putObject(key, body, contentType) {
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET, Key: key, Body: body,
    ContentType: contentType || "application/octet-stream",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return publicUrl(key);
}

// If `url` is one of ours on R2, return its object key, else null.
function keyFromUrl(url) {
  if (!url || !PUBLIC || !String(url).startsWith(PUBLIC + "/")) return null;
  return String(url).slice(PUBLIC.length + 1);
}

async function deleteByUrl(url) {
  const key = keyFromUrl(url);
  if (!key || !client) return false;
  try { await client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key })); return true; }
  catch { return false; }
}

module.exports = { r2Configured, putObject, publicUrl, keyFromUrl, deleteByUrl };
