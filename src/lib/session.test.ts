import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("session secret fallback", () => {
  const originalSecret = process.env.SESSION_SECRET;

  afterEach(() => {
    vi.resetModules();
    if (originalSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSecret;
    }
  });

  it("allows encrypting and decrypting when SESSION_SECRET is not configured", async () => {
    delete process.env.SESSION_SECRET;

    const { encrypt, decrypt } = await import("./session");
    const token = await encrypt({ userId: "user-1" });

    expect(token).toBeTypeOf("string");
    expect(await decrypt(token)).toMatchObject({ userId: "user-1" });
  });
});
