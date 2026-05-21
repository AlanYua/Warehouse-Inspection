import "@fastify/session";

declare module "@fastify/session" {
  interface Session {
    user?: {
      id: string;
      username: string;
      name: string | null;
      role: string;
    };
  }
}

