import { Module } from '@nestjs/common';
import { OrdersUpdate } from './orders.update';
import { NewOrderScene, OrderSearchScene } from './scenes';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
    imports: [PrismaModule, NotificationModule],
    providers: [OrdersUpdate, NewOrderScene, OrderSearchScene],
})
export class OrdersModule {}
