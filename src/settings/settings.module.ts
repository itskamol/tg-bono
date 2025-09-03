import { Module } from '@nestjs/common';
import { SettingsUpdate } from './settings.update';
import { EmailSettingsScene, GoogleSheetsSettingsScene, ScheduleSettingsScene } from './scenes';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionService } from './encryption.service';
import { ConfigModule } from '@nestjs/config';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SchedulerService } from 'src/scheduler/scheduler.service';
import { ReportsService } from 'src/reports/reports.service';
import { GoogleSheetsService } from 'src/sheets/google-sheets.service';
import { EmailModule } from 'src/email/email.module';

@Module({
    imports: [PrismaModule, ConfigModule, SchedulerModule, EmailModule],
    providers: [
        SettingsUpdate,
        EmailSettingsScene,
        GoogleSheetsSettingsScene,
        ScheduleSettingsScene,
        EncryptionService,
        SchedulerService,
        ReportsService,
        GoogleSheetsService,
    ],
})
export class SettingsModule {}
