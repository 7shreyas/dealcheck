// Delivery email via Resend. With no RESEND_API_KEY it logs instead (mock mode).

import { Resend } from "resend";
import { appUrl } from "./config";
import { DISCLAIMER_TEXT } from "./copy";
import { isOffline } from "./http";

export function hasResend(): boolean {
  return !isOffline() && Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendReportEmail(args: {
  to: string;
  orderId: string;
  car: string;
  pdf: Uint8Array;
}): Promise<"sent" | "mocked" | "failed"> {
  const link = `${appUrl()}/report/${args.orderId}`;
  if (!hasResend()) {
    console.info(`[email:mock] Deal Kit for ${args.car} → ${args.to} (${link}, PDF ${args.pdf.byteLength} bytes)`);
    return "mocked";
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: args.to,
      subject: `Your Deal Kit: ${args.car}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#0F172A">
<p>Your Deal Kit for the <strong>${escapeHtml(args.car)}</strong> is ready. The PDF is attached.</p>
<p><a href="${link}" style="color:#1D4ED8;font-weight:bold">Open your Deal Kit and reply coach</a></p>
<p>The reply coach is available for 7 days. Paste in the seller's latest message and it writes your next reply.</p>
<p style="color:#475569;font-size:13px">${DISCLAIMER_TEXT}</p></div>`,
      attachments: [{ filename: "dealcheck-deal-kit.pdf", content: Buffer.from(args.pdf) }],
    });
    if (error) throw new Error(error.message);
    return "sent";
  } catch (err) {
    console.error("[email] send failed", err);
    return "failed";
  }
}
