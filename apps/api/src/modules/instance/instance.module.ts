import { Module } from '@nestjs/common';

import { AuthModule } from '../auth';
import { PrismaService } from '../prisma/services/prisma.service';
import { InstanceController } from './instance.controller';

@Module({
  imports: [AuthModule],
  controllers: [InstanceController],
  providers: [PrismaService],
})
export class InstanceModule {}
