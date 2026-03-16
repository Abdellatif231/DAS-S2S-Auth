import { Body, Controller, Get, Param, Post, Delete} from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @RequireScopes('message:write')
  @Post()
  async createMessage(@Body() createMessageDto: CreateMessageDto) {
    return this.messageService.createMessage(createMessageDto);
  }

  @RequireScopes('message:read')
  @Get('chat/:userAId/:userBId')
  async getChatHistory(
    @Param('userAId') userAId: string,
    @Param('userBId') userBId: string,
  ) {
    return this.messageService.getChatHistory(userAId, userBId);
  }

  @RequireScopes('message:read')
  @Get(':id')
  async getMessageById(@Param('id') id: string) {
    return this.messageService.findMessageById(id);
  }

  @RequireScopes('message:delete')
  @Delete(':id')
  async deleteMessage(@Param('id') id: string) {
    return this.messageService.deleteMessage(id);
  }
}