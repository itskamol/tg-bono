import { Module } from '@nestjs/common';
import { SettingsUpdate } from './settings.update';
import { EmailSettingsScene, GoogleSheetsSettingsScene, ScheduleSettingsScene } from './scenes';
import { ChannelSettingsScene } from './scenes/channel-settings.scene';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notifications/notification.module';
import { EncryptionService } from './encryption.service';
import { ConfigModule } from '@nestjs/config';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SchedulerService } from 'src/scheduler/scheduler.service';
import { ReportsService } from 'src/reports/reports.service';
import { GoogleSheetsService } from 'src/sheets/google-sheets.service';
import { EmailModule } from 'src/email/email.module';

@Module({
    imports: [PrismaModule, ConfigModule, SchedulerModule, EmailModule, NotificationModule],
    providers: [
        SettingsUpdate,
        EmailSettingsScene,
        GoogleSheetsSettingsScene,
        ScheduleSettingsScene,
        ChannelSettingsScene,
        EncryptionService,
        SchedulerService,
        ReportsService,
        GoogleSheetsService,
    ],
})
export class SettingsModule {}
