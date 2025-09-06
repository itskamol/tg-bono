import { Module } from '@nestjs/common';
import { ReportsUpdate } from './reports.update';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionService } from 'src/settings/encryption.service';
import { GoogleSheetsModule } from 'src/sheets/google-sheets.module';
import { BaseReports } from './scenes/base-reports';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
    imports: [PrismaModule, GoogleSheetsModule],
    providers: [
        ReportsUpdate,
        BaseReports,
        EncryptionService,
    ],
    exports: [],
})
export class ReportsModule {}
