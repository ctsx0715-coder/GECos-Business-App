import "dotenv/config";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Integration tests need a real Postgres — they " +
      "exist to prove tenant isolation, which a mock cannot demonstrate.",
  );
}
