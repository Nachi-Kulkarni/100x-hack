// people-gpt-champion/__mocks__/@next-auth/prisma-adapter.ts
export const PrismaAdapter = jest.fn().mockImplementation(() => {
  return {
    // Mock out all functions that your application actually uses from the adapter
    // This is a placeholder. Add specific function mocks as needed by test errors.
    createUser: jest.fn().mockResolvedValue({ id: 'mockUserId', email: 'test@example.com' }),
    getUser: jest.fn().mockResolvedValue(null),
    getUserByEmail: jest.fn().mockResolvedValue(null),
    getUserByAccount: jest.fn().mockResolvedValue(null),
    updateUser: jest.fn().mockResolvedValue({}),
    deleteUser: jest.fn().mockResolvedValue({}),
    linkAccount: jest.fn().mockResolvedValue({}),
    unlinkAccount: jest.fn().mockResolvedValue(undefined),
    createSession: jest.fn().mockResolvedValue({ sessionToken: 'mock-session-token', userId: 'mockUserId', expires: new Date() }),
    getSessionAndUser: jest.fn().mockResolvedValue([null, null]),
    updateSession: jest.fn().mockResolvedValue({}),
    deleteSession: jest.fn().mockResolvedValue({}),
    createVerificationToken: jest.fn().mockResolvedValue(null),
    useVerificationToken: jest.fn().mockResolvedValue(null),
  };
});

// If the actual adapter is a default export, you might need this instead:
// export default PrismaAdapter;
// However, based on the import `import { PrismaAdapter } from "@next-auth/prisma-adapter"`,
// it's a named export.
