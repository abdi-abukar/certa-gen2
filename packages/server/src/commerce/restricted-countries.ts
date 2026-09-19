/**
 * Client-safe restricted-jurisdiction helpers.
 * Live rows live in `restricted_countries`; this seed is the fallback and
 * matches the Wyoming LLC / US OFAC + card-network list in the migration.
 */

export const RESTRICTED_COUNTRY_UNAVAILABLE =
  "Certa is not available for billing addresses in this country.";

export type RestrictedCountryReason =
  | "ofac"
  | "stripe"
  | "payout"
  | "firm_policy";

export type RestrictedCountry = {
  code: string;
  name: string;
  reason: RestrictedCountryReason;
  notes?: string;
};

/** Country-level ISO 3166-1 blocks (entire country). */
export const STATIC_RESTRICTED_COUNTRIES: RestrictedCountry[] = [
  {
    code: "AF",
    name: "Afghanistan",
    reason: "ofac",
    notes: "Taliban / OFAC program.",
  },
  {
    code: "BY",
    name: "Belarus",
    reason: "ofac",
    notes: "Russia-related OFAC sanctions.",
  },
  {
    code: "CU",
    name: "Cuba",
    reason: "ofac",
    notes: "OFAC comprehensive embargo.",
  },
  {
    code: "IR",
    name: "Iran",
    reason: "ofac",
    notes: "OFAC comprehensive embargo.",
  },
  {
    code: "KP",
    name: "North Korea",
    reason: "ofac",
    notes: "OFAC comprehensive embargo.",
  },
  {
    code: "MM",
    name: "Myanmar",
    reason: "ofac",
    notes: "Burma OFAC program.",
  },
  {
    code: "RU",
    name: "Russia",
    reason: "ofac",
    notes: "OFAC determinations; card networks unsupported.",
  },
  {
    code: "SD",
    name: "Sudan",
    reason: "ofac",
    notes: "Residual OFAC Sudan program.",
  },
  {
    code: "SS",
    name: "South Sudan",
    reason: "ofac",
    notes: "OFAC South Sudan program.",
  },
  {
    code: "SY",
    name: "Syria",
    reason: "ofac",
    notes: "OFAC comprehensive embargo.",
  },
  {
    code: "VE",
    name: "Venezuela",
    reason: "ofac",
    notes: "OFAC Venezuelan government sanctions.",
  },
  {
    code: "AL",
    name: "Albania",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "AQ",
    name: "Antarctica",
    reason: "firm_policy",
    notes: "Non-residential. Not offered at checkout.",
  },
  {
    code: "BF",
    name: "Burkina Faso",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "TD",
    name: "Chad",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "CG",
    name: "Congo",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "CI",
    name: "Côte d'Ivoire",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "DJ",
    name: "Djibouti",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "TL",
    name: "East Timor",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "GW",
    name: "Guinea-Bissau",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "JO",
    name: "Jordan",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "LA",
    name: "Lao PDR",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "LS",
    name: "Lesotho",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "LY",
    name: "Libya",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "MW",
    name: "Malawi",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "PS",
    name: "Palestinian Territory",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "RW",
    name: "Rwanda",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "SL",
    name: "Sierra Leone",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "SO",
    name: "Somalia",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "TJ",
    name: "Tajikistan",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
  {
    code: "YE",
    name: "Yemen",
    reason: "firm_policy",
    notes: "Not offered at checkout.",
  },
];

/** Occupied Ukrainian territories — Ukraine itself stays eligible. */
export const STATIC_RESTRICTED_SUBDIVISIONS: RestrictedCountry[] = [
  { code: "UA-43", name: "Crimea", reason: "ofac" },
  { code: "UA-14", name: "Donetsk", reason: "ofac" },
  { code: "UA-09", name: "Luhansk", reason: "ofac" },
  { code: "UA-65", name: "Kherson", reason: "ofac" },
  { code: "UA-23", name: "Zaporizhzhia", reason: "ofac" },
];

const UA_SUBDIVISION_ALIASES: Record<string, string> = {
  "43": "43",
  CRIMEA: "43",
  KRYM: "43",
  "14": "14",
  DONETSK: "14",
  DONETSKA: "14",
  "09": "09",
  "9": "09",
  LUHANSK: "09",
  LUGANSK: "09",
  LUHANSKA: "09",
  "65": "65",
  KHERSON: "65",
  KHERSONSKA: "65",
  "23": "23",
  ZAPORIZHZHIA: "23",
  ZAPORIZHIA: "23",
  ZAPOROZHYE: "23",
  ZAPORIZKA: "23",
};

export function normalizeCountryCode(value: string) {
  return value.trim().toUpperCase();
}

export function parseRestrictedCode(code: string): {
  country: string;
  subdivision: string | null;
} {
  const normalized = normalizeCountryCode(code);
  const [country = "", subdivision = ""] = normalized.split("-");
  return {
    country,
    subdivision: subdivision || null,
  };
}

export function countryCodesFromRestricted(rows: RestrictedCountry[]) {
  return new Set(
    rows
      .map((row) => parseRestrictedCode(row.code))
      .filter((row) => !row.subdivision)
      .map((row) => row.country),
  );
}

export const STATIC_RESTRICTED_COUNTRY_CODES = countryCodesFromRestricted(
  STATIC_RESTRICTED_COUNTRIES,
);

function normalizeSubdivisionToken(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function matchesRestrictedSubdivision(
  country: string,
  subdivision: string,
  rows: RestrictedCountry[],
) {
  const token = normalizeSubdivisionToken(subdivision);
  if (!token) return false;

  const aliased =
    country === "UA" ? UA_SUBDIVISION_ALIASES[token] ?? token : token;

  return rows.some((row) => {
    const parsed = parseRestrictedCode(row.code);
    if (parsed.country !== country || !parsed.subdivision) return false;
    const rowToken = normalizeSubdivisionToken(parsed.subdivision);
    return (
      rowToken === token ||
      rowToken === aliased ||
      normalizeSubdivisionToken(row.name) === token
    );
  });
}

export function isRestrictedBillingRegion(
  country: string,
  subdivision = "",
  rows: RestrictedCountry[] = [
    ...STATIC_RESTRICTED_COUNTRIES,
    ...STATIC_RESTRICTED_SUBDIVISIONS,
  ],
) {
  const cc = normalizeCountryCode(country);
  if (!cc) return false;
  if (countryCodesFromRestricted(rows).has(cc)) return true;
  return matchesRestrictedSubdivision(cc, subdivision, rows);
}

/** "*" or a comma list such as US-*,CA-*,US-CA. Empty denies all (fail closed). */
export function isApprovedBillingRegion(
  address: { country: string; state?: string },
  allowedBillingRegions: string,
) {
  const configured = allowedBillingRegions.trim();
  if (!configured) return false;
  if (configured === "*") return true;

  const country = normalizeCountryCode(address.country);
  const subdivision = normalizeCountryCode(address.state ?? "");
  const candidates = new Set(
    configured
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  );

  return (
    candidates.has(country) ||
    candidates.has(`${country}-*`) ||
    (Boolean(subdivision) && candidates.has(`${country}-${subdivision}`))
  );
}

export function isBillingCountryInAllowlist(
  country: string,
  allowedBillingRegions: string,
) {
  const configured = allowedBillingRegions.trim();
  if (!configured) return false;
  if (configured === "*") return true;

  const cc = normalizeCountryCode(country);
  return configured
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .some((candidate) => candidate === cc || candidate.startsWith(`${cc}-`));
}
