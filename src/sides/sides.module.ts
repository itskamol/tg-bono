import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SidesUpdate } from './sides.update';
import { AddSideScene } from './scenes/add-side.scene';
import { EditSideScene } from './scenes/edit-side.scene';
import { DeleteSideScene } from './scenes/delete-side.scene';

@Module({
    imports: [PrismaModule],
    providers: [
        SidesUpdate,
        AddSideScene,
        EditSideScene,
        DeleteSideScene,
    ],
    exports: [
        SidesUpdate,
        AddSideScene,
        EditSideScene,
        DeleteSideScene,
    ],
})
export class SidesModule {}