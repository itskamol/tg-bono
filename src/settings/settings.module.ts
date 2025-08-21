import { Module } from '@nestjs/common';
import {
    SettingsUpdate,
    EmailSettingsScene,
    GoogleSheetsSettingsScene,
    ScheduleSettingsScene,
} from './settings.update';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionService } from './encryption.service';
import { ConfigModule } from '@nestjs/config';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SchedulerService } from 'src/scheduler/scheduler.service';
import { ReportsService } from 'src/reports/reports.service';

@Module({
    imports: [PrismaModule, ConfigModule, SchedulerModule],
    providers: [
        SettingsUpdate,
        EmailSettingsScene,
        GoogleSheetsSettingsScene,
        ScheduleSettingsScene,
        EncryptionService,
        SchedulerService,
        ReportsService,
    ],
})
export class SettingsModule {}
