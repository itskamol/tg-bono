import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionService } from '../settings/encryption.service';

@Module({
    imports: [PrismaModule],
    providers: [NotificationService, EncryptionService],
    exports: [NotificationService],
})
export class NotificationModule {}