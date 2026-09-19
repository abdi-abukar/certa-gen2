// Migrated content inventory; no imports from the original application.
import { EMAIL_BRAND } from './schema';
const certa = { ...EMAIL_BRAND, social: { discord: 'https://discord.gg/certafutures' } };
type TokenKind = 'text' | 'url' | 'code';
const ACCOUNT_PROP_FIELDS = ['email','displayName','firstName','username','greeting'].map(key => ({key:`account.${key}`,label:key,sample:key==='email'?'alex@example.test':'Alex',kind:'text' as const}));
export type AutomatedEmailSection =
  | "access"
  | "account"
  | "tickets"
  | "funded"
  | "public"
  | "internal";

export type AutomatedEmailAudience = "account" | "guest" | "internal";

export type AutomatedEmailCopy = {
  subject: string;
  eyebrow: string;
  title: string;
  greeting: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  cta2Label: string;
  cta2Url: string;
  footer: string;
  unsubscribeUrl: string;
};

export type AutomatedEmailField = {
  key: string;
  label: string;
  sample: string;
  kind: TokenKind;
};

export type AutomatedEmailDefinition = {
  id: string;
  section: AutomatedEmailSection;
  name: string;
  trigger: string;
  audience: AutomatedEmailAudience;
  required: string[];
  fields: AutomatedEmailField[];
  sample: Record<string, string>;
  defaults: AutomatedEmailCopy;
};

export const AUTOMATED_EMAIL_SECTIONS: Array<{
  id: AutomatedEmailSection;
  label: string;
}> = [
  { id: "access", label: "Access" },
  { id: "account", label: "Account" },
  { id: "tickets", label: "Tickets" },
  { id: "funded", label: "Funded" },
  { id: "public", label: "Public" },
  { id: "internal", label: "Internal" },
];

const FIRM_FIELDS: AutomatedEmailField[] = [
  { key: "firm.name", label: "Firm name", sample: certa.name, kind: "text" },
  {
    key: "firm.shortName",
    label: "Short name",
    sample: certa.shortName,
    kind: "text",
  },
  { key: "firm.domain", label: "Domain", sample: certa.domain, kind: "text" },
  { key: "firm.email", label: "Firm email", sample: certa.email, kind: "text" },
];

function copy(
  input: Partial<AutomatedEmailCopy> &
    Pick<AutomatedEmailCopy, "subject" | "title" | "body">,
): AutomatedEmailCopy {
  return {
    subject: input.subject,
    title: input.title,
    body: input.body,
    eyebrow: "",
    greeting: input.greeting ?? "{{account.greeting}}",
    ctaLabel: input.ctaLabel ?? "",
    ctaUrl: input.ctaUrl ?? "",
    cta2Label: input.cta2Label ?? "",
    cta2Url: input.cta2Url ?? "",
    footer: input.footer ?? `${certa.name} · ${certa.domain}`,
    unsubscribeUrl: input.unsubscribeUrl ?? "",
  };
}

function def(
  definition: Omit<AutomatedEmailDefinition, "fields"> & {
    extra?: AutomatedEmailField[];
    account?: boolean;
  },
): AutomatedEmailDefinition {
  const extra = definition.extra ?? [];
  const accountFields = definition.account === false ? [] : ACCOUNT_PROP_FIELDS;
  return {
    id: definition.id,
    section: definition.section,
    name: definition.name,
    trigger: definition.trigger,
    audience: definition.audience,
    required: definition.required,
    sample: definition.sample,
    defaults: definition.defaults,
    fields: [...accountFields, ...FIRM_FIELDS, ...extra],
  };
}

export const AUTOMATED_EMAILS: AutomatedEmailDefinition[] = [
  def({
    id: "login_pin",
    section: "access",
    name: "Login code",
    trigger: "Signed-in user requests an email PIN to finish login.",
    audience: "account",
    required: ["pin"],
    extra: [{ key: "pin", label: "PIN", sample: "482193", kind: "code" }],
    sample: { pin: "482193" },
    defaults: copy({
      subject: "Your {{firm.shortName}} login code",
      title: "Your login code",
      body: "Use this code to finish signing in to your {{firm.name}} account.\n\n{{pin}}\n\nThis code expires in 10 minutes. If you did not request it, you can ignore this email.",
      footer: "Never share this code. Certa staff will never ask for it.",
    }),
  }),
  def({
    id: "signup_pin",
    section: "access",
    name: "Signup code",
    trigger: "A new email is verified before the Certa account is created.",
    audience: "guest",
    required: ["pin"],
    extra: [{ key: "pin", label: "PIN", sample: "731048", kind: "code" }],
    sample: { pin: "731048" },
    defaults: copy({
      subject: "Verify your {{firm.shortName}} email",
      title: "Verify your email",
      body: "Use this code to confirm you own this email before we create your {{firm.name}} account.\n\n{{pin}}\n\nThis code expires in 10 minutes. If you did not request it, you can ignore this email.",
      footer: "Never share this code. Certa staff will never ask for it.",
    }),
  }),
  def({
    id: "password_reset",
    section: "access",
    name: "Password reset",
    trigger: "Account holder uses Forgot password on the login form.",
    audience: "account",
    required: ["resetUrl"],
    extra: [
      {
        key: "resetUrl",
        label: "Reset URL",
        sample: "https://certafutures.com/reset-password?token_hash=example",
        kind: "url",
      },
    ],
    sample: {
      resetUrl: "https://certafutures.com/reset-password?token_hash=example",
    },
    defaults: copy({
      subject: "Reset your {{firm.shortName}} password",
      title: "Reset your password",
      body: "We received a request to reset the password for your {{firm.name}} portal login.\n\nClick the button below to choose a new password. This link expires soon and can only be used once.",
      ctaLabel: "Choose a new password",
      ctaUrl: "{{resetUrl}}",
      footer:
        "If you didn’t ask for this, you can ignore this email — your password will stay the same.",
    }),
  }),
  def({
    id: "account_invite",
    section: "access",
    name: "Account invite",
    trigger:
      "Staff invites someone to the Certa portal without a purchase. No trading account is issued.",
    audience: "account",
    required: ["setupUrl"],
    extra: [
      {
        key: "setupUrl",
        label: "Setup URL",
        sample: "https://certafutures.com/reset-password?token_hash=example",
        kind: "url",
      },
      {
        key: "loginUrl",
        label: "Login URL",
        sample: "https://www.certafutures.com/?login=1",
        kind: "url",
      },
    ],
    sample: {
      setupUrl: "https://certafutures.com/reset-password?token_hash=example",
      loginUrl: "https://www.certafutures.com/?login=1",
    },
    defaults: copy({
      subject: "You’re invited to {{firm.shortName}}",
      title: "Your Certa portal is ready",
      body: "You’ve been invited to {{firm.name}} — portal access so you can join Affiliates. This is not a trading account and nothing is billed.\n\nChoose a password and you’re in. KYC, your tax form, and a payout method are only needed before commissions are paid out.",
      ctaLabel: "Set up your account",
      ctaUrl: "{{setupUrl}}",
      footer: "Questions? Reply to this email.",
    }),
  }),
  def({
    id: "checkout_receipt",
    section: "account",
    name: "Checkout receipt",
    trigger:
      "Checkout is paid. Sent once, before the Tradara invite, with the order details inline.",
    audience: "account",
    // Listed as required so the order details stay in the body even if the copy
    // is edited in the console — there is no attachment to fall back on.
    required: [
      "receipt.orderReference",
      "receipt.total",
      "receipt.lines",
      "receipt.paidAt",
      "loginUrl",
      "siteUrl",
    ],
    extra: [
      { key: "receipt.total", label: "Total paid", sample: "$150.00", kind: "text" },
      {
        key: "receipt.lines",
        label: "Line items",
        sample: "Certa Account ($50,000 evaluation) — $150.00\nTotal paid — $150.00",
        kind: "text",
      },
      {
        key: "receipt.orderReference",
        label: "Order reference",
        sample: "chk_4f2a91",
        kind: "text",
      },
      {
        key: "receipt.paidAt",
        label: "Paid at",
        sample: "Mon, 17 Aug 2026 15:04:00 GMT",
        kind: "text",
      },
      {
        key: "receipt.contentSha256",
        label: "Order record SHA-256",
        sample: "a1b2c3d4e5f6",
        kind: "text",
      },
      {
        key: "receipt.supportEmail",
        label: "Support email",
        sample: certa.email,
        kind: "text",
      },
      {
        key: "receipt.agreementSummary",
        label: "Agreement summary",
        sample:
          "Supplier: Studio23labs LLC\nService: one personal simulated futures evaluation.",
        kind: "text",
      },
      {
        key: "siteUrl",
        label: "Site URL",
        sample: "https://www.certafutures.com",
        kind: "url",
      },
      {
        key: "loginUrl",
        label: "Login URL",
        sample: "https://www.certafutures.com/?login=1",
        kind: "url",
      },
    ],
    sample: {
      "receipt.total": "$150.00",
      "receipt.lines":
        "Certa Account ($50,000 evaluation) — $150.00\nTotal paid — $150.00",
      "receipt.orderReference": "chk_4f2a91",
      "receipt.paidAt": "Mon, 17 Aug 2026 15:04:00 GMT",
      "receipt.contentSha256": "a1b2c3d4e5f6",
      "receipt.supportEmail": certa.email,
      "receipt.agreementSummary":
        "Supplier: Studio23labs LLC\nService: one personal simulated futures evaluation.",
      siteUrl: "https://www.certafutures.com",
      loginUrl: "https://www.certafutures.com/?login=1",
    },
    defaults: copy({
      subject: "Thanks for purchasing — {{firm.shortName}}",
      title: "Payment received",
      body: "Thanks for purchasing {{firm.shortName}}.\n\nWe received {{receipt.total}} for your evaluation. Sign in with the email and password you used at checkout.\n\nYour order\n{{receipt.lines}}\n\nOrder reference: {{receipt.orderReference}}\nPaid: {{receipt.paidAt}}\n\nKeep this email as your record of purchase. Terms, privacy, billing, and refund policies are at {{siteUrl}}/legal.",
      ctaLabel: "Log in",
      ctaUrl: "{{loginUrl}}",
      footer: "Questions? Reply to this email.",
    }),
  }),
  def({
    id: "checkout_crypto_started",
    section: "account",
    name: "Crypto payment started",
    trigger: "A crypto invoice is created at checkout, before any coins are sent.",
    audience: "guest",
    required: ["ctaUrl", "receipt.orderReference"],
    extra: [
      {
        key: "receipt.total",
        label: "Amount",
        sample: "$142.50",
        kind: "text",
      },
      {
        key: "receipt.orderReference",
        label: "Order reference",
        sample: "chk_4f2a91",
        kind: "text",
      },
      {
        key: "ctaUrl",
        label: "Status URL",
        sample: "https://certafutures.com/checkout/status?order=chk_4f2a91&t=token",
        kind: "url",
      },
      {
        key: "siteUrl",
        label: "Site URL",
        sample: "https://certafutures.com",
        kind: "url",
      },
    ],
    sample: {
      "receipt.total": "$142.50",
      "receipt.orderReference": "chk_4f2a91",
      ctaUrl: "https://www.certafutures.com/?checkout=1",
      siteUrl: "https://www.certafutures.com",
    },
    defaults: copy({
      subject: "Crypto checkout started — {{firm.shortName}}",
      title: "Finish your crypto payment",
      body: "We opened a crypto invoice for {{receipt.total}}.\n\nFinish payment in the checkout window. If you send a partial amount, open a support ticket — don’t start a second checkout.\n\nOrder {{receipt.orderReference}}",
      ctaLabel: "Return to checkout",
      ctaUrl: "{{ctaUrl}}",
      footer: "If you didn’t start this, you can ignore the email.",
    }),
  }),
  def({
    id: "checkout_crypto_partial",
    section: "account",
    name: "Crypto payment underfunded",
    trigger:
      "NOWPayments reports that a crypto invoice received less than the required amount.",
    audience: "guest",
    required: ["ctaUrl", "receipt.orderReference"],
    extra: [
      {
        key: "receipt.total",
        label: "Invoice total",
        sample: "$142.50",
        kind: "text",
      },
      {
        key: "receipt.orderReference",
        label: "Order reference",
        sample: "chk_4f2a91",
        kind: "text",
      },
      {
        key: "statusLabel",
        label: "Status label",
        sample: "Partial payment received",
        kind: "text",
      },
      {
        key: "statusDetail",
        label: "Status detail",
        sample:
          "Some crypto arrived, but the invoice is not fully funded yet.",
        kind: "text",
      },
      {
        key: "ctaUrl",
        label: "Support URL",
        sample: "https://certafutures.com/?support=1",
        kind: "url",
      },
      {
        key: "siteUrl",
        label: "Site URL",
        sample: "https://certafutures.com",
        kind: "url",
      },
    ],
    sample: {
      "receipt.total": "$142.50",
      "receipt.orderReference": "chk_4f2a91",
      statusLabel: "Partial payment received",
      statusDetail:
        "Some of the crypto arrived, but not the full amount. Open a support ticket so we can review it.",
      ctaUrl: "https://www.certafutures.com/?support=1",
      siteUrl: "https://www.certafutures.com",
    },
    defaults: copy({
      subject: "Action needed: crypto payment underfunded — {{firm.shortName}}",
      title: "Please open a support ticket",
      body: "We received part of your crypto payment for the {{receipt.total}} invoice, but NOWPayments marked it underfunded.\n\nPlease open a support ticket so our team can review the transaction. Include order {{receipt.orderReference}} and your transaction hash. Do not send another payment or start a second checkout until support replies.",
      ctaLabel: "Open support ticket",
      ctaUrl: "{{ctaUrl}}",
      footer:
        "Our team will review the payment and tell you the next step.",
    }),
  }),
  def({
    id: "checkout_crypto_processing",
    section: "account",
    name: "Crypto payment processing",
    trigger:
      "A crypto checkout is submitted on-chain and is waiting for confirmation.",
    audience: "guest",
    required: ["ctaUrl", "supportUrl", "receipt.orderReference"],
    extra: [
      {
        key: "receipt.total",
        label: "Amount",
        sample: "$142.50",
        kind: "text",
      },
      {
        key: "receipt.orderReference",
        label: "Order reference",
        sample: "chk_4f2a91",
        kind: "text",
      },
      {
        key: "statusLabel",
        label: "Status label",
        sample: "Processing",
        kind: "text",
      },
      {
        key: "statusDetail",
        label: "Status detail",
        sample:
          "Your crypto payment was submitted. We’re waiting for the blockchain to confirm it.",
        kind: "text",
      },
      {
        key: "ctaUrl",
        label: "Status URL",
        sample: "https://certafutures.com/checkout/status?order=chk_4f2a91&t=token",
        kind: "url",
      },
      {
        key: "supportUrl",
        label: "Support URL",
        sample: "https://certafutures.com/?support=1",
        kind: "url",
      },
      {
        key: "siteUrl",
        label: "Site URL",
        sample: "https://certafutures.com",
        kind: "url",
      },
    ],
    sample: {
      "receipt.total": "$142.50",
      "receipt.orderReference": "chk_4f2a91",
      statusLabel: "Processing",
      statusDetail:
        "Your crypto payment was submitted. We’re waiting for the blockchain to confirm it.",
      ctaUrl:
        "https://www.certafutures.com/checkout/status?order=chk_4f2a91&t=token",
      supportUrl: "https://www.certafutures.com/?support=1",
      siteUrl: "https://www.certafutures.com",
    },
    defaults: copy({
      subject: "We received your crypto payment — {{firm.shortName}}",
      title: "Payment received — confirming",
      body: "We received your crypto payment for {{receipt.total}}.\n\nThe network is still confirming it. We’ll email you again when your evaluation is ready — don’t send a second payment.\n\nOrder {{receipt.orderReference}}",
      ctaLabel: "See payment status",
      ctaUrl: "{{ctaUrl}}",
      cta2Label: "Open support ticket",
      cta2Url: "{{supportUrl}}",
    }),
  }),
  def({
    id: "checkout_crypto_failed",
    section: "account",
    name: "Crypto payment failed",
    trigger:
      "A crypto checkout expired, failed, or was cancelled before confirmation.",
    audience: "guest",
    required: ["ctaUrl", "receipt.orderReference"],
    extra: [
      {
        key: "receipt.total",
        label: "Amount",
        sample: "$142.50",
        kind: "text",
      },
      {
        key: "receipt.orderReference",
        label: "Order reference",
        sample: "chk_4f2a91",
        kind: "text",
      },
      {
        key: "statusLabel",
        label: "Status label",
        sample: "Could not complete",
        kind: "text",
      },
      {
        key: "statusDetail",
        label: "Status detail",
        sample: "The crypto payment expired before it was completed.",
        kind: "text",
      },
      {
        key: "ctaUrl",
        label: "Status URL",
        sample: "https://certafutures.com/checkout/status?order=chk_4f2a91&t=token",
        kind: "url",
      },
      {
        key: "siteUrl",
        label: "Site URL",
        sample: "https://certafutures.com",
        kind: "url",
      },
    ],
    sample: {
      "receipt.total": "$142.50",
      "receipt.orderReference": "chk_4f2a91",
      statusLabel: "Could not complete",
      statusDetail: "The crypto payment expired before it was completed.",
      ctaUrl:
        "https://www.certafutures.com/?checkout=1",
      siteUrl: "https://www.certafutures.com",
    },
    defaults: copy({
      subject: "Crypto payment did not complete — {{firm.shortName}}",
      title: "Payment did not finish",
      body: "We could not complete the crypto payment for {{receipt.total}}.\n\n{{statusDetail}}\n\nOrder {{receipt.orderReference}}\nNo evaluation was created. If you already sent funds, reply to this email. If you didn’t, you can check out again.",
      ctaLabel: "Check out again",
      ctaUrl: "{{ctaUrl}}",
      footer: "Include the order reference if you contact support.",
    }),
  }),
  def({
    id: "ticket_claim_account",
    section: "tickets",
    name: "Ticket ready — signed in",
    trigger: "A ticket is durably assigned to an authenticated Certa account.",
    audience: "account",
    required: ["ctaUrl"],
    extra: [
      { key: "ticket.name", label: "Ticket name", sample: "Gold scratch", kind: "text" },
      { key: "ticket.seat", label: "Seat", sample: "14", kind: "text" },
      {
        key: "ctaUrl",
        label: "Dashboard URL",
        sample: "https://certafutures.com/dashboard",
        kind: "url",
      },
    ],
    sample: {
      "ticket.name": "Gold scratch",
      "ticket.seat": "14",
      ctaUrl: "https://certafutures.com/dashboard",
    },
    defaults: copy({
      subject: "Your {{ticket.name}} — seat #{{ticket.seat}}",
      title: "Your ticket is ready",
      body: "Seat #{{ticket.seat}} — a {{ticket.name}} — is already on your Certa account.\n\nSign in and scratch it in the dashboard.",
      ctaLabel: "Open your ticket",
      ctaUrl: "{{ctaUrl}}",
    }),
  }),
  def({
    id: "ticket_claim_guest",
    section: "tickets",
    name: "Ticket ready — collect",
    trigger: "Weekly puzzle is solved by an email that does not have a Certa account yet.",
    audience: "guest",
    required: ["ctaUrl"],
    extra: [
      { key: "ticket.name", label: "Ticket name", sample: "Gold scratch", kind: "text" },
      { key: "ticket.seat", label: "Seat", sample: "14", kind: "text" },
      {
        key: "ctaUrl",
        label: "Collect URL",
        sample: "https://certafutures.com/tickets/collect?token=example",
        kind: "url",
      },
    ],
    sample: {
      "ticket.name": "Gold scratch",
      "ticket.seat": "14",
      ctaUrl: "https://certafutures.com/tickets/collect?token=example",
    },
    defaults: copy({
      subject: "Your {{ticket.name}} — seat #{{ticket.seat}}",
      title: "Your ticket is ready",
      greeting: "",
      body: "Seat #{{ticket.seat}} is yours — a {{ticket.name}}.\n\nIt's tied to this email. Create a free Certa account with it (or sign in) and the ticket lands on your dashboard, ready to scratch.",
      ctaLabel: "Claim your ticket",
      ctaUrl: "{{ctaUrl}}",
    }),
  }),
  def({
    id: "friend_invite_received",
    section: "tickets",
    name: "Friend invite — 33% off",
    trigger: "An affiliate invites this email. A 33% off first-evaluation ticket is already on it.",
    audience: "guest",
    required: ["ctaUrl"],
    extra: [
      { key: "invite.from", label: "Inviter", sample: "Alex", kind: "text" },
      { key: "invite.percent", label: "Percent off", sample: "33", kind: "text" },
      { key: "ticket.code", label: "Ticket code", sample: "CT-7K2P9Q", kind: "code" },
      {
        key: "ctaUrl",
        label: "Claim URL",
        sample: "https://certafutures.com/tickets?code=CT-7K2P9Q",
        kind: "url",
      },
    ],
    sample: {
      "invite.from": "Alex",
      "invite.percent": "33",
      "ticket.code": "CT-7K2P9Q",
      ctaUrl: "https://certafutures.com/tickets?code=CT-7K2P9Q",
    },
    defaults: copy({
      subject: "{{invite.from}} invited you to {{firm.name}} — {{invite.percent}}% off is waiting",
      title: "Your buddy invited you to Certa",
      greeting: "",
      body: "{{invite.from}} invited you to {{firm.name}}, and we've already put a {{invite.percent}}% off coupon on this email.\n\nIt's a scratch ticket — code {{ticket.code}}. Create a free account with this email, scratch it, and the discount applies to your first evaluation at checkout.\n\nFirst evaluation only. One per person.",
      ctaLabel: "Claim your {{invite.percent}}% off",
      ctaUrl: "{{ctaUrl}}",
    }),
  }),
  def({
    id: "friend_invite_rewarded",
    section: "tickets",
    name: "Friend invite — reward",
    trigger: "A friend this account invited bought their first evaluation with the invite ticket.",
    audience: "account",
    required: ["ctaUrl"],
    extra: [
      { key: "invite.friend", label: "Friend (masked)", sample: "jo•••@example.com", kind: "text" },
      { key: "invite.percent", label: "Percent off", sample: "33", kind: "text" },
      { key: "ticket.code", label: "Ticket code", sample: "CT-3M8R2D", kind: "code" },
      {
        key: "ctaUrl",
        label: "Dashboard URL",
        sample: "https://certafutures.com/dashboard",
        kind: "url",
      },
    ],
    sample: {
      "invite.friend": "jo•••@example.com",
      "invite.percent": "33",
      "ticket.code": "CT-3M8R2D",
      ctaUrl: "https://certafutures.com/dashboard",
    },
    defaults: copy({
      subject: "You got {{invite.percent}}% off — thanks for referring a friend",
      title: "Your referral paid off",
      body: "{{invite.friend}} just bought their first Certa evaluation with your invite.\n\nAs a thank-you, a {{invite.percent}}% off ticket ({{ticket.code}}) is on your account. Scratch it in your dashboard and use it on your next evaluation.",
      ctaLabel: "Open your ticket",
      ctaUrl: "{{ctaUrl}}",
    }),
  }),
  def({
    id: "evaluation_failed",
    section: "account",
    name: "Evaluation failed",
    trigger:
      "An evaluation fails the published loss rules. Not sent for a rules or admin breach.",
    audience: "account",
    required: ["ctaUrl", "accountId"],
    extra: [
      {
        key: "accountId",
        label: "Eval account ID",
        sample: "TRD-50001",
        kind: "text",
      },
      {
        key: "ctaUrl",
        label: "Fail Ticket URL",
        sample: "https://www.certafutures.com/dashboard/trophies#tickets",
        kind: "url",
      },
    ],
    sample: {
      accountId: "TRD-50001",
      ctaUrl: "https://www.certafutures.com/dashboard/trophies#tickets",
    },
    defaults: copy({
      subject: "Your evaluation ended — {{firm.shortName}}",
      title: "This evaluation didn’t pass",
      body: "Your evaluation is over. This was a fail against the published loss rules, not a rules breach.\n\nWe issued a Fail Ticket on your account. Scratch it for a coupon off your next evaluation. If you start checkout and back out, that ticket stays yours until you use it.\n\nAccount: {{accountId}}",
      ctaLabel: "Open your Fail Ticket",
      ctaUrl: "{{ctaUrl}}",
    }),
  }),
  def({
    id: "sim_funded_onboarding_ready",
    section: "funded",
    name: "Eval passed — onboarding complete",
    trigger: "Evaluation passes and KYC, tax, and agreement are already done.",
    audience: "account",
    required: ["ctaUrl"],
    extra: [
      {
        key: "accountId",
        label: "Eval account ID",
        sample: "TRD-50001",
        kind: "text",
      },
      {
        key: "ctaUrl",
        label: "Dashboard URL",
        sample: "https://certafutures.com/dashboard/compliance",
        kind: "url",
      },
    ],
    sample: {
      accountId: "TRD-50001",
      ctaUrl: "https://certafutures.com/dashboard/compliance",
    },
    defaults: copy({
      subject: "Your evaluation passed — finishing Sim Funded activation",
      title: "Evaluation passed",
      body: "Your evaluation account passed. Onboarding looks complete on our side — open your dashboard to finish Sim Funded activation.\n\nAccount: {{accountId}}",
      ctaLabel: "Open your dashboard",
      ctaUrl: "{{ctaUrl}}",
    }),
  }),
  def({
    id: "sim_funded_onboarding_required",
    section: "funded",
    name: "Eval passed — action required",
    trigger: "Evaluation passes and KYC, tax, or the Sim Funded agreement is still outstanding.",
    audience: "account",
    required: ["ctaUrl"],
    extra: [
      {
        key: "accountId",
        label: "Eval account ID",
        sample: "TRD-50001",
        kind: "text",
      },
      {
        key: "steps",
        label: "Outstanding steps",
        sample: "1) Identity verification (KYC)\n2) Current tax form",
        kind: "text",
      },
      {
        key: "ctaUrl",
        label: "Dashboard URL",
        sample: "https://certafutures.com/dashboard/compliance",
        kind: "url",
      },
    ],
    sample: {
      accountId: "TRD-50001",
      steps: "1) Identity verification (KYC)\n2) Current tax form",
      ctaUrl: "https://certafutures.com/dashboard/compliance",
    },
    defaults: copy({
      subject: "Congrats, you passed — one step before you're funded",
      title: "Congrats on completing your evaluation",
      body: "You passed. Your Certified Funded account is waiting on compliance before it can go live. Complete the steps below and we'll switch it on:\n\n{{steps}}\n\nAccount: {{accountId}}",
      ctaLabel: "Complete compliance",
      ctaUrl: "{{ctaUrl}}",
    }),
  }),
  def({
    id: "sim_funded_issued",
    section: "funded",
    name: "Sim Funded issued",
    trigger: "Onboarding is complete and the Sim Funded trading account is live.",
    audience: "account",
    required: ["ctaUrl"],
    extra: [
      {
        key: "accountId",
        label: "Funded account ID",
        sample: "TRD-90001",
        kind: "text",
      },
      {
        key: "ctaUrl",
        label: "Dashboard URL",
        sample: "https://certafutures.com/dashboard",
        kind: "url",
      },
    ],
    sample: {
      accountId: "TRD-90001",
      ctaUrl: "https://certafutures.com/dashboard",
    },
    defaults: copy({
      subject: "Your Sim Funded account is ready",
      title: "Account ready",
      body: "Onboarding is complete and your Sim Funded account is live. Open your dashboard to start trading.\n\nAccount: {{accountId}}",
      ctaLabel: "Open your dashboard",
      ctaUrl: "{{ctaUrl}}",
    }),
  }),
  def({
    id: "waitlist_joined",
    section: "public",
    name: "Waitlist confirmation",
    trigger: "Someone joins the presale waitlist from the public site.",
    audience: "guest",
    required: ["unsubscribeUrl"],
    extra: [
      {
        key: "launchDate",
        label: "Launch date",
        sample: "Sunday, August 16 at 12:00 AM EDT",
        kind: "text",
      },
      {
        key: "homeUrl",
        label: "Home URL",
        sample: "https://certafutures.com/",
        kind: "url",
      },
      {
        key: "discordUrl",
        label: "Discord URL",
        sample: certa.social.discord,
        kind: "url",
      },
      {
        key: "fundedAgreementUrl",
        label: "Funded agreement URL",
        sample: "https://certafutures.com/funded-agreement",
        kind: "url",
      },
      {
        key: "unsubscribeUrl",
        label: "Unsubscribe URL",
        sample: "https://certafutures.com/api/presale/waitlist/unsubscribe?token=example",
        kind: "url",
      },
    ],
    sample: {
      launchDate: "Sunday, August 16 at 12:00 AM EDT",
      homeUrl: "https://certafutures.com/",
      discordUrl: certa.social.discord,
      fundedAgreementUrl: "https://certafutures.com/funded-agreement",
      unsubscribeUrl:
        "https://certafutures.com/api/presale/waitlist/unsubscribe?token=example",
    },
    defaults: copy({
      subject: "You’re on the Certa Futures waitlist",
      title: "Thanks for joining us.",
      greeting: "",
      body: "{{firm.name}} is one evaluation and one Certified Funded account — first payout up to $1K (Bronze), then up to $2K (Crown). You’ll be among the first to know when access opens.\n\nOne Day Pass presale: {{launchDate}}\n\nPass in as little as one trading day.\nOne simple simulated futures evaluation.\nOne Certified Funded account after validation.\n$500 minimum · $1K first max · $2K later max.\n\nHave feedback or thoughts? Reply to this email — we read every message.\n\nRead the Funded Account Agreement: {{fundedAgreementUrl}}",
      ctaLabel: "Join the Certa Discord",
      ctaUrl: "{{discordUrl}}",
      footer:
        "You received this because this email joined the Certa Futures waitlist. If that wasn’t you, no action is needed.",
      unsubscribeUrl: "{{unsubscribeUrl}}",
    }),
  }),
  def({
    id: "ops_payout_request",
    section: "internal",
    name: "Payout request (ops)",
    trigger: "A trader submits a payout request. Sent to Certa ops, not the trader.",
    audience: "internal",
    required: ["amount"],
    extra: [
      { key: "amount", label: "Amount", sample: "$1,000", kind: "text" },
      {
        key: "tradaraAccountId",
        label: "Tradara account",
        sample: "TRD-90001",
        kind: "text",
      },
      { key: "methodLabel", label: "Method", sample: "Wise", kind: "text" },
      {
        key: "methodDestination",
        label: "Destination",
        sample: "···· 4821",
        kind: "text",
      },
      { key: "cycleName", label: "Award cycle", sample: "Crown", kind: "text" },
    ],
    sample: {
      amount: "$1,000",
      tradaraAccountId: "TRD-90001",
      methodLabel: "Wise",
      methodDestination: "···· 4821",
      cycleName: "Crown",
    },
    defaults: copy({
      subject: "Payout request · {{amount}}",
      title: "New payout request",
      body: "{{account.displayName}} requested {{amount}} from {{tradaraAccountId}}.\n\n{{methodLabel}} · {{methodDestination}} · {{cycleName}}",
    }),
  }),
  def({
    id: "payout_approved",
    section: "funded",
    name: "Payout approved",
    trigger: "Staff approves a trader or affiliate payout after review.",
    audience: "account",
    required: ["amount", "estimate", "ctaUrl"],
    extra: [
      { key: "amount", label: "Amount", sample: "$1,000", kind: "text" },
      { key: "methodLabel", label: "Method", sample: "Wise", kind: "text" },
      {
        key: "estimate",
        label: "Arrival estimate",
        sample: "1–2 business days",
        kind: "text",
      },
      { key: "kind", label: "Payout type", sample: "trader", kind: "text" },
      {
        key: "ctaUrl",
        label: "Dashboard URL",
        sample: "https://certafutures.com/dashboard/payouts",
        kind: "url",
      },
    ],
    sample: {
      amount: "$1,000",
      methodLabel: "Wise",
      estimate: "1–2 business days",
      kind: "trader",
      ctaUrl: "https://certafutures.com/dashboard/payouts",
    },
    defaults: copy({
      subject: "Your {{amount}} payout was approved",
      title: "Payout approved",
      body: "Your {{amount}} payout was approved for {{methodLabel}}.\n\nArrival estimate: {{estimate}}.\n\nPending meant it was under review with our team. Approval does not confirm an external transfer. Check your dashboard for the recorded payment status.",
      ctaLabel: "View payouts",
      ctaUrl: "{{ctaUrl}}",
    }),
  }),
  def({
    id: "payout_rejected",
    section: "funded",
    name: "Payout rejected",
    trigger: "Staff rejects a trader or affiliate payout with a customer-facing reason.",
    audience: "account",
    required: ["amount", "rejectReason", "ctaUrl"],
    extra: [
      { key: "amount", label: "Amount", sample: "$1,000", kind: "text" },
      { key: "methodLabel", label: "Method", sample: "Wise", kind: "text" },
      {
        key: "rejectReason",
        label: "Rejection message",
        sample: "Qualifying days need to be confirmed.",
        kind: "text",
      },
      { key: "kind", label: "Payout type", sample: "trader", kind: "text" },
      {
        key: "ctaUrl",
        label: "Dashboard URL",
        sample: "https://certafutures.com/dashboard/payouts",
        kind: "url",
      },
    ],
    sample: {
      amount: "$1,000",
      methodLabel: "Wise",
      rejectReason: "Qualifying days need to be confirmed.",
      kind: "trader",
      ctaUrl: "https://certafutures.com/dashboard/payouts",
    },
    defaults: copy({
      subject: "Update on your {{amount}} payout",
      title: "This payout was not approved",
      body: "We reviewed your {{amount}} {{methodLabel}} payout and could not approve it.\n\n{{rejectReason}}\n\nYou can submit a new request from your dashboard once the issue is resolved.",
      ctaLabel: "View payouts",
      ctaUrl: "{{ctaUrl}}",
    }),
  }),
  def({
    id: "ops_stripe_dispute",
    section: "internal",
    name: "ZEN chargeback (ops)",
    trigger: "ZEN reports a card chargeback. Sent to the dispute alert inbox.",
    audience: "internal",
    required: ["disputeId"],
    extra: [
      {
        key: "disputeId",
        label: "Dispute ID",
        sample: "zen_tx_123",
        kind: "text",
      },
      { key: "reason", label: "Reason", sample: "fraudulent", kind: "text" },
      { key: "amount", label: "Amount", sample: "150.00 USD", kind: "text" },
      {
        key: "customerEmail",
        label: "Customer email",
        sample: "trader@example.com",
        kind: "text",
      },
      {
        key: "evidenceDueBy",
        label: "Evidence due",
        sample: "Mon, 24 Aug 2026",
        kind: "text",
      },
      {
        key: "ctaUrl",
        label: "ZEN URL",
        sample: "https://my.zen.com/",
        kind: "url",
      },
    ],
    sample: {
      disputeId: "zen_tx_123",
      reason: "chargeback",
      amount: "150.00 USD",
      customerEmail: "trader@example.com",
      evidenceDueBy: "See myZEN for the response window.",
      ctaUrl: "https://my.zen.com/",
    },
    defaults: copy({
      subject: "Action required: ZEN chargeback {{disputeId}}",
      title: "Review required",
      greeting: "",
      body: "Dispute: {{disputeId}}\nReason: {{reason}}\nAmount: {{amount}}\nCustomer: {{customerEmail}}\nEvidence due: {{evidenceDueBy}}",
      ctaLabel: "Open myZEN",
      ctaUrl: "{{ctaUrl}}",
      footer:
        "Read the cardholder claim first. Accept valid disputes; submit only concise, truthful, relevant evidence.",
    }),
  }),
  def({
    id: "ops_fraud_warning",
    section: "internal",
    name: "Payment fraud warning (ops)",
    trigger: "A processor reports a suspected fraudulent card payment.",
    audience: "internal",
    required: ["warningId"],
    extra: [
      { key: "warningId", label: "Warning ID", sample: "issfr_123", kind: "text" },
      { key: "fraudType", label: "Fraud type", sample: "unauthorized_use_of_card", kind: "text" },
      { key: "actionable", label: "Actionable", sample: "Yes", kind: "text" },
      {
        key: "ctaUrl",
        label: "Review URL",
        sample: "https://my.zen.com/",
        kind: "url",
      },
    ],
    sample: {
      warningId: "warn_123",
      fraudType: "unauthorized_use_of_card",
      actionable: "Yes",
      ctaUrl: "https://my.zen.com/",
    },
    defaults: copy({
      subject: "Review payment fraud warning {{warningId}}",
      title: "Review required",
      greeting: "",
      body: "Warning: {{warningId}}\nFraud type: {{fraudType}}\nActionable: {{actionable}}",
      ctaLabel: "Open processor dashboard",
      ctaUrl: "{{ctaUrl}}",
      footer:
        "Review payment authority and related access without presuming customer wrongdoing.",
    }),
  }),
  def({
    id: "ops_refund_review",
    section: "internal",
    name: "Refund access review (ops)",
    trigger: "A paid checkout is fully or partially refunded.",
    audience: "internal",
    required: ["checkoutId"],
    extra: [
      {
        key: "title",
        label: "Alert title",
        sample: "Fully refunded account requires access review",
        kind: "text",
      },
      { key: "checkoutId", label: "Checkout ID", sample: "chk_4f2a91", kind: "text" },
      { key: "chargeId", label: "Charge ID", sample: "ch_123", kind: "text" },
      {
        key: "refunded",
        label: "Refunded amount",
        sample: "15000/15000 USD",
        kind: "text",
      },
      {
        key: "tradaraAccountId",
        label: "Tradara account",
        sample: "TRD-50001",
        kind: "text",
      },
    ],
    sample: {
      title: "Fully refunded account requires access review",
      checkoutId: "chk_4f2a91",
      chargeId: "ch_123",
      refunded: "15000/15000 USD",
      tradaraAccountId: "TRD-50001",
    },
    defaults: copy({
      subject: "{{title}}",
      title: "{{title}}",
      greeting: "",
      body: "Checkout: {{checkoutId}}\nCharge: {{chargeId}}\nRefunded: {{refunded}}\nTradara account: {{tradaraAccountId}}",
      footer:
        "Review related access and payout eligibility. Do not remove unrelated customer rights.",
    }),
  }),
  def({
    id: "ops_tradara_activation",
    section: "internal",
    name: "Manual Tradara activation (ops)",
    trigger: "Payment succeeded but Tradara provisioning failed.",
    audience: "internal",
    required: ["checkoutId"],
    extra: [
      { key: "checkoutId", label: "Checkout ID", sample: "chk_4f2a91", kind: "text" },
      {
        key: "customer",
        label: "Customer",
        sample: "Alex Rivera <trader@example.com>",
        kind: "text",
      },
      {
        key: "error",
        label: "Tradara error",
        sample: "Plan reference missing",
        kind: "text",
      },
    ],
    sample: {
      checkoutId: "chk_4f2a91",
      customer: "Alex Rivera <trader@example.com>",
      error: "Plan reference missing",
    },
    defaults: copy({
      subject: "Manual Tradara activation required: {{account.email}}",
      title: "Manual Tradara activation required",
      greeting: "",
      body: "Checkout: {{checkoutId}}\nCustomer: {{customer}}\nTradara error: {{error}}\n\nPayment is confirmed and the Certa login exists. Manually create or activate the Tradara evaluation, then update the checkout record.",
    }),
  }),
];

// Expiry is supplied by the token authority, never editable hard-coded copy.
for (const definition of AUTOMATED_EMAILS.filter(item => item.id === 'login_pin' || item.id === 'signup_pin')) {
  definition.fields.push({key:'expiresInMinutes',label:'Expiry in minutes',kind:'text',sample:'10'});
  definition.required.push('expiresInMinutes');
  definition.sample.expiresInMinutes='10';
  definition.defaults.body=definition.defaults.body.replace('10 minutes','{{expiresInMinutes}} minutes');
}
