import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ReportsModule } from '../reports/reports.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot(), ReportsModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
