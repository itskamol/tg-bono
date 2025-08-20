import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { BranchesModule } from '../branches/branches.module';
import { OrdersModule } from '../orders/orders.module';
import { ReportsModule } from '../reports/reports.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, BranchesModule, OrdersModule, ReportsModule, ProductsModule],
  providers: [TelegramService],
})
export class TelegramModule {}
