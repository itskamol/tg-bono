import { Module } from '@nestjs/common';
import { CategoriesUpdate } from './categories.update';
import { AddCategoryScene } from './scenes/add-category.scene';
import { EditCategoryScene } from './scenes/edit-category.scene';
import { DeleteCategoryScene } from './scenes/delete-category.scene';

@Module({
    providers: [
        CategoriesUpdate,
        AddCategoryScene,
        EditCategoryScene,
        DeleteCategoryScene,
    ],
    exports: [
        CategoriesUpdate,
        AddCategoryScene,
        EditCategoryScene,
        DeleteCategoryScene,
    ],
})
export class CategoriesModule {}