import { describe, expect, it } from "vitest";
import { parseGalxeCredentialRequest } from "./credentials";

describe("parseGalxeCredentialRequest", () => {
  it("parses credId and address from query params", () => {
    const params = new URLSearchParams({
      cred_id: "curator-genesis",
      address: "0xabcdef0123456789abcdef0123456789abcdef01",
    });
    expect(parseGalxeCredentialRequest(params)).toEqual({
      credId: "curator-genesis",
      address: "0xabcdef0123456789abcdef0123456789abcdef01",
    });
  });

  it("rejects invalid addresses", () => {
    const params = new URLSearchParams({
      credId: "curator-genesis",
      address: "not-an-address",
    });
    expect(parseGalxeCredentialRequest(params)).toBeNull();
  });
});
