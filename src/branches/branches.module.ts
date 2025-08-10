import { Module } from '@nestjs/common';
import { BranchesUpdate, AddBranchScene } from './branches.update';

@Module({
  providers: [BranchesUpdate, AddBranchScene],
})
export class BranchesModule {}
