import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(userId: number) {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.notificationPreference.create({ data: { userId } });
  }

  async update(userId: number, input: UpdateNotificationPreferencesDto) {
    await this.findOrCreate(userId); // ensure a row exists before updating
    return this.prisma.notificationPreference.update({
      where: { userId },
      data: input,
    });
  }
}
