import { Module } from '@nestjs/common';
import { ReportsUpdate } from './reports.update';
import {
  GeneralReportsScene,
  PaymentReportsScene,
  ProductReportsScene,
  RevenueReportsScene,
  BranchReportsScene,
  UserReportsScene,
} from './scenes';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsService } from './reports.service';
import { EncryptionService } from 'src/settings/encryption.service';

@Module({
  imports: [PrismaModule],
  providers: [
    ReportsUpdate,
    GeneralReportsScene,
    PaymentReportsScene,
    ProductReportsScene,
    RevenueReportsScene,
    BranchReportsScene,
    UserReportsScene,
    ReportsService,
    EncryptionService
  ],
})
export class ReportsModule {}
