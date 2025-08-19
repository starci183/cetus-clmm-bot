import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { CetusService } from './cetus/cetus.service';

@Module({
  imports: [
    ConfigModule.forRoot({
    envFilePath: ['.env'],
    isGlobal: true,
  })
],
  controllers: [AppController],
  providers: [AppService, CetusService],
})
export class AppModule { }
