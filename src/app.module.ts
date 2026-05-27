import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RecordingsController } from './recordings.controller';
import { RecordingsService } from './recordings.service';

@Module({
  imports: [],
  controllers: [AppController, RecordingsController],
  providers: [AppService, RecordingsService],
})
export class AppModule {}
