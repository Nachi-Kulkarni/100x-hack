// people-gpt-champion/__mocks__/next-auth.ts

const mockNextAuth = jest.fn((options: any) => {
  // This is the actual handler that NextAuth executes for requests to /api/auth/*
  // For testing other API routes that just *import* [...nextauth].ts,
  // this handler logic might not even be called.
  return jest.fn((req, res) => {
    // console.log('Mock NextAuth handler called with options:', options);
    res.status(200).json({ message: 'Mocked NextAuth API handler response' });
  });
});

// If your application code also imports named exports from "next-auth" directly,
// they would need to be mocked here as well. For example:
// export const someNamedExport = jest.fn();

export default mockNextAuth;
