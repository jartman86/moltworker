/**
 * Web access tools — search and fetch
 */
import { registerTool } from './registry';

export function registerWebTools(): void {
  registerTool(
    {
      name: 'web_search',
      description:
        'Search the web using Google. Returns top results with titles, snippets, and URLs.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
        },
        required: ['query'],
      },
    },
    async (input, ctx) => {
      const query = input.query as string;
      const apiKey = ctx.env.GOOGLE_SEARCH_API_KEY;
      const cx = ctx.env.GOOGLE_SEARCH_CX;

      if (!apiKey || !cx) {
        return {
          result: 'Web search is not configured. GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX are required.',
          isError: true,
        };
      }

      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.searchParams.set('key', apiKey);
      url.searchParams.set('cx', cx);
      url.searchParams.set('q', query);
      url.searchParams.set('num', '5');

      const resp = await fetch(url.toString());
      if (!resp.ok) {
        const error = await resp.text();
        return { result: `Search API error (${resp.status}): ${error}`, isError: true };
      }

      const data: {
        items?: Array<{ title: string; snippet: string; link: string }>;
      } = await resp.json();

      if (!data.items || data.items.length === 0) {
        return { result: 'No results found.' };
      }

      const results = data.items
        .map((item, i) => `${i + 1}. **${item.title}**\n   ${item.snippet}\n   ${item.link}`)
        .join('\n\n');

      return { result: results };
    },
  );

  registerTool(
    {
      name: 'fetch_url',
      description:
        'Fetch and extract text content from a URL. Returns the readable text content of the page.',
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch',
          },
        },
        required: ['url'],
      },
    },
    async (input, _ctx) => {
      const urlStr = input.url as string;

      // SSRF protection: block private/internal IPs
      try {
        const parsed = new URL(urlStr);
        const hostname = parsed.hostname;
        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '0.0.0.0' ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.16.') ||
          hostname.startsWith('192.168.') ||
          hostname === '169.254.169.254' ||
          hostname.endsWith('.internal') ||
          hostname.endsWith('.local')
        ) {
          return { result: 'Blocked: cannot fetch private/internal URLs.', isError: true };
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return { result: 'Only http and https URLs are supported.', isError: true };
        }
      } catch {
        return { result: `Invalid URL: ${urlStr}`, isError: true };
      }

      const resp = await fetch(urlStr, {
        headers: {
          'User-Agent': 'BigEarn/1.0 (Web Fetch Tool)',
          Accept: 'text/html,application/xhtml+xml,text/plain,application/json',
        },
        redirect: 'follow',
      });

      if (!resp.ok) {
        return { result: `Fetch failed (${resp.status}): ${resp.statusText}`, isError: true };
      }

      const contentType = resp.headers.get('content-type') || '';
      const text = await resp.text();

      let content: string;
      if (contentType.includes('text/html') || contentType.includes('xhtml')) {
        content = stripHtml(text);
      } else {
        content = text;
      }

      // Truncate to prevent token explosion
      const maxLen = 10_000;
      if (content.length > maxLen) {
        content = content.slice(0, maxLen) + '\n\n[Content truncated at 10,000 characters]';
      }

      return { result: content };
    },
  );
}

function stripHtml(html: string): string {
  // Remove script and style tags with content
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  // Convert common block elements to newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote)[^>]*>/gi, '\n');
  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  return text.trim();
}
