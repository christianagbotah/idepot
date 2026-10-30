import type {
  ArgumentsHost,
  ExceptionFilter} from '@nestjs/common';
import {
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '@idepot/domain';
import { NoActiveTransactionError } from './db/unit-of-work.js';

const DOMAIN_STATUS: Record<string, HttpStatus> = {
  validation_failed: HttpStatus.BAD_REQUEST,
  unauthorized: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
};

/** Maps domain errors to HTTP; never leaks stack traces. */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json({
        error: exception.message,
        code: exception.getStatus() === HttpStatus.NOT_FOUND ? 'not_found' : 'request_failed',
      });
      return;
    }
    if (exception instanceof DomainError) {
      const status = DOMAIN_STATUS[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
      res.status(status).json({ error: exception.message, code: exception.code });
      return;
    }
    if (exception instanceof NoActiveTransactionError) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: exception.message,
        code: 'no_active_transaction',
      });
      return;
    }
    const message =
      exception instanceof Error && exception.name === 'ValidationError'
        ? exception.message
        : 'internal server error';
    res
      .status(exception instanceof Error && exception.name === 'ValidationError'
        ? HttpStatus.BAD_REQUEST
        : HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: message, code: 'internal_error' });
  }
}
