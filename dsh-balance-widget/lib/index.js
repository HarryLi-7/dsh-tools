// dsh-balance-widget — host half: serves GET /dsh-balance-widget/balance
// with the DeepSeek account balance, cached for at most REFRESH_MS.
import { credentialRef } from "@deepseek-ai/dsh-credentials";

const name = "balance-widget";
const inject = ["credentials", "webServer"];

const BALANCE_URL = "https://api.deepseek.com/user/balance";
const REFRESH_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

let lastGood = null;
let lastFetchedAt = 0;
let consecutiveFailures = 0;

async function fetchBalance(key) {
  const res = await fetch(BALANCE_URL, {
    headers: { Authorization: "Bearer " + key },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error("balance API HTTP " + res.status);
  const data = await res.json();
  const info = data && Array.isArray(data.balance_infos) ? data.balance_infos[0] : undefined;
  if (!info || info.total_balance === undefined) throw new Error("balance API malformed response");
  return {
    balance: Number(info.total_balance),
    toppedUp: Number(info.topped_up_balance),
    granted: Number(info.granted_balance),
    currency: typeof info.currency === "string" && info.currency ? info.currency : "CNY",
    isAvailable: data.is_available !== false
  };
}

function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/dsh-balance-widget/balance",
    handler: async (req, res) => {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      try {
        const now = Date.now();
        if (lastGood === null || now - lastFetchedAt >= REFRESH_MS) {
          const cred = await ctx.credentials.resolve(credentialRef("DEEPSEEK_API_KEY"));
          if (!cred) throw new Error("DEEPSEEK_API_KEY not configured");
          const good = await fetchBalance(cred.value);
          lastGood = good;
          lastFetchedAt = now;
          consecutiveFailures = 0;
        }
        res.end(JSON.stringify({ ok: true, ...lastGood }));
      } catch (error) {
        consecutiveFailures += 1;
        res.end(JSON.stringify({
          ok: false,
          consecutiveFailures,
          lastGood,
          error: error && error.message ? error.message : String(error)
        }));
      }
    }
  }), "balance-widget: /dsh-balance-widget/balance route");
}

export { apply, inject, name };
