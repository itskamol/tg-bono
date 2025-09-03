import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ReportsModule } from '../reports/reports.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EncryptionService } from 'src/settings/encryption.service';
import { GoogleSheetsModule } from 'src/sheets/google-sheets.module';
import { EmailModule } from 'src/email/email.module';

@Module({
    imports: [ScheduleModule.forRoot(), ReportsModule, GoogleSheetsModule, EmailModule],
    providers: [SchedulerService, EncryptionService],
})
export class SchedulerModule {}
