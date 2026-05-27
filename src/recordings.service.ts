import { Injectable, NotFoundException } from '@nestjs/common';
import { closeSync, createReadStream, existsSync, openSync, readSync, readdirSync, statSync } from 'fs';
import { join, normalize, resolve } from 'path';
import type { ReadStream } from 'fs';

export type RecordingDirection = 'incoming' | 'outgoing';

export interface RecordingListItem {
  id: string;
  direction: RecordingDirection;
  filename: string;
  sizeBytes: number;
  durationSeconds?: number;
  createdAt: string;
  streamUrl: string;
}

export interface RecordingStream {
  stream: ReadStream;
  sizeBytes: number;
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
          durationSeconds: this.getWavDurationSeconds(fullPath, stat.size),
          createdAt: stat.mtime.toISOString(),
          streamUrl: `/v1/recordings/stream?path=${encodeURIComponent(id)}`,
        });
      }
    }

    return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  openStream(relativePath: string): ReadStream {
    return this.openStreamWithMeta(relativePath).stream;
  }

  openStreamWithMeta(relativePath: string): RecordingStream {
    const safe = this.resolveSafePath(relativePath);
    if (!existsSync(safe)) {
      throw new NotFoundException(`Recording not found: ${relativePath}`);
    }
    const stat = statSync(safe);
    return {
      stream: createReadStream(safe),
      sizeBytes: stat.size,
    };
  }

  private getWavDurationSeconds(filePath: string, fileSize: number): number | undefined {
    try {
      const fd = openSync(filePath, 'r');
      const header = Buffer.alloc(512);
      const bytesRead = readSync(fd, header, 0, header.length, 0);
      closeSync(fd);
      if (bytesRead < 44 || header.toString('ascii', 0, 4) !== 'RIFF') {
        return undefined;
      }

      const byteRate = header.readUInt32LE(28);
      if (byteRate <= 0) {
        return undefined;
      }

      let offset = 12;
      while (offset + 8 <= bytesRead) {
        const chunkId = header.toString('ascii', offset, offset + 4);
        const chunkSize = header.readUInt32LE(offset + 4);
        if (chunkId === 'data') {
          return Math.max(0, Math.round(chunkSize / byteRate));
        }
        offset += 8 + chunkSize;
      }

      const dataSize = Math.max(0, fileSize - 44);
      return Math.max(0, Math.round(dataSize / byteRate));
    } catch {
      return undefined;
    }
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
