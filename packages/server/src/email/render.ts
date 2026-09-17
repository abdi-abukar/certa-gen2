import {
  certaEmailButton,
  certaEmailFooter,
  certaEmailHeader,
  escapeHtml,
  wrapCertaEmail,
} from "./layout";

export { escapeHtml };

const HEADING = "'Space Grotesk', Arial, Helvetica, sans-serif";
const BODY = "Manrope, Arial, Helvetica, sans-serif";
const INK = "#101712";
const MUTED = "#5a635c";

/** Shared Certa transactional shell. Used by every automated email. */
export function renderCertaEmail(input: {
  title: string;
  greeting?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  cta2Label?: string;
  cta2Url?: string;
  footer?: string;
  unsubscribeUrl?: string;
  preheader?: string;
}) {
  const buttons = [
    input.ctaLabel && input.ctaUrl
      ? certaEmailButton(input.ctaLabel, input.ctaUrl)
      : "",
    input.cta2Label && input.cta2Url
      ? certaEmailButton(input.cta2Label, input.cta2Url)
      : "",
  ].filter(Boolean);
  const cta = buttons.length
    ? `<div style="margin:28px 0 8px">${buttons
        .map(
          (button, index) =>
            `<div style="margin-top:${index === 0 ? 0 : 12}px">${button}</div>`,
        )
        .join("")}</div>`
    : "";

  const greeting = input.greeting
    ? `<p class="certa-muted" style="margin:0 0 14px;font-family:${BODY};font-size:15px;line-height:1.65;color:${MUTED}">Hi ${escapeHtml(input.greeting)},</p>`
    : "";

  const inner = `${certaEmailHeader()}
<h1 class="certa-ink" style="margin:0 0 12px;font-family:${HEADING};font-size:28px;line-height:1.2;font-weight:600;letter-spacing:-0.03em;color:${INK}">${escapeHtml(input.title)}</h1>
${greeting}
<div class="certa-ink" style="font-family:${BODY};font-size:15px;line-height:1.7;color:${INK}">${input.bodyHtml}</div>
${cta}
${certaEmailFooter({
  unsubscribeUrl: input.unsubscribeUrl,
  extra: input.footer,
})}`;

  return wrapCertaEmail({
    title: input.title,
    preheader: input.preheader || input.title,
    inner,
  });
}
