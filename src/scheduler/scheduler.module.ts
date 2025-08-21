import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ReportsModule } from '../reports/reports.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportsService } from 'src/reports/reports.service';
import { EncryptionService } from 'src/settings/encryption.service';

@Module({
    imports: [ScheduleModule.forRoot(), ReportsModule],
    providers: [SchedulerService, ReportsService, EncryptionService],
})
export class SchedulerModule {}
