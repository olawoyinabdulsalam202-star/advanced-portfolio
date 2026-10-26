import {randomUUID} from 'node:crypto';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function sniffImage(buffer) {
  if (!buffer || buffer.length < 12) return '';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'jpeg';
  if (/^GIF8[79]a/.test(buffer.subarray(0, 6).toString())) return 'gif';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return '';
}

export function bucketPrefix(env, bucket) {
  if (!env.SUPABASE_URL) return '';
  return `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/`;
}

export async function storeImage({db, bucket, folder, buffer}) {
  const type = sniffImage(buffer);
  if (!type) throw Object.assign(new Error('Not a supported image.'), {status: 400});
  if (buffer.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('Image is larger than 5 MB.'), {status: 400});
  const path = `${folder}/${randomUUID()}.${type}`;
  const {error} = await db.storage.from(bucket).upload(path, buffer, {contentType: `image/${type}`, upsert: false});
  if (error) throw Object.assign(new Error(error.message || 'Upload failed.'), {status: 503});
  return {path, url: db.storage.from(bucket).getPublicUrl(path).data.publicUrl};
}

export async function removeStored({db, env, bucket, url}) {
  const prefix = bucketPrefix(env, bucket);
  if (!url || !prefix || !url.startsWith(prefix)) return;
  await db.storage.from(bucket).remove([decodeURIComponent(url.slice(prefix.length))]).catch(() => {});
}

export async function downloadImage(url, {fetchImpl = fetch, headers = {}} = {}) {
  const res = await fetchImpl(url, {headers, signal: AbortSignal.timeout(15000), redirect: 'follow'});
  if (!res.ok) throw new Error(`Image request failed (${res.status}).`);
  const length = Number(res.headers.get('content-length') || 0);
  if (length > MAX_IMAGE_BYTES) throw new Error('Image is larger than 5 MB.');
  return Buffer.from(await res.arrayBuffer());
}
