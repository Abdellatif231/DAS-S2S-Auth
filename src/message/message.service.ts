import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  async createMessage(data: CreateMessageDto) {
    const [sender, receiver] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: data.senderId } }),
      this.prisma.user.findUnique({ where: { id: data.receiverId } }),
    ]);

    if (!sender) {
      throw new NotFoundException(`Sender with id ${data.senderId} not found`);
    }

    if (!receiver) {
      throw new NotFoundException(
        `Receiver with id ${data.receiverId} not found`,
      );
    }

    return this.prisma.message.create({
      data: {
        content: data.content,
        senderId: data.senderId,
        receiverId: data.receiverId,
      },
    });
  }

  async findMessageById(id: string) {
    const message = await this.prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      throw new NotFoundException(`Message with id ${id} not found`);
    }

    return message;
  }

  async getChatHistory(userAId: string, userBId: string) {
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userAId, receiverId: userBId },
          { senderId: userBId, receiverId: userAId },
        ],
      },
      orderBy: { sentAt: 'asc' },
    });

    if (messages.length === 0) {
      throw new NotFoundException('No messages found between users');
    }

    return messages;
  }

  async deleteMessage(id: string) {
    try {
      return await this.prisma.message.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Message with id ${id} not found`);
      }
      throw error;
    }
  }
}
