import { Module } from '@nestjs/common';
import { OrdersUpdate } from './orders.update';
import { NewOrderScene, OrderSearchScene } from './scenes';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [OrdersUpdate, NewOrderScene, OrderSearchScene],
})
export class OrdersModule {}
