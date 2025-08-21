import { Module } from '@nestjs/common';
import { ProductsUpdate } from './products.update';
import {
    AddProductScene,
    DeleteProductScene,
    EditProductNameScene,
    EditProductTypeScene,
    EditProductSidesScene,
    EditProductPriceScene,
    AddProductByNameScene,
} from './scenes';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [
        ProductsUpdate,
        AddProductScene,
        DeleteProductScene,
        EditProductNameScene,
        EditProductTypeScene,
        EditProductSidesScene,
        EditProductPriceScene,
        AddProductByNameScene,
    ],
})
export class ProductsModule {}
