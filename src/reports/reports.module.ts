import { Module } from '@nestjs/common';
import { ReportsUpdate } from './reports.update';

@Module({
  providers: [ReportsUpdate],
})
export class ReportsModule {}
