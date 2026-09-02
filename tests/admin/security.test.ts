import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { getAdminCacheFailures } from "../../src/lib/admin-cache-policy";
import { proxy } from "../../src/proxy";
import {
  AdminConfigurationError,
  parseAppOrigin,
  readAdminConfig,
} from "../../src/server/admin/config";
import {
  getAdminClientAddress,
  hashAdminClientAddress,
  isTrustedAdminRequest,
} from "../../src/server/admin/origin";
import {
  createAdminPasswordVerifier,
  parseAdminPasswordVerifier,
  verifyAdminPassword,
} from "../../src/server/admin/password";
import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "../../src/server/admin/session-token";

const sessionSecret = "session-secret-with-at-least-thirty-two-bytes";
const rateLimitSecret = "rate-limit-secret-with-at-least-thirty-two-bytes";

test("scrypt verifier accepts the password and rejects another password", async () => {
  const verifier = await createAdminPasswordVerifier("correct horse battery staple");
  assert.match(verifier, /^scrypt\$v=1\$N=131072\$r=8,p=1\$/);
  assert.equal(await verifyAdminPassword("correct horse battery staple", verifier), true);
  assert.equal(await verifyAdminPassword("incorrect horse battery staple", verifier), false);
  assert.throws(() => parseAdminPasswordVerifier(verifier.replace("N=131072", "N=1024")));
});

test("Admin config is lazy, strict, and fail-closed", async () => {
  assert.equal(readAdminConfig({ ADMIN_UI_ENABLED: "false" }), null);
  assert.throws(
    () => readAdminConfig({ ADMIN_UI_ENABLED: "yes" }),
    AdminConfigurationError,
  );
  assert.throws(
    () => readAdminConfig({ ADMIN_UI_ENABLED: "true" }),
    AdminConfigurationError,
  );
  assert.throws(
    () => parseAppOrigin("https://example.com/path", "production"),
    AdminConfigurationError,
  );
  assert.throws(
    () => parseAppOrigin("http://example.com", "production"),
    AdminConfigurationError,
  );

  const passwordVerifier = await createAdminPasswordVerifier(
    "another correct horse battery staple",
  );
  const config = readAdminConfig({
    ADMIN_UI_ENABLED: "true",
    ADMIN_WRITE_ENABLED: "false",
    ADMIN_PASSWORD_HASH: passwordVerifier,
    ADMIN_SESSION_SECRET: sessionSecret,
    ADMIN_RATE_LIMIT_SECRET: rateLimitSecret,
    APP_ORIGIN: "https://admin.example.com",
    NODE_ENV: "production",
  });
  assert.equal(config?.appOrigin.origin, "https://admin.example.com");
  assert.equal(config?.writeEnabled, false);
});

test("signed Admin sessions reject tampering and expiry", () => {
  const now = new Date("2026-09-02T12:00:00.000Z");
  const { token } = createAdminSessionToken(sessionSecret, now);
  assert.equal(verifyAdminSessionToken(token, sessionSecret, now)?.sub, "admin");

  const [encodedPayload, encodedSignature] = token.split(".");
  assert.ok(encodedPayload);
  assert.ok(encodedSignature);
  const tamperedSignature = Buffer.from(encodedSignature, "base64url");
  assert.ok(tamperedSignature.length > 0);
  tamperedSignature[0] ^= 0x01;

  assert.equal(
    verifyAdminSessionToken(
      `${encodedPayload}.${tamperedSignature.toString("base64url")}`,
      sessionSecret,
      now,
    ),
    null,
  );
  assert.equal(
    verifyAdminSessionToken(
      token,
      sessionSecret,
      new Date("2026-09-03T00:00:01.000Z"),
    ),
    null,
  );
});

test("origin and host must exactly match APP_ORIGIN", () => {
  const config = {
    enabled: true as const,
    writeEnabled: false,
    appOrigin: new URL("https://admin.example.com"),
    passwordVerifier: "unused",
    sessionSecret,
    rateLimitSecret,
  };
  const trusted = new Headers({
    origin: "https://admin.example.com",
    host: "admin.example.com",
    "x-forwarded-proto": "https",
    "x-forwarded-for": "203.0.113.10, 10.0.0.1",
  });
  assert.equal(isTrustedAdminRequest(trusted, config), true);
  assert.equal(getAdminClientAddress(trusted), "203.0.113.10");
  assert.notEqual(
    hashAdminClientAddress("203.0.113.10", rateLimitSecret),
    "203.0.113.10",
  );

  const wrongOrigin = new Headers(trusted);
  wrongOrigin.set("origin", "https://preview.example.com");
  assert.equal(isTrustedAdminRequest(wrongOrigin, config), false);
  const wrongHost = new Headers(trusted);
  wrongHost.set("host", "preview.example.com");
  assert.equal(isTrustedAdminRequest(wrongHost, config), false);
});

test("Admin cache policy distinguishes GET/RSC from Server Action POST", () => {
  const privateNoStore = new Headers({
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  });
  assert.deepEqual(getAdminCacheFailures(privateNoStore, "get"), []);
  assert.deepEqual(getAdminCacheFailures(privateNoStore, "rsc"), []);

  const actionNoStore = new Headers({ "Cache-Control": "no-store, max-age=0" });
  assert.deepEqual(getAdminCacheFailures(actionNoStore, "action"), []);
  assert.deepEqual(getAdminCacheFailures(actionNoStore, "get"), [
    "Cache-Control lacks private for an Admin GET/RSC response",
  ]);

  for (const value of [
    "private, no-store, public",
    "private, no-store, s-maxage=0",
    "private, no-store, max-age=60",
    "private, no-store, immutable",
    "private, no-store, stale-while-revalidate=30",
  ]) {
    assert.notDeepEqual(getAdminCacheFailures(new Headers({ "Cache-Control": value }), "action"), []);
  }
  assert.notDeepEqual(
    getAdminCacheFailures(new Headers({ "Cache-Control": "private, max-age=0" }), "action"),
    [],
  );
});

test("Proxy disables Admin without requiring secrets and applies the GET policy", () => {
  const previous = process.env.ADMIN_UI_ENABLED;
  try {
    delete process.env.ADMIN_UI_ENABLED;
    const disabled = proxy(new NextRequest("https://example.com/admin"));
    assert.equal(disabled.status, 404);
    assert.deepEqual(getAdminCacheFailures(disabled.headers, "get"), []);

    process.env.ADMIN_UI_ENABLED = "true";
    const unauthenticated = proxy(
      new NextRequest("https://example.com/admin/sources"),
    );
    assert.equal(unauthenticated.status, 307);
    assert.equal(
      unauthenticated.headers.get("location"),
      "https://example.com/admin/login",
    );
    assert.deepEqual(getAdminCacheFailures(unauthenticated.headers, "get"), []);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_UI_ENABLED;
    else process.env.ADMIN_UI_ENABLED = previous;
  }
});
