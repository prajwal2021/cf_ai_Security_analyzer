import { Ai } from '@cloudflare/ai';

export interface Env {
  SESSION_STATE: DurableObjectNamespace;
  AI: Ai;
  LLAMA_MODEL_ID: string;
}

interface SessionData {
  lastAnalyzedUrl: string | null;
  normalizedHeaders: Record<string, string[]> | null;
  analysisReport: string | null;
  chatHistory: { role: string; content: string }[];
  timestamp: number;
}

export class SessionState implements DurableObject {
  state: DurableObjectState;
  env: Env;
  sessionData: SessionData;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessionData = {
      lastAnalyzedUrl: null,
      normalizedHeaders: null,
      analysisReport: null,
      chatHistory: [],
      timestamp: Date.now(),
    };
    this.state.blockConcurrencyWhile(async () => {
      const storedData = await this.state.storage.get<SessionData>('sessionData');
      if (storedData) {
        this.sessionData = storedData;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/analyze':
        if (request.method !== 'POST') {
          return new Response('Method Not Allowed', { status: 405 });
        }
        const { targetUrl } = await request.json();
        if (!targetUrl) {
          return new Response('Missing targetUrl in request body', { status: 400 });
        }

        try {
          const normalizedHeaders = await fetchAndExtractHeaders(targetUrl);
          const analysisPrompt = `Analyze the following HTTP response headers for security vulnerabilities and best practices. Provide a comprehensive report with prioritized findings, explanations of each issue, and specific, actionable recommendations for improvement, explicitly mentioning Cloudflare solutions where relevant.\n\n${JSON.stringify(normalizedHeaders, null, 2)}`;

          const analysisReport = await getAiResponse(this.env, analysisPrompt, []);

          this.sessionData = {
            lastAnalyzedUrl: targetUrl,
            normalizedHeaders: normalizedHeaders,
            analysisReport,
            chatHistory: [{ role: 'user', content: `Analyze: ${targetUrl}` }, { role: 'assistant', content: analysisReport }],
            timestamp: Date.now(),
          };
          await this.state.storage.put('sessionData', this.sessionData);

          return new Response(analysisReport, { status: 200, headers: { 'Content-Type': 'text/plain' } });
        } catch (error: any) {
          return new Response(`Error analyzing URL: ${error.message}`, { status: 500 });
        }

      case '/chat':
        if (request.method !== 'POST') {
          return new Response('Method Not Allowed', { status: 405 });
        }
        const { question } = await request.json();
        if (!question) {
          return new Response('Missing question in request body', { status: 400 });
        }

        if (!this.sessionData.analysisReport) {
          return new Response('No analysis performed yet. Please analyze a URL first.', { status: 400 });
        }

        const systemPrompt = `Given the previous security analysis report:\n\n${this.sessionData.analysisReport}\n\nAnd the current chat history:\n\n${JSON.stringify(this.sessionData.chatHistory, null, 2)}\n\nAnswer the following question in the context of the analyzed website and general web security principles. If the question relates to a specific header, explain its purpose and security implications. If the user asks for a summary, provide a concise overview of the most critical security findings and Cloudflare-specific recommendations.`;

        const chatResponse = await getAiResponse(this.env, question, [...this.sessionData.chatHistory, { role: 'system', content: systemPrompt }]);

        this.sessionData.chatHistory.push(
          { role: 'user', content: question },
          { role: 'assistant', content: chatResponse }
        );
        await this.state.storage.put('sessionData', this.sessionData);

        return new Response(chatResponse, { status: 200, headers: { 'Content-Type': 'text/plain' } });

      case '/getSessionData': // Added for debugging/initial state retrieval if needed
        return new Response(JSON.stringify(this.sessionData), {
          headers: { 'Content-Type': 'application/json' },
        });
      
      case '/':
        return new Response('Cloudflare AI Website Security Analyzer Worker. Use /analyze or /chat endpoints.', { status: 200 });

      default:
        return new Response('Not found', { status: 404 });
    }
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    const sessionId = request.headers.get('X-Session-ID');
    if (!sessionId) {
      let errorResponse = new Response('X-Session-ID header is required', { status: 400 });
      return addCORSHeaders(request, errorResponse);
    }

    const id = env.SESSION_STATE.idFromName(sessionId);
    const stub = env.SESSION_STATE.get(id);

    // Construct a new URL to forward to the Durable Object, retaining only the path
    const doRequestUrl = new URL(request.url);
    doRequestUrl.host = 'do';
    doRequestUrl.protocol = 'https';
    doRequestUrl.pathname = url.pathname;

    try {
      // Forward the request to the Durable Object
      let response = await stub.fetch(doRequestUrl.toString(), { method: request.method, headers: request.headers, body: request.body });
      // Clone the response to make headers mutable
      response = new Response(response.body, response);
      // Add CORS headers to the response
      return addCORSHeaders(request, response);
    } catch (error: any) {
      console.error('Worker fetch error:', error);
      let errorResponse = new Response(`Worker internal error: ${error.message}`, { status: 500 });
      return addCORSHeaders(request, errorResponse);
    }
  },
};

// Helper to normalize header names
function normalizeHeaderName(name: string): string {
  return name.toLowerCase().replace(/-/g, '_');
}

// Security-related headers to extract and normalize
const SECURITY_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'cache-control',
  'set-cookie', // Special handling for cookie flags
  // Add more commonly found headers for basic analysis
  'server',
  'x-powered-by',
  'content-type',
  'etag',
  'last-modified',
  'expires',
  'pragma',
  'via',
  'x-xss-protection',
  'x-permitted-cross-domain-policies',
  'expect-ct',
  'feature-policy',
  'permissions-policy',
];

async function fetchAndExtractHeaders(targetUrl: string): Promise<Record<string, string[]>> {
  try {
    console.log(`[fetchAndExtractHeaders] Attempting to fetch headers for: ${targetUrl}`);
    // Prepend https:// if no protocol is present
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
      console.log(`[fetchAndExtractHeaders] Normalized target URL to: ${targetUrl}`);
    }

    const response = await fetch(targetUrl, { method: 'HEAD' }); // Use HEAD for efficiency
    console.log(`[fetchAndExtractHeaders] Received response status: ${response.status} from ${targetUrl}`);
    
    const headers: Record<string, string[]> = {};
    console.log('[fetchAndExtractHeaders] Raw response headers:');
    for (const [key, value] of response.headers.entries()) {
      console.log(`  ${key}: ${value}`);
      const normalizedKey = normalizeHeaderName(key);
      const isSecurityHeader = SECURITY_HEADERS.includes(key.toLowerCase());
      console.log(`[fetchAndExtractHeaders]   Checking header '${key.toLowerCase()}'. Is in SECURITY_HEADERS: ${isSecurityHeader}. Normalized key: ${normalizedKey}`);
      if (isSecurityHeader) {
        if (normalizedKey === 'set_cookie') {
          // Special handling for set-cookie to extract flags
          const cookieFlags: string[] = [];
          value.split(';').forEach((part: string) => {
            const trimmedPart = part.trim().toLowerCase();
            if (trimmedPart === 'httponly' || trimmedPart === 'secure' || trimmedPart.startsWith('samesite')) {
              cookieFlags.push(trimmedPart);
            }
          });
          headers[normalizedKey] = (headers[normalizedKey] || []).concat(cookieFlags);
          console.log(`[fetchAndExtractHeaders]     Added cookie flags to ${normalizedKey}:`, headers[normalizedKey]);
        } else {
          headers[normalizedKey] = (headers[normalizedKey] || []).concat(value);
          console.log(`[fetchAndExtractHeaders]     Added value to ${normalizedKey}: '${value}'`, headers[normalizedKey]);
        }
      }
    }
    console.log('[fetchAndExtractHeaders] Normalized headers before returning:', JSON.stringify(headers, null, 2));
    return headers;
  } catch (error: any) {
    console.error(`[fetchAndExtractHeaders] Error fetching headers for ${targetUrl}: `, error);
    throw new Error(`Failed to fetch headers: ${error.message}`);
  }
}

async function getAiResponse(
  env: Env,
  prompt: string,
  chatHistory: { role: string; content: string }[]
): Promise<string> {
  const ai = env.AI;
  const messages = [{ role: 'system', content: `You are an expert website security analyst with extensive knowledge of HTTP headers, web vulnerabilities, and Cloudflare security products. Your goal is to analyze website security configurations based on provided HTTP headers and offer clear, concise, and actionable advice, prioritizing critical findings and suggesting Cloudflare-specific improvements where applicable. Maintain a professional yet helpful tone. When asked for summaries, provide a high-level overview of the most critical findings and recommendations.` }];
  
  // Add previous chat history
  messages.push(...chatHistory);

  messages.push({ role: 'user', content: prompt });

  const response = await ai.run(
    env.LLAMA_MODEL_ID,
    {
      messages,
      stream: false,
    }
  );
  return (response as { response: string }).response;
}

function handleOptions(request: Request) {
  const headers = request.headers;
  if (
    headers.get('Origin') !== null &&
    headers.get('Access-Control-Request-Method') !== null &&
    headers.get('Access-Control-Request-Headers') !== null
  ) {
    // Handle CORS preflight request.
    let respHeaders = {
      'Access-Control-Allow-Origin': headers.get('Origin')!,
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': headers.get('Access-Control-Request-Headers')! + ', X-Session-ID',
      'Access-Control-Max-Age': '86400',
    };
    return new Response(null, { headers: respHeaders });
  } else {
    // Handle standard OPTIONS request.
    return new Response(null, { status: 204 });
  }
}

function addCORSHeaders(request: Request, response: Response): Response {
  const origin = request.headers.get('Origin') || '*';
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID');
  return response;
}


