import { Module } from '@nestjs/common';
import { ReportsUpdate } from './reports.update';
import {
    GeneralReportsScene,
    PaymentReportsScene,
    BranchReportsScene,
    UserReportsScene,
} from './scenes';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsService } from './reports.service';
import { EncryptionService } from 'src/settings/encryption.service';
import { GoogleSheetsModule } from 'src/sheets/google-sheets.module';
import { EmailModule } from 'src/email/email.module';

@Module({
    imports: [PrismaModule, GoogleSheetsModule, EmailModule],
    providers: [
        ReportsUpdate,
        GeneralReportsScene,
        PaymentReportsScene,
        BranchReportsScene,
        UserReportsScene,
        ReportsService,
        EncryptionService,
    ],
    exports: [ReportsService]
})
export class ReportsModule {}
