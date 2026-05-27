import { Controller, Get, NotFoundException, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RecordingsService, type RecordingDirection } from './recordings.service';

@Controller('v1/recordings')
export class RecordingsController {
  constructor(private readonly recordingsService: RecordingsService) {}

  @Get()
  list(@Query('direction') direction?: string) {
    const dir =
      direction === 'incoming' || direction === 'outgoing'
        ? (direction as RecordingDirection)
        : undefined;
    return { recordings: this.recordingsService.listRecordings(dir) };
  }

  @Get('stream')
  stream(@Query('path') path: string | undefined, @Res() res: Response): void {
    if (!path?.trim()) {
      throw new NotFoundException('path query is required');
    }
    const { stream, sizeBytes } = this.recordingsService.openStreamWithMeta(path);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', sizeBytes);
    res.setHeader('Accept-Ranges', 'bytes');
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(404).end();
      }
    });
    stream.pipe(res);
  }
}
