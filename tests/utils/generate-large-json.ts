/**
 * Generate a large (~10MB) JSON file for performance testing
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function randomDate(): string {
  const start = new Date(2020, 0, 1);
  const end = new Date(2025, 11, 31);
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return date.toISOString();
}

function generateEnvelope(_index: number): object {
  const fileCount = 3 + Math.floor(Math.random() * 5); // 3-7 files
  const keyCount = 2 + Math.floor(Math.random() * 4); // 2-5 keys
  const auditCount = 1 + Math.floor(Math.random() * 3); // 1-3 audit entries

  const files = [];
  for (let i = 0; i < fileCount; i++) {
    files.push({
      fileId: `file_${randomString(20)}.enc`,
      encryptedFilename: randomString(32),
      filenameIV: randomString(16),
      filenameAuthTag: randomString(22),
      iv: randomString(16),
      authTag: randomString(22),
      mimetype: ['application/pdf', 'image/png', 'application/octet-stream', 'text/plain'][
        Math.floor(Math.random() * 4)
      ],
      size: Math.floor(Math.random() * 10000000),
      hash: randomString(64),
      hashAlgorithm: 'SHA-256',
      compressed: Math.random() > 0.3,
      compressionAlgorithm: 'gzip',
      originalSize: Math.floor(Math.random() * 15000000),
    });
  }

  const keys = [];
  for (let i = 0; i < keyCount; i++) {
    const key: Record<string, unknown> = {
      party: `party_${randomString(21)}`,
      encryptedKey: randomString(684),
      iv: randomString(16),
      fingerprint: randomString(64),
      permissions: Math.random() > 0.5 ? ['read'] : ['read', 'delegate'],
    };
    if (i > 0 && Math.random() > 0.7) {
      key.actingFor = [`party_${randomString(21)}`];
    }
    keys.push(key);
  }

  const audit = [];
  for (let i = 0; i < auditCount; i++) {
    audit.push({
      timestamp: randomDate(),
      party: `party_${randomString(21)}`,
      action: ['created', 'accessed', 'forwarded', 'revoked'][Math.floor(Math.random() * 4)],
      ipAddress: `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
      userAgent: `SDK-test/${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`,
      details: {
        fileCount: fileCount,
        totalSize: files.reduce((sum, f) => sum + (f.size as number), 0),
        uploadMethod: 'streaming',
        batchId: randomString(21),
      },
    });
  }

  return {
    _id: randomString(24),
    schemaVersion: '1.0.0',
    id: `capsa_${randomString(22)}`,
    createdAt: randomDate(),
    creator: `party_${randomString(21)}`,
    storageConfig: {
      provider: 'azure',
      baseUrl: 'https://testvault.blob.core.windows.net/test-vault/',
    },
    recipients: keys.map((k) => ({ party: k.party })),
    signature: {
      algorithm: 'RS256',
      protected: randomString(40),
      payload: randomString(200),
      signature: randomString(512),
    },
    keychain: {
      algorithm: 'AES-256-GCM',
      keys: keys,
    },
    envelope: {
      contentVersion: 1,
      files: files,
      totalSize: files.reduce((sum, f) => sum + (f.size as number), 0),
      updatedAt: randomDate(),
      encryptedStructured: randomString(150),
      structuredIV: randomString(16),
      structuredAuthTag: randomString(22),
      encryptedSubject: randomString(60),
      subjectIV: randomString(16),
      subjectAuthTag: randomString(22),
      encryptedBody: randomString(100),
      bodyIV: randomString(16),
      bodyAuthTag: randomString(22),
    },
    accessControl: {
      expiresAt: randomDate(),
    },
    deliveryPriority: ['normal', 'high', 'urgent'][Math.floor(Math.random() * 3)],
    audit: audit,
    lifecycle: {
      status: ['active', 'expired', 'soft_deleted'][Math.floor(Math.random() * 3)],
    },
    metadata: {
      notes: JSON.stringify({
        testRunId: `run_${randomString(16)}`,
        senderSdk: 'typescript',
        expectedFileCount: fileCount,
        generatedAt: new Date().toISOString(),
      }),
    },
  };
}

async function main() {
  console.log('Generating large JSON file...');

  const targetSize = 1024 * 1024; // 1MB
  const envelopes: object[] = [];
  let currentSize = 2; // Start with "[]"

  let count = 0;
  while (currentSize < targetSize) {
    const envelope = generateEnvelope(count);
    const envelopeJson = JSON.stringify(envelope);
    currentSize += envelopeJson.length + 1; // +1 for comma
    envelopes.push(envelope);
    count++;

    if (count % 100 === 0) {
      console.log(`  Generated ${count} envelopes, ~${(currentSize / 1024 / 1024).toFixed(2)}MB`);
    }
  }

  const outputPath = path.join(__dirname, '..', '..', 'large-test.json');
  const jsonContent = JSON.stringify(envelopes, null, 2);
  fs.writeFileSync(outputPath, jsonContent);

  console.log(`\nGenerated ${count} envelopes`);
  console.log(`Output file: ${outputPath}`);
  console.log(`File size: ${(jsonContent.length / 1024 / 1024).toFixed(2)}MB`);
}

main().catch(console.error);
