import { Module } from '@nestjs/common';
import { OrdersUpdate, NewOrderScene } from './orders.update';

@Module({
  providers: [OrdersUpdate, NewOrderScene],
})
export class OrdersModule {}
