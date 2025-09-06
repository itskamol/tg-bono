import { Module } from '@nestjs/common';
import { SettingsUpdate } from './settings.update';
import { GoogleSheetsSettingsScene } from './scenes';
import { ChannelSettingsScene } from './scenes/channel-settings.scene';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notifications/notification.module';
import { EncryptionService } from './encryption.service';
import { ConfigModule } from '@nestjs/config';
import { GoogleSheetsService } from 'src/sheets/google-sheets.service';

@Module({
    imports: [PrismaModule, ConfigModule, NotificationModule],
    providers: [
        SettingsUpdate,
        GoogleSheetsSettingsScene,
        ChannelSettingsScene,
        EncryptionService,
        GoogleSheetsService,
    ],
})
export class SettingsModule {}
