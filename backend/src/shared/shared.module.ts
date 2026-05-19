import { Global, Module } from '@nestjs/common';
import { CascadeArchiveService } from './cascade-archive.service';

@Global()
@Module({
  providers: [CascadeArchiveService],
  exports: [CascadeArchiveService],
})
export class SharedModule {}
