import test from "node:test";
import assert from "node:assert/strict";
import { verifyGrowwAccount } from "./groww-auth.js";

test("Groww verification rejects an empty access token before making a network request", async () => {
  await assert.rejects(() => verifyGrowwAccount(""), /GROWW_TOKEN_MISSING/);
});
