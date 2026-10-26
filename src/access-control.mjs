import { randomInt } from "node:crypto";

const PAIRING_TTL_MS = 10 * 60 * 1000;

export class AccessControl {
  constructor({
    state,
    allowedUserIds = [],
    requirePairing = true,
    clock = () => Date.now(),
    codeFactory = () => String(randomInt(100000, 1000000)),
    onStateChange = () => {},
  }) {
    this.state = state;
    this.allowedUserIds = new Set(allowedUserIds);
    this.requirePairing = requirePairing;
    this.clock = clock;
    this.codeFactory = codeFactory;
    this.onStateChange = onStateChange;
    if (!Array.isArray(this.state.operators)) this.state.operators = [];
  }

  isAuthorized(userId) {
    if (!userId) return false;
    if (this.allowedUserIds.has(userId)) return true;
    return this.state.operators.includes(userId);
  }

  ensurePairingCode() {
    if (this.allowedUserIds.size || this.state.operators.length || !this.requirePairing) {
      return "";
    }
    const existing = this.state.pairing;
    if (existing?.code && existing.expiresAt > this.clock()) return existing.code;
    return this.createInvite();
  }

  createInvite() {
    if (!this.requirePairing) throw new Error("Pairing is disabled");
    const code = this.codeFactory();
    this.state.pairing = {
      code,
      expiresAt: this.clock() + PAIRING_TTL_MS,
    };
    this.onStateChange();
    return code;
  }

  pair(userId, code) {
    const pending = this.state.pairing;
    if (!userId || !pending?.code || pending.expiresAt <= this.clock() || pending.code !== code) {
      return false;
    }
    this.state.operators = [...new Set([...this.state.operators, userId])];
    delete this.state.pairing;
    this.onStateChange();
    return true;
  }

  revoke(userId) {
    const before = this.state.operators.length;
    this.state.operators = this.state.operators.filter((item) => item !== userId);
    const removed = this.state.operators.length !== before;
    if (removed) this.onStateChange();
    return removed;
  }

  listOperators() {
    return [...new Set([...this.allowedUserIds, ...this.state.operators])];
  }
}
