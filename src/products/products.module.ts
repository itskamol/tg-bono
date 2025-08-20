import { Module } from '@nestjs/common';
import {
  ProductsUpdate,
  AddProductScene,
  EditProductScene,
} from './products.update';

@Module({
  providers: [ProductsUpdate, AddProductScene, EditProductScene],
})
export class ProductsModule {}
