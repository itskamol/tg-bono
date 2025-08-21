import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { session } from 'telegraf';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ReportsModule } from './reports/reports.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SettingsModule } from './settings/settings.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true, // Make ConfigService available globally
        }),
        TelegrafModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                token: configService.get<string>('TELEGRAM_BOT_TOKEN'),
                middlewares: [session()],
            }),
            inject: [ConfigService],
        }),
        UsersModule,
        BranchesModule,
        ProductsModule,
        OrdersModule,
        ReportsModule,
        PrismaModule,
        TelegramModule,
        AuthModule,
        SettingsModule,
        SchedulerModule,
    ],
})
export class AppModule {}
