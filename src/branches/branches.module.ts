import { Module } from '@nestjs/common';
import { BranchesUpdate } from './branches.update';
import {
    AddBranchScene,
    DeleteBranchScene,
    EditBranchNameScene,
    EditBranchAddressScene,
} from './scenes';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [
        BranchesUpdate,
        AddBranchScene,
        DeleteBranchScene,
        EditBranchNameScene,
        EditBranchAddressScene,
    ],
})
export class BranchesModule {}
