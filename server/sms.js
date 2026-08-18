// Provider-agnostic SMS sender.
//
// One public function, sendSms(to, message). The default implementation talks to
// Notify.lk (Sri Lankan gateway, ~Rs.1/SMS, LKR top-up). When the Notify.lk env
// vars are unset we fall back to console.log so local development works without a
// paid account or real texts going out.
//
// Env: NOTIFY_LK_USER_ID, NOTIFY_LK_API_KEY, NOTIFY_LK_SENDER_ID
//
// Swap the gateway by replacing the body of sendViaNotifyLk() — the rest of the
// app only ever calls sendSms().

const USER_ID = process.env.NOTIFY_LK_USER_ID;
const API_KEY = process.env.NOTIFY_LK_API_KEY;
const SENDER  = process.env.NOTIFY_LK_SENDER_ID;

// True only when every credential is present — otherwise we use the dev fallback.
const smsConfigured = !!(USER_ID && API_KEY && SENDER);

async function sendViaNotifyLk(to, message) {
  const params = new URLSearchParams({
    user_id: USER_ID,
    api_key: API_KEY,
    sender_id: SENDER,
    to,          // digits only, e.g. 94771234567
    message,
  });

  // 10s timeout so a hung gateway never blocks the request.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch("https://app.notify.lk/api/v1/send?" + params.toString(), {
      method: "POST",
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data && data.status === "error")) {
      throw new Error((data && data.message) || `SMS gateway error (${res.status})`);
    }
    return { ok: true, dev: false, data };
  } finally {
    clearTimeout(timer);
  }
}

// Returns { ok: true, dev } on success; throws on failure so callers can react
// (e.g. delete the unused OTP row and let the user retry).
async function sendSms(to, message) {
  if (!smsConfigured) {
    // Dev fallback — never throws, so the OTP flow is fully testable offline.
    console.log(`[sms:dev] → ${to}: ${message}`);
    return { ok: true, dev: true };
  }
  return sendViaNotifyLk(to, message);
}

module.exports = { sendSms, smsConfigured };
