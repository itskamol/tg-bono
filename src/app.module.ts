import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { BranchesModule } from './branches/branches.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [UsersModule, BranchesModule, ProductsModule, OrdersModule, ReportsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
