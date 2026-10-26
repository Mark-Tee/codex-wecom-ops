import assert from "node:assert/strict";
import test from "node:test";
import { AccessControl } from "../src/access-control.mjs";

test("requires a pairing code when no allowlist is configured", () => {
  let now = 1000;
  const state = {};
  const access = new AccessControl({
    state,
    allowedUserIds: [],
    requirePairing: true,
    clock: () => now,
    codeFactory: () => "123456",
  });
  assert.equal(access.ensurePairingCode(), "123456");
  assert.equal(access.isAuthorized("user-1"), false);
  assert.equal(access.pair("user-1", "000000"), false);
  assert.equal(access.pair("user-1", "123456"), true);
  assert.equal(access.isAuthorized("user-1"), true);
  assert.equal(state.pairing, undefined);
});

test("expires pairing codes", () => {
  let now = 1000;
  const access = new AccessControl({
    state: {},
    requirePairing: true,
    clock: () => now,
    codeFactory: () => "654321",
  });
  access.createInvite();
  now += 11 * 60 * 1000;
  assert.equal(access.pair("user-1", "654321"), false);
});

test("allowlisted users bypass pairing", () => {
  const state = {};
  const access = new AccessControl({
    state,
    allowedUserIds: ["trusted"],
    requirePairing: true,
  });
  assert.equal(access.ensurePairingCode(), "");
  assert.equal(access.isAuthorized("trusted"), true);
  assert.equal(access.isAuthorized("other"), false);
});
