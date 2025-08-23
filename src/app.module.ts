import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { session } from 'telegraf';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { SidesModule } from './sides/sides.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';

import { ReportsModule } from './reports/reports.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SettingsModule } from './settings/settings.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { GoogleSheetsModule } from './sheets/google-sheets.module';

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
        SidesModule,
        OrdersModule,
        ReportsModule,
        PrismaModule,
        TelegramModule,
        AuthModule,
        SettingsModule,
        SchedulerModule,
        CategoriesModule,
        GoogleSheetsModule
    ],
})
export class AppModule {}
