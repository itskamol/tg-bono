import { Module } from '@nestjs/common';
import { ReportsUpdate } from './reports.update';
import { 
  GeneralReportsScene,
  PaymentReportsScene,
  ProductReportsScene,
  RevenueReportsScene,
  BranchReportsScene,
  UserReportsScene
} from './scenes';
import { PrismaModule } from '../prisma/prisma.module';

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
  ],
})
export class ReportsModule {}
