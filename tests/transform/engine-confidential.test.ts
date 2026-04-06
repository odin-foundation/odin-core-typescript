import { describe, it, expect } from 'vitest';
import { parseTransform, executeTransform } from '../../src/transform/index.js';
import { extractValues } from './helpers.js';

describe('Confidential Field Enforcement', () => {
  // Helper to run a transform and extract JS values from CDM output
  function runTransform(transformOdin: string, input: unknown) {
    const transform = parseTransform(transformOdin);
    return executeTransform(transform, input);
  }

  // Helper to get extracted JS values from output
  function getOutputValues(result: ReturnType<typeof runTransform>) {
    return extractValues(result.output);
  }

  describe('No enforcement (enforceConfidential not set)', () => {
    it('should pass through confidential string unchanged', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{Customer}
Name = "@.name"
SSN = "@.ssn :confidential"
`;
      const result = runTransform(transformDoc, {
        name: 'John Doe',
        ssn: '123-45-6789',
      });

      expect(result.success).toBe(true);
      expect(getOutputValues(result)).toEqual({
        Customer: {
          Name: 'John Doe',
          SSN: '123-45-6789',
        },
      });
    });

    it('should pass through confidential number unchanged', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{Account}
AccountNumber = "@.accountNum :confidential"
Balance = "@.balance"
`;
      const result = runTransform(transformDoc, {
        accountNum: 12345678,
        balance: 1000.5,
      });

      expect(result.success).toBe(true);
      expect(getOutputValues(result)).toEqual({
        Account: {
          AccountNumber: 12345678,
          Balance: 1000.5,
        },
      });
    });
  });

  describe('Redact mode (enforceConfidential = "redact")', () => {
    it('should redact confidential string to null', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
enforceConfidential = "redact"

{Customer}
Name = "@.name"
SSN = "@.ssn :confidential"
`;
      const result = runTransform(transformDoc, {
        name: 'John Doe',
        ssn: '123-45-6789',
      });

      expect(result.success).toBe(true);
      expect(getOutputValues(result)).toEqual({
        Customer: {
          Name: 'John Doe',
          SSN: null,
        },
      });
    });

    it('should redact confidential number to null', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
enforceConfidential = "redact"

{Account}
AccountNumber = "@.accountNum :confidential"
Balance = "@.balance"
`;
      const result = runTransform(transformDoc, {
        accountNum: 12345678,
        balance: 1000.5,
      });

      expect(result.success).toBe(true);
      expect(getOutputValues(result)).toEqual({
        Account: {
          AccountNumber: null,
          Balance: 1000.5,
        },
      });
    });

    it('should redact confidential boolean to null', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
enforceConfidential = "redact"

{User}
Name = "@.name"
IsAdmin = "@.isAdmin :confidential"
`;
      const result = runTransform(transformDoc, {
        name: 'Admin User',
        isAdmin: true,
      });

      expect(result.success).toBe(true);
      expect(getOutputValues(result)).toEqual({
        User: {
          Name: 'Admin User',
          IsAdmin: null,
        },
      });
    });

    it('should not affect non-confidential fields', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
enforceConfidential = "redact"

{Customer}
Name = "@.name"
Email = "@.email"
Phone = "@.phone"
`;
      const result = runTransform(transformDoc, {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-1234',
      });

      expect(result.success).toBe(true);
      expect(getOutputValues(result)).toEqual({
        Customer: {
          Name: 'John Doe',
          Email: 'john@example.com',
          Phone: '555-1234',
        },
      });
    });
  });

  describe('Mask mode (enforceConfidential = "mask")', () => {
    it('should mask confidential string with asterisks', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
enforceConfidential = "mask"

{Customer}
Name = "@.name"
SSN = "@.ssn :confidential"
`;
      const result = runTransform(transformDoc, {
        name: 'John Doe',
        ssn: '123-45-6789',
      });

      expect(result.success).toBe(true);
      expect(getOutputValues(result)).toEqual({
        Customer: {
          Name: 'John Doe',
          SSN: '***********', // 11 asterisks for 11 characters
        },
      });
    });

    it('should mask confidential number to null (not asterisks)', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
enforceConfidential = "mask"

{Account}
AccountNumber = "@.accountNum :confidential"
Balance = "@.balance"
`;
      const result = runTransform(transformDoc, {
        accountNum: 12345678,
        balance: 1000.5,
      });

      expect(result.success).toBe(true);
      expect(getOutputValues(result)).toEqual({
        Account: {
          AccountNumber: null, // Numbers become null, not masked
          Balance: 1000.5,
        },
      });
    });

    it('should mask confidential boolean to null', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
enforceConfidential = "mask"

{User}
Name = "@.name"
IsAdmin = "@.isAdmin :confidential"
`;
      const result = runTransform(transformDoc, {
        name: 'Admin User',
        isAdmin: true,
      });

      expect(result.success).toBe(true);
      expect(getOutputValues(result)).toEqual({
        User: {
          Name: 'Admin User',
          IsAdmin: null,
        },
      });
    });

    it('should mask empty string to empty string', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
enforceConfidential = "mask"

{Customer}
Secret = "@.secret :confidential"
`;
      const result = runTransform(transformDoc, {
        secret: '',
      });

      expect(result.success).toBe(true);
      expect(getOutputValues(result)).toEqual({
        Customer: {
          Secret: '', // Empty string stays empty
        },
      });
    });

    it('should handle unicode strings by character count', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
enforceConfidential = "mask"

{Customer}
Name = "@.name :confidential"
`;
      const result = runTransform(transformDoc, {
        name: '日本語', // 3 characters
      });

      expect(result.success).toBe(true);
      expect(getOutputValues(result)).toEqual({
        Customer: {
          Name: '***', // 3 asterisks for 3 characters
        },
      });
    });
  });

  describe('Mixed confidential and non-confidential fields', () => {
    it('should handle mixed fields in same segment', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
enforceConfidential = "mask"

{Customer}
Name = "@.name"
SSN = "@.ssn :confidential"
Email = "@.email"
TaxId = "@.taxId :confidential"
Phone = "@.phone"
`;
      const result = runTransform(transformDoc, {
        name: 'John Doe',
        ssn: '123-45-6789',
        email: 'john@example.com',
        taxId: '98-7654321',
        phone: '555-1234',
      });

      expect(result.success).toBe(true);
      expect(getOutputValues(result)).toEqual({
        Customer: {
          Name: 'John Doe',
          SSN: '***********',
          Email: 'john@example.com',
          TaxId: '**********',
          Phone: '555-1234',
        },
      });
    });
  });

  describe('Parser correctly identifies confidential fields', () => {
    it('should parse :confidential modifier and set confidential flag', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{Customer}
Name = "@.name"
SSN = "@.ssn :confidential"
`;
      const parsed = parseTransform(transformDoc);

      const customerSegment = parsed.segments.find((s) => s.path === 'Customer');
      expect(customerSegment).toBeDefined();

      const nameMapping = customerSegment!.mappings.find((m) => m.target === 'Name');
      const ssnMapping = customerSegment!.mappings.find((m) => m.target === 'SSN');

      expect(nameMapping?.confidential).toBeUndefined();
      expect(ssnMapping?.confidential).toBe(true);
    });

    it('should parse enforceConfidential directive', () => {
      const transformRedact = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
enforceConfidential = "redact"

{Test}
Value = "@.value"
`;
      const transformMask = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
enforceConfidential = "mask"

{Test}
Value = "@.value"
`;
      const transformNone = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"

{Test}
Value = "@.value"
`;

      const parsedRedact = parseTransform(transformRedact);
      const parsedMask = parseTransform(transformMask);
      const parsedNone = parseTransform(transformNone);

      expect(parsedRedact.enforceConfidential).toBe('redact');
      expect(parsedMask.enforceConfidential).toBe('mask');
      expect(parsedNone.enforceConfidential).toBeUndefined();
    });

    it('should ignore invalid enforceConfidential values', () => {
      const transformDoc = `
{$}
odin = "1.0.0"
transform = "1.0.0"
direction = "json->json"
enforceConfidential = "invalid"

{Test}
Value = "@.value"
`;
      const parsed = parseTransform(transformDoc);

      expect(parsed.enforceConfidential).toBeUndefined();
    });
  });
});
