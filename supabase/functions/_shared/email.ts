// supabase/functions/_shared/email.ts
// Optional email sender via Resend. If RESEND_API_KEY is not set, functions will just return the link.
export async function sendEmailResend(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM");
  if (!apiKey || !from) return { sent: false, reason: "RESEND not configured" };

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  const text = await r.text();
  if (!r.ok) return { sent: false, reason: text || "Resend error" };
  return { sent: true, result: text ? JSON.parse(text) : null };
}
