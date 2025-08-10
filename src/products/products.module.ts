import { Module } from '@nestjs/common';
import { ProductsUpdate, AddProductScene } from './products.update';

@Module({
  providers: [ProductsUpdate, AddProductScene],
})
export class ProductsModule {}
