import {
  Controller,
  Patch,
  Delete,
  Post,
  Get,
  Body,
  Param,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @RequireScopes('user:write')
  @Post()
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.userService.createUser(createUserDto);
  }

  @RequireScopes('user:read')
  @Get()
  async getAllUsers() {
    return this.userService.findAll();
  }

  @RequireScopes('user:read')
  @Get('id/:id')
  async getUserById(@Param('id') id: string) {
    return this.userService.findUserById(id);
  }

  @RequireScopes('user:write')
  @Patch('id/:id')
  async updateUserById(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.updateUserById(id, updateUserDto);
  }

  @RequireScopes('user:delete')
  @Delete('id/:id')
  async deleteUserById(@Param('id') id: string) {
    return this.userService.deleteUserById(id);
  }

  @RequireScopes('user:read')
  @Get(':username')
  async getUserByUsername(@Param('username') username: string) {
    return this.userService.findUserByUsername(username);
  }

  @RequireScopes('user:write')
  @Patch(':username')
  async updateUser(
    @Param('username') username: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.updateUser(username, updateUserDto);
  }

  @RequireScopes('user:delete')
  @Delete(':username')
  async deleteUser(@Param('username') username: string) {
    return this.userService.deleteUser(username);
  }
}
