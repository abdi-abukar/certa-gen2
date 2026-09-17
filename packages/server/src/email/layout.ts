import { EMAIL_BRAND as certa } from "./schema";
import { safeEmailUrl } from "./schema";

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

/** Production logo. Same asset as the site; PNG is already transparent. */
export const CERTA_EMAIL_LOGO = `https://${certa.domain}/logo.png`;

export const CERTA_EMAIL_WIDTH = 640;

const HEADING =
  "'Space Grotesk', Arial, Helvetica, sans-serif";
const BODY = "Manrope, Arial, Helvetica, sans-serif";

const INK = "#101712";
const MUTED = "#5a635c";
const GOLD = "#d8b86d";
const NAVY = "#06130d";
const HAIR = "#d4cfc0";
const HAIR_DARK = "#3d4a42";
const IVORY = "#f6f3e9";

export function certaEmailCss() {
  return `
:root { color-scheme: light dark; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  background-color: transparent !important;
  background: transparent !important;
}
body {
  color: ${INK};
  font-family: ${BODY};
  -webkit-text-size-adjust: 100%;
}
img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
a { color: ${INK}; }
.certa-ink { color: ${INK} !important; }
.certa-muted { color: ${MUTED} !important; }
.certa-gold { color: ${GOLD} !important; }
.certa-link { color: ${INK} !important; text-decoration: underline; }
.certa-rule { border-top: 1px solid ${HAIR} !important; }
.certa-card { border: 1px solid ${HAIR} !important; }
.certa-line { border-bottom: 1px solid ${HAIR} !important; }
.certa-pin {
  font-family: ${HEADING} !important;
  font-size: 32px !important;
  font-weight: 600 !important;
  letter-spacing: 0.02em !important;
  color: ${INK} !important;
}
@media (prefers-color-scheme: dark) {
  body, .certa-ink, .certa-link { color: ${IVORY} !important; }
  .certa-muted { color: #b8b3a6 !important; }
  .certa-rule, .certa-card { border-color: ${HAIR_DARK} !important; }
  .certa-line { border-bottom-color: ${HAIR_DARK} !important; }
  .certa-pin { color: ${IVORY} !important; }
  .certa-cta, .certa-cta a { background-color: ${GOLD} !important; color: ${NAVY} !important; }
  .certa-hero, .certa-hero td { background-color: ${NAVY} !important; }
  .certa-hero-ink { color: ${IVORY} !important; }
  .certa-hero-gold { color: ${GOLD} !important; }
}
[data-ogsc] .certa-ink, [data-ogsc] .certa-link { color: ${IVORY} !important; }
[data-ogsc] .certa-muted { color: #b8b3a6 !important; }
[data-ogsc] .certa-rule, [data-ogsc] .certa-card { border-color: ${HAIR_DARK} !important; }
[data-ogsc] .certa-line { border-bottom-color: ${HAIR_DARK} !important; }
[data-ogsc] .certa-pin { color: ${IVORY} !important; }
[data-ogsc] .certa-hero, [data-ogsc] .certa-hero td { background-color: ${NAVY} !important; }
[data-ogsc] .certa-hero-ink { color: ${IVORY} !important; }
[data-ogsc] .certa-hero-gold { color: ${GOLD} !important; }
`.trim();
}

export function certaEmailButton(label: string, url: string) {
  safeEmailUrl(url);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td class="certa-cta" bgcolor="${GOLD}" style="border-radius:8px;background-color:${GOLD}"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 22px;font-family:${HEADING};font-size:14px;font-weight:600;line-height:1;color:${NAVY};text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;
}

export function certaEmailHeader() {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:8px 0 28px">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="vertical-align:middle"><a href="https://${escapeHtml(certa.domain)}" style="text-decoration:none"><img src="${CERTA_EMAIL_LOGO}" width="44" height="44" alt="${escapeHtml(certa.name)}" style="display:block;width:44px;height:44px;border:0"></a></td>
<td class="certa-ink" style="vertical-align:middle;padding-left:12px;font-family:${HEADING};font-size:16px;font-weight:600;letter-spacing:-0.02em;color:${INK};white-space:nowrap">${escapeHtml(certa.name)}</td>
</tr></table>
</td></tr></table>`;
}

export function certaEmailFooter(input?: {
  unsubscribeUrl?: string;
  extra?: string;
}) {
  const year = new Date().getFullYear();
  if (input?.unsubscribeUrl) safeEmailUrl(input.unsubscribeUrl);
  const domain = escapeHtml(certa.domain);
  const link = `font-family:${BODY};font-size:12px;line-height:1.6;color:${INK};text-decoration:underline`;
  const unsubscribe = input?.unsubscribeUrl
    ? `<p class="certa-muted" style="margin:16px 0 0;font-family:${BODY};font-size:12px;line-height:1.6;color:${MUTED}"><a href="${escapeHtml(input.unsubscribeUrl)}" class="certa-link" style="${link}">Unsubscribe</a></p>`
    : "";
  const extra = input?.extra
    ? `<p class="certa-muted" style="margin:0 0 20px;font-family:${BODY};font-size:13px;line-height:1.65;color:${MUTED}">${escapeHtml(input.extra)}</p>`
    : "";

  return `${extra}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="certa-rule" style="border-top:1px solid ${HAIR}"><tr><td style="padding:28px 0 0">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="vertical-align:middle"><a href="https://${domain}" style="text-decoration:none"><img src="${CERTA_EMAIL_LOGO}" width="36" height="36" alt="${escapeHtml(certa.name)}" style="display:block;width:36px;height:36px;border:0"></a></td>
<td class="certa-ink" style="vertical-align:middle;padding-left:10px;font-family:${HEADING};font-size:15px;font-weight:600;letter-spacing:-0.02em;color:${INK};white-space:nowrap">${escapeHtml(certa.name)}</td>
</tr></table>
<p class="certa-muted" style="margin:14px 0 18px;font-family:${BODY};font-size:13px;line-height:1.55;color:${MUTED}">The world's simplest futures prop firm.</p>
<p class="certa-muted" style="margin:0;font-family:${BODY};font-size:11px;line-height:1.65;color:${MUTED}">Certa Futures provides paid access to simulated futures evaluations. Account balances, orders, executions, profits, and losses are simulated. Rewards are subject to program rules, eligibility requirements, identity verification, and compliance review.</p>
<p class="certa-muted" style="margin:14px 0 0;font-family:${BODY};font-size:11px;line-height:1.6;color:${MUTED}">© ${year} ${escapeHtml(certa.name)}. All rights reserved.</p>
${unsubscribe}
</td></tr></table>`;
}

export function wrapCertaEmail(input: {
  title: string;
  preheader?: string;
  inner: string;
}) {
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;opacity:0">${escapeHtml(input.preheader)}</div>`
    : "";

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.title)}</title>
<style>${certaEmailCss()}</style>
<!--[if mso]>
<style>table, td, a, p, h1, h2 { font-family: Arial, Helvetica, sans-serif !important; }</style>
<![endif]-->
</head>
<body class="certa-ink" style="margin:0;padding:0;background-color:transparent;background:transparent;color:${INK};font-family:${BODY}">
${preheader}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:transparent;background:transparent"><tr><td align="center" style="padding:32px 16px">
<!--[if mso]><table role="presentation" width="${CERTA_EMAIL_WIDTH}" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:${CERTA_EMAIL_WIDTH}px;background-color:transparent;background:transparent">
<tr><td style="padding:0 8px">${input.inner}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}
