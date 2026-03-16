import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ConflictException, NotFoundException } from '@nestjs/common';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(data: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data,
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(`User with username/email already exists`);
      }
      throw error;
    }
  }

  async findAll() {
    const users = await this.prisma.user.findMany();
    if (users.length === 0) {
      throw new NotFoundException('No users found');
    }
    return users;
  }

  async findUserByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });
    if (!user) {
      throw new NotFoundException(`User with username ${username} not found`);
    }
    return user;
  }

  async findUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  async updateUser(username: string, data: UpdateUserDto) {
    try {
      return await this.prisma.user.update({
        where: { username },
        data,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`User with username ${username} not found`);
      }
      throw error;
    }
  }

  async updateUserById(id: string, data: UpdateUserDto) {
    try {
      return await this.prisma.user.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`User with id ${id} not found`);
      }
      throw error;
    }
  }

  async deleteUser(username: string) {
    try {
      return await this.prisma.user.delete({
        where: { username },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`User with username ${username} not found`);
      }
      throw error;
    }
  }

  async deleteUserById(id: string) {
    try {
      return await this.prisma.user.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`User with id ${id} not found`);
      }
      throw error;
    }
  }
}
