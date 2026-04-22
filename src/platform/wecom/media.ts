/**
 * 媒体处理：图片/语音/文件的下载、AES 解密、保存
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createDecipheriv } from 'node:crypto';
import pino from 'pino';
import type { IMessagePlatform } from '../types.js';

const log = pino({ name: 'media' });

export function isImage(data: Buffer): boolean {
  if (data.length < 12) return false;
  // JPEG
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return true;
  // PNG
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return true;
  // GIF
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) return true;
  // WEBP
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
      data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return true;
  return false;
}

export function detectMediaType(data: Buffer): string {
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  if (data[0] === 0x47 && data[1] === 0x49) return 'image/gif';
  if (data.length > 12 && data[0] === 0x52 && data[8] === 0x57) return 'image/webp';
  return 'image/png';
}

export function aesDecryptImage(encData: Buffer, aesKey: string): Buffer | null {
  try {
    const padded = aesKey.length % 4 ? aesKey + '='.repeat(4 - (aesKey.length % 4)) : aesKey;
    const key = Buffer.from(padded, 'base64');
    if (key.length !== 32) return null;
    const iv = key.subarray(0, 16);
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    decipher.setAutoPadding(false);
    let plain = Buffer.concat([decipher.update(encData), decipher.final()]);
    // Remove PKCS7 padding
    const pad = plain[plain.length - 1];
    if (pad >= 1 && pad <= 32) plain = plain.subarray(0, plain.length - pad);
    // Search for image magic bytes
    for (let offset = 0; offset < Math.min(64, plain.length); offset++) {
      if (isImage(plain.subarray(offset))) {
        log.info(`AES decrypt image ok offset=${offset} size=${plain.length - offset}`);
        return plain.subarray(offset);
      }
    }
    log.info('AES decrypted but no image magic found');
    return null;
  } catch (e) {
    log.error(e, 'AES decrypt failed');
    return null;
  }
}

export async function downloadMedia(
  mediaInfo: { url?: string; mediaId?: string; aeskey?: string },
  platform: IMessagePlatform,
): Promise<Buffer | null> {
  let data: Buffer | null = null;

  if (mediaInfo.url) {
    try {
      const resp = await fetch(mediaInfo.url, { signal: AbortSignal.timeout(30_000) });
      if (resp.ok) data = Buffer.from(await resp.arrayBuffer());
    } catch (e) {
      log.error(e, 'download url failed');
    }
    if (data && !isImage(data) && mediaInfo.aeskey) {
      const dec = aesDecryptImage(data, mediaInfo.aeskey);
      if (dec) data = dec;
    }
  }

  if (!data && mediaInfo.mediaId) {
    data = await platform.getMedia(mediaInfo.mediaId);
  }
  return data;
}

export async function saveMedia(
  workDir: string, chatId: string, data: Buffer, subdir: string, filename?: string,
): Promise<string> {
  const dir = join(workDir, 'sessions', chatId, subdir);
  await mkdir(dir, { recursive: true });
  const id = Math.random().toString(36).slice(2, 10);
  let name: string;
  if (filename) {
    name = `${id}_${filename}`;
  } else if (subdir === 'images') {
    const ext = { 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }[detectMediaType(data)] ?? '.png';
    name = `${id}${ext}`;
  } else {
    name = `${id}.bin`;
  }
  const path = join(dir, name);
  await writeFile(path, data);
  log.info(`Media saved chatId=${chatId} path=${path} size=${data.length}`);
  return path;
}
