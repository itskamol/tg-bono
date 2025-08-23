import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { BranchesModule } from '../branches/branches.module';
import { SidesModule } from '../sides/sides.module';
import { OrdersModule } from '../orders/orders.module';
import { ReportsModule } from '../reports/reports.module';
import { CategoriesModule } from '../categories/categories.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersUpdate } from 'src/users/users.update';
import { BranchesUpdate } from 'src/branches/branches.update';
import { OrdersUpdate } from 'src/orders/orders.update';
import { ReportsUpdate } from 'src/reports/reports.update';
import { SettingsUpdate } from 'src/settings/settings.update';


@Module({
    imports: [
        PrismaModule,
        AuthModule,
        UsersModule,
        BranchesModule,
        SidesModule,
        OrdersModule,
        ReportsModule,
        CategoriesModule,
        SettingsModule,
    ],
    providers: [TelegramService, UsersUpdate, BranchesUpdate, OrdersUpdate, ReportsUpdate, SettingsUpdate],
})
export class TelegramModule {}
