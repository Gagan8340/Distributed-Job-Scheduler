import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  async generateFailureSummary(errorMessage: string): Promise<string> {
    this.logger.log('Calling AI service to generate failure summary...');
    // Simulate API call latency
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simple mocked heuristics for the assignment
    const lowerError = errorMessage.toLowerCase();
    
    if (lowerError.includes('connection refused') || lowerError.includes('timeout')) {
      return 'The target service appears to be down or unreachable. Verify network connectivity and ensure the external service is running.';
    }
    
    if (lowerError.includes('syntax') || lowerError.includes('typeerror')) {
      return 'The job payload contains invalid data or unexpected types. Review the payload schema and ensure all required fields are correctly formatted.';
    }

    if (lowerError.includes('rate limit') || lowerError.includes('429')) {
      return 'The external API rate limit was exceeded. Consider increasing the retry backoff duration or reducing queue concurrency.';
    }

    // Default generic response
    return `An unexpected error occurred during execution: "${errorMessage.substring(0, 50)}...". Check the worker logs for detailed stack traces and ensure the job dependencies are healthy.`;
  }
}
