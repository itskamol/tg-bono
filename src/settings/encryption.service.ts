import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as CryptoJS from 'crypto-js';

@Injectable()
export class EncryptionService {
  private readonly key: string;

  constructor(private readonly configService: ConfigService) {
    this.key = this.configService.get<string>('ENCRYPTION_KEY');
    if (!this.key) {
      throw new Error('ENCRYPTION_KEY is not set in the environment variables.');
    }
  }

  encrypt(text: string): string {
    return CryptoJS.AES.encrypt(text, this.key).toString();
  }

  decrypt(ciphertext: string): string {
    const bytes = CryptoJS.AES.decrypt(ciphertext, this.key);
    return bytes.toString(CryptoJS.enc.Utf8);
  }
}
