import { Module } from '@nestjs/common';
import { OrdersUpdate } from './orders.update';
import { NewOrderScene, OrderSearchScene } from './scenes';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notifications/notification.module';
import { GoogleSheetsService } from '../sheets/google-sheets.service';
import { EncryptionService } from '../settings/encryption.service';

@Module({
    imports: [PrismaModule, NotificationModule],
    providers: [OrdersUpdate, NewOrderScene, OrderSearchScene, GoogleSheetsService, EncryptionService],
})
export class OrdersModule {}
