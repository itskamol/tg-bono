import { Module } from '@nestjs/common';
import { OrdersUpdate } from './orders.update';
import { NewOrderScene } from './scenes';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [OrdersUpdate, NewOrderScene],
})
export class OrdersModule {}
