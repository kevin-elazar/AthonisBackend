import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    this.logger.debug('Original exception response:', exceptionResponse);

    // Remove spread operator e define estrutura explícita
    const errorResponse = {
      statusCode: status,
      success: false,
      message: typeof exceptionResponse === 'object' 
        ? exceptionResponse['message'] 
        : exception.message,
      errors: typeof exceptionResponse === 'object' 
        ? exceptionResponse['errors'] || [] 
        : [],
      timestamp: new Date().toISOString()
    };

    this.logger.debug('Formatted error response:', errorResponse);

    response.status(status).json(errorResponse);
  }
}