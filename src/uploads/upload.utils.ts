import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, promises as fs } from 'node:fs';
import { extname, join } from 'node:path';
import type { Request } from 'express';
import type { FileFilterCallback } from 'multer';
import { diskStorage, type StorageEngine } from 'multer';

// This file compiles to dist/src/uploads/upload.utils.js — one directory
// deeper than main.ts (dist/src/main.js), so it needs one more '..' to
// reach the same project-root uploads/ directory main.ts serves via
// app.useStaticAssets. Getting this wrong silently writes files to
// dist/uploads instead of the served directory (404s look like the file
// vanished, but it's really just sitting one level too deep).
const UPLOAD_ROOT = join(__dirname, '..', '..', '..', 'uploads');
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// Shared by both the avatar (User) and logo (Organization) upload routes —
// same validation/storage/cleanup rules, different subdirectory.
export function imageUploadOptions(subdir: 'avatars' | 'logos'): {
  storage: StorageEngine;
  limits: { fileSize: number };
  fileFilter: (
    req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback,
  ) => void;
} {
  const dir = join(UPLOAD_ROOT, subdir);

  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(
          new BadRequestException(
            'Only JPEG, PNG, WEBP, or GIF images are allowed',
          ),
        );
        return;
      }
      cb(null, true);
    },
  };
}

// `file.path` (absolute, set by multer's diskStorage) -> the relative
// "/uploads/<subdir>/<name>" URL stored on the User/Organization row.
export function toPublicUploadUrl(file: Express.Multer.File): string {
  const relative = file.path.slice(UPLOAD_ROOT.length).replace(/\\/g, '/');
  return `/uploads${relative}`;
}

// Best-effort cleanup of a previous avatar/logo when it's replaced or
// removed — swallows ENOENT (already gone) since this is hygiene, not a
// correctness requirement of the request it's called from.
export async function deleteUploadedFile(
  publicUrl: string | null | undefined,
): Promise<void> {
  if (!publicUrl || !publicUrl.startsWith('/uploads/')) return;
  const absolutePath = join(UPLOAD_ROOT, publicUrl.slice('/uploads/'.length));
  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
