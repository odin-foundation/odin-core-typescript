/**
 * Shared format validators for ODIN schema validation.
 * @module
 */

import { isUnsafeRegexPattern } from './validate-redos.js';

/**
 * A format validator can be either a RegExp or a function returning boolean.
 */
export type FormatValidator = RegExp | ((value: string) => boolean);

/**
 * Luhn checksum validation for credit card numbers.
 */
function luhnCheck(value: string): boolean {
  // Must be 13-19 digits
  if (!/^\d{13,19}$/.test(value)) return false;
  let sum = 0;
  let alternate = false;
  for (let i = value.length - 1; i >= 0; i--) {
    let n = parseInt(value[i]!, 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/**
 * SSN validator: accepts XXX-XX-XXXX or XXXXXXXXX, rejects 000/666/9xx area codes.
 */
function ssnCheck(value: string): boolean {
  // Accept with or without dashes
  const match = value.match(/^(\d{3})-?(\d{2})-?(\d{4})$/);
  if (!match) return false;
  const area = match[1]!;
  const group = match[2]!;
  const serial = match[3]!;
  // Area code cannot be 000, 666, or 900-999
  if (area === '000' || area === '666' || area[0] === '9') return false;
  // Group number cannot be 00
  if (group === '00') return false;
  // Serial number cannot be 0000
  if (serial === '0000') return false;
  return true;
}

// Valid ISO 4217 currency codes (common subset)
const VALID_CURRENCY_CODES = new Set([
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL',
  'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CLP', 'CNY',
  'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP',
  'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD',
  'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HRK', 'HTG', 'HUF', 'IDR', 'ILS',
  'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR',
  'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD',
  'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU',
  'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK',
  'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG',
  'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK',
  'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL',
  'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH',
  'UGX', 'USD', 'UYU', 'UZS', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XCD',
  'XOF', 'XPF', 'YER', 'ZAR', 'ZMW', 'ZWL',
]);

// Valid US state and territory codes
const VALID_US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
]);

/**
 * Format validators for :format constraint.
 * All patterns are designed to be permissive while catching obvious errors.
 */
export const FORMAT_VALIDATORS: Record<string, FormatValidator> = {
  // Email: basic check for @ and domain
  email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,

  // URLs and URIs
  url: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
  uri: /^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s]*$/,

  // UUID v4
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  // Date/Time formats (ISO 8601)
  date: /^\d{4}-\d{2}-\d{2}$/,
  'date-iso': /^\d{4}-\d{2}-\d{2}$/,
  time: /^\d{2}:\d{2}:\d{2}$/,
  datetime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,

  // Network
  hostname:
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
  ipv4: /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
  ipv6: (value: string) => {
    // Full form: 8 groups of hex separated by colons
    if (/^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(value)) return true;
    // :: alone (unspecified address)
    if (value === '::') return true;
    // ::1 (loopback) and other compressed forms
    // Compressed IPv6: contains :: which replaces one or more groups of zeros
    if (value.includes('::')) {
      // Cannot have more than one ::
      if (value.indexOf('::') !== value.lastIndexOf('::')) return false;
      const parts = value.split('::');
      const left = parts[0] ? parts[0].split(':') : [];
      const right = parts[1] ? parts[1].split(':') : [];
      // Total groups must be <= 7 (since :: replaces at least 1 group)
      if (left.length + right.length > 7) return false;
      // Each part must be valid hex (1-4 chars)
      for (const p of [...left, ...right]) {
        if (p.length === 0 || p.length > 4 || !/^[0-9a-fA-F]+$/.test(p)) return false;
      }
      return true;
    }
    return false;
  },

  // Phone: International format - E.164 compatible plus common formats
  // Matches: +1-555-123-4567, +44 20 7946 0958, 555-123-4567, (555) 123-4567, +447911123456
  phone: /^[+]?[0-9]{1,4}?[-.\s]?[(]?[0-9]{1,4}[)]?[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,9}$/,

  // Credit card: 13-19 digits with Luhn checksum validation
  creditcard: luhnCheck,
  'credit-card': luhnCheck,

  // US identifiers
  ssn: ssnCheck,
  ein: /^\d{2}-\d{7}$/,
  fein: /^\d{2}-\d{7}$/,

  // Postal codes
  zip: /^\d{5}(-\d{4})?$/,
  'postal-ca': /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,

  // Vehicle identifiers
  vin: /^[A-HJ-NPR-Z0-9]{17}$/i,

  // Financial identifiers
  iban: /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/i,
  bic: /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/i,
  swift: /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/i, // Alias for BIC
  routing: /^\d{9}$/,
  cusip: /^[A-Z0-9]{9}$/i,
  isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/i,
  lei: /^[A-Z0-9]{20}$/i,

  // Insurance identifiers
  naic: /^\d{5}$/,

  // ISO codes
  'currency-code': (value: string) => VALID_CURRENCY_CODES.has(value.toUpperCase()),
  'country-alpha2': /^[A-Z]{2}$/,
  'country-alpha3': /^[A-Z]{3}$/,
  'state-us': (value: string) => VALID_US_STATES.has(value.toUpperCase()),

  // Healthcare identifiers
  npi: /^\d{10}$/,
  dea: /^[A-Z]{2}\d{7}$/i,

  // Telecom identifiers
  imei: /^\d{15}$/,
  iccid: /^\d{19,20}$/,

  // Canadian identifiers
  sin: /^\d{3}[ -]?\d{3}[ -]?\d{3}$/,

  // Binary/encoding formats
  hex: /^[0-9a-fA-F]+$/,
};

/**
 * Test a value against a format validator (RegExp or function).
 */
function testFormat(validator: FormatValidator, value: string): boolean {
  if (typeof validator === 'function') {
    return validator(value);
  }
  return validator.test(value);
}

/**
 * Validate built-in format validators at startup.
 * This ensures all built-in patterns are safe from ReDoS.
 */
function validateFormatValidatorsAtStartup(): void {
  const unsafeFormats: string[] = [];

  for (const [name, validator] of Object.entries(FORMAT_VALIDATORS)) {
    if (validator instanceof RegExp && isUnsafeRegexPattern(validator.source)) {
      unsafeFormats.push(name);
    }
  }

  if (unsafeFormats.length > 0) {
    console.warn(
      `[ODIN Security] The following format validators may be vulnerable to ReDoS: ${unsafeFormats.join(', ')}`
    );
  }
}

// Run validation at module load
validateFormatValidatorsAtStartup();

/**
 * Validates a string value against a format.
 * @param value - The string value to validate
 * @param format - The format name
 * @returns true if valid, false if invalid, undefined if format unknown
 */
export function validateFormat(value: string, format: string): boolean | undefined {
  const validator = FORMAT_VALIDATORS[format];
  if (!validator) {
    return undefined; // Unknown format
  }
  return testFormat(validator, value);
}
