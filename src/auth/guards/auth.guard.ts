import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TelegrafExecutionContext } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Role } from '@prisma/client';
import { Context } from 'src/interfaces/context.interface';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly prisma: PrismaService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Check if the route is marked as public
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            return true;
        }

        const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        // If no roles are required, allow access.
        if (!requiredRoles) {
            return true;
        }

        const ctx = TelegrafExecutionContext.create(context);

        const telegramContext = ctx.getContext<Context>();
        const { from } = telegramContext;

        if (!from) {
            throw new UnauthorizedException('Telegram user not found.');
        }

        const user = await this.prisma.user.findUnique({
            where: { telegram_id: from.id },
            include: {
                branch: true,
            },
        });

        if (!user) {
            throw new UnauthorizedException('User not found in the system.');
        }

        // Attach user to context for use in handlers
        telegramContext.user = user;
        const hasRole = () => requiredRoles.some((role: Role) => user.role === role);

        if (!hasRole()) {
            throw new UnauthorizedException("You don't have permission to perform this action.");
        }

        return true;
    }
}
