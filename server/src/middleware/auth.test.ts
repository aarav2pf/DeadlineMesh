import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import type { Response, NextFunction } from "express";
import { requireAuth, type AuthRequest } from "./auth";

const TEST_SECRET = "deadline-mesh-auth-test-secret";

function makeResponse() {
  const result: { statusCode?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  } as unknown as Response;

  return { response, result };
}

function makeRequest(authorization?: string): AuthRequest {
  return {
    headers: authorization ? { authorization } : {},
  } as AuthRequest;
}

function makeToken(payload: Record<string, unknown> = { sub: "42", email: "user@example.com" }) {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: "1h" });
}

beforeEach(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

test("rejects requests without a bearer token", () => {
  const req = makeRequest();
  const { response, result } = makeResponse();
  let nextCalled = false;

  requireAuth(req, response, (() => { nextCalled = true; }) as NextFunction);

  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { message: "Authentication required." });
  assert.equal(nextCalled, false);
});

test("rejects malformed and invalid tokens", () => {
  for (const authorization of ["Basic abc", "Bearer not-a-jwt", `Bearer ${jwt.sign({ sub: "42", email: "user@example.com" }, "wrong-secret")}`]) {
    const req = makeRequest(authorization);
    const { response, result } = makeResponse();
    let nextCalled = false;

    requireAuth(req, response, (() => { nextCalled = true; }) as NextFunction);

    assert.equal(result.statusCode, 401);
    assert.equal(nextCalled, false);
  }
});

test("rejects expired tokens", () => {
  const token = jwt.sign({ sub: "42", email: "user@example.com" }, TEST_SECRET, { expiresIn: -1 });
  const { response, result } = makeResponse();

  requireAuth(makeRequest(`Bearer ${token}`), response, (() => {}) as NextFunction);

  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { message: "Invalid or expired authentication token." });
});

test("rejects tokens with missing or malformed required claims", () => {
  const invalidPayloads = [
    { email: "user@example.com" },
    { sub: "not-a-number", email: "user@example.com" },
    { sub: "42", email: 123 },
  ];

  for (const payload of invalidPayloads) {
    const token = makeToken(payload);
    const { response, result } = makeResponse();
    let nextCalled = false;

    requireAuth(makeRequest(`Bearer ${token}`), response, (() => { nextCalled = true; }) as NextFunction);

    assert.equal(result.statusCode, 401);
    assert.deepEqual(result.body, { message: "Invalid authentication token." });
    assert.equal(nextCalled, false);
  }
});

test("accepts a valid token and attaches the authenticated user", () => {
  const token = makeToken();
  const req = makeRequest(`Bearer ${token}`);
  const { response, result } = makeResponse();
  let nextCalled = false;

  requireAuth(req, response, (() => { nextCalled = true; }) as NextFunction);

  assert.equal(nextCalled, true);
  assert.equal(result.statusCode, undefined);
  assert.equal(req.userId, 42);
  assert.equal(req.userEmail, "user@example.com");
});

test("fails closed when JWT_SECRET is missing", () => {
  delete process.env.JWT_SECRET;
  const { response, result } = makeResponse();
  let nextCalled = false;

  requireAuth(makeRequest(`Bearer ${makeToken()}`), response, (() => { nextCalled = true; }) as NextFunction);

  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.body, { message: "Authentication is not configured." });
  assert.equal(nextCalled, false);
});
