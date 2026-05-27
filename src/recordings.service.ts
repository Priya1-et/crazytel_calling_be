import { Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream, existsSync, readdirSync, statSync } from 'fs';
import { join, normalize, resolve } from 'path';
import type { ReadStream } from 'fs';

export type RecordingDirection = 'incoming' | 'outgoing';

export interface RecordingListItem {
  id: string;
  direction: RecordingDirection;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  streamUrl: string;
}

@Injectable()
export class RecordingsService {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = process.env.RECORDINGS_DIR ?? '/var/spool/asterisk/recordings';
  }

  listRecordings(direction?: RecordingDirection): RecordingListItem[] {
    const dirs: RecordingDirection[] = direction ? [direction] : ['incoming', 'outgoing'];
    const items: RecordingListItem[] = [];

    for (const dir of dirs) {
      const fullDir = join(this.baseDir, dir);
      if (!existsSync(fullDir)) {
        continue;
      }
      const files = readdirSync(fullDir).filter((f) => f.endsWith('.wav'));
      for (const filename of files) {
        const fullPath = join(fullDir, filename);
        const stat = statSync(fullPath);
        if (!stat.isFile()) {
          continue;
        }
        const id = `${dir}/${filename}`;
        items.push({
          id,
          direction: dir,
          filename,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
          streamUrl: `/v1/recordings/stream?path=${encodeURIComponent(id)}`,
        });
      }
    }

    return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  openStream(relativePath: string): ReadStream {
    const safe = this.resolveSafePath(relativePath);
    if (!existsSync(safe)) {
      throw new NotFoundException(`Recording not found: ${relativePath}`);
    }
    return createReadStream(safe);
  }

  private resolveSafePath(relativePath: string): string {
    const decoded = decodeURIComponent(relativePath);
    const normalized = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
    const full = resolve(this.baseDir, normalized);
    const base = resolve(this.baseDir);
    if (!full.startsWith(base + '/') && full !== base) {
      throw new NotFoundException('Invalid recording path');
    }
    if (!/^incoming\/[^/]+\.wav$/.test(normalized) && !/^outgoing\/[^/]+\.wav$/.test(normalized)) {
      throw new NotFoundException('Invalid recording path');
    }
    return full;
  }
}
