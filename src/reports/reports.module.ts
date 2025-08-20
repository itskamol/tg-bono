import { Module } from '@nestjs/common';
import { ReportsUpdate } from './reports.update';
import { EncryptionService } from '../settings/encryption.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsService } from './reports.service';
import { GoogleSheetsModule } from 'src/sheets/google-sheets.module';

@Module({
  imports: [ConfigModule, PrismaModule, GoogleSheetsModule],
  providers: [ReportsUpdate, ReportsService, EncryptionService],
  exports: [ReportsService],
})
export class ReportsModule {}
