/**
 * WebFetch tool - fetch URL content for documentation lookup
 */

import { ToolDefinition } from '../shared/types';
import { formatTextResult, formatErrorResult } from '../context/protocol';

export const webfetchTool: ToolDefinition = {
  name: 'webfetch',
  description: 'Fetch content from a URL. Useful for looking up documentation, API references, or error solutions. Returns text content (HTML tags stripped).',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch (must be http:// or https://)' },
      maxChars: { type: 'number', description: 'Maximum characters to return (default 5000)' },
    },
    required: ['url'],
  },
  execute: async (args) => {
    const url = args.url as string;
    const maxChars = (args.maxChars as number) || 5000;

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return formatErrorResult('URL must start with http:// or https://');
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'VTE-Code-Agent/1.0',
          'Accept': 'text/html,text/plain,application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return formatErrorResult(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let text = await response.text();

      // Strip HTML tags for HTML content
      if (contentType.includes('text/html')) {
        text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
        text = text.replace(/<[^>]+>/g, ' ');
        text = text.replace(/\s+/g, ' ').trim();
      }

      // Truncate
      if (text.length > maxChars) {
        text = text.substring(0, maxChars) + '\n... (truncated)';
      }

      return formatTextResult(text);
    } catch (err: any) {
      return formatErrorResult(`Fetch failed: ${err.message}`);
    }
  },
};
