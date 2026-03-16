import { IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateMessageDto {
  @IsUUID()
  @IsNotEmpty()
  senderId: string;

  @IsUUID()
  @IsNotEmpty()
  receiverId: string;

  @IsString()
  @MinLength(1)
  @IsNotEmpty()
  content: string;
}
