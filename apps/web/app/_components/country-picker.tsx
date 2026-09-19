'use client';

import { ACCEPTED_COUNTRIES, POPULAR_COUNTRY_CODES, flagEmoji } from '@certa/server/countries';
import styles from './country-picker.module.css';

const byCode = new Map(ACCEPTED_COUNTRIES.map(country => [country.code, country] as const));
const popular = POPULAR_COUNTRY_CODES.flatMap(code => byCode.get(code) ?? []);
const popularCodes = new Set(popular.map(country => country.code));
const remaining = ACCEPTED_COUNTRIES.filter(country => !popularCodes.has(country.code));

/**
 * Country of residence. The platform select on every screen: it already knows how to
 * search a long list by keystroke and how to present itself on a phone.
 * The caller supplies the label by wrapping this control.
 */
export function CountryPicker({ value, onChange, disabled = false, placeholder = 'Select your country' }: { value: string; onChange: (code: string) => void; disabled?: boolean; placeholder?: string }) {
  const selected = byCode.get(value) ?? null;
  return <span className={styles.picker}>
    {selected && <span aria-hidden="true" className={styles.flag}>{flagEmoji(selected.code)}</span>}
    <select value={value} disabled={disabled} autoComplete="country" required data-filled={Boolean(selected)} onChange={event => onChange(event.target.value)}>
      <option value="" disabled>{placeholder}</option>
      <optgroup label="Popular accepted countries">{popular.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</optgroup>
      <optgroup label="Other accepted countries">{remaining.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</optgroup>
    </select>
  </span>;
}
