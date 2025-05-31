// people-gpt-champion/__mocks__/next/server.ts

// Mock NextResponse
export class NextResponse extends Response {
  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super(body, init);
  }

  // Static method NextResponse.json()
  static json = jest.fn((body: any, init?: ResponseInit) => {
    const headers = new Headers(init?.headers);
    headers.set('Content-Type', 'application/json');
    // Simulate the behavior of NextResponse.json which creates a Response object
    // In a real scenario, it constructs a Response object with the JSON body and appropriate headers.
    // For the mock, we can return a simple object that can be asserted upon,
    // or a more complete Response mock if needed.
    return new Response(JSON.stringify(body), { ...init, headers });
  });

  // Add other NextResponse methods if your app uses them, e.g., redirect, next, etc.
  static redirect = jest.fn((url: string | URL, init?: number | ResponseInit) => {
    const status = typeof init === 'number' ? init : init?.status ?? 307;
    return new Response(null, { status, headers: { Location: String(url) } });
  });
}

// Mock NextRequest if needed by your tests
export class NextRequest extends Request {
  public nextUrl: URL;
  public cookies: any; // Simple mock for cookies

  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init);
    if (typeof input === 'string') {
      this.nextUrl = new URL(input);
    } else if (input instanceof URL) {
      this.nextUrl = input;
    } else { // Request object
      this.nextUrl = new URL(input.url);
    }

    // Basic mock for cookies, can be expanded
    const cookieHeader = this.headers.get('cookie');
    const allCookies: Record<string, { name: string, value: string }> = {};
    if (cookieHeader) {
      cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        const name = parts.shift()?.trim();
        const value = parts.join('=');
        if (name) {
          allCookies[name] = { name, value };
        }
      });
    }
    this.cookies = {
      get: jest.fn((name: string) => allCookies[name]),
      getAll: jest.fn(() => Object.values(allCookies)),
      has: jest.fn((name: string) => !!allCookies[name]),
      // Add other cookie methods if needed by your app (set, delete, etc.)
    };
  }
  // Example: mock cookies if you use them
  // cookies = { get: jest.fn((name: string) => ({ name, value: `mock-cookie-${name}`})) };
}

// You might also need to mock other exports from 'next/server' if you use them.
