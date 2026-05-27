import { Controller, Get, Header, NotFoundException, Query, Res } from '@nestjs/common';
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
  @Header('Content-Type', 'audio/wav')
  stream(@Query('path') path: string | undefined, @Res() res: Response): void {
    if (!path?.trim()) {
      throw new NotFoundException('path query is required');
    }
    const stream = this.recordingsService.openStream(path);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(404).end();
      }
    });
    stream.pipe(res);
  }
}
