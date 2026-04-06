# @odin-foundation/core

[![npm](https://img.shields.io/npm/v/@odin-foundation/core)](https://www.npmjs.com/package/@odin-foundation/core) [![License](https://img.shields.io/npm/l/@odin-foundation/core)](https://github.com/odin-foundation/odin-core-typescript/blob/main/LICENSE)

Official TypeScript SDK for [ODIN](https://odin.foundation) (Open Data Interchange Notation) — a canonical data model for transporting meaning between systems, standards, and AI.

## Install

```bash
npm install @odin-foundation/core
```

## Quick Start

```typescript
import { Odin } from '@odin-foundation/core';

const doc = Odin.parse(`
{policy}
number = "PAP-2024-001"
effective = 2024-06-01
premium = #$747.50
active = ?true
`);

console.log(doc.get('policy.number')); // "PAP-2024-001"
console.log(doc.get('policy.premium')); // 747.50

const text = Odin.stringify(doc);
```

## Core API

| Method | Description | Example |
|--------|-------------|---------|
| `Odin.parse(text)` | Parse ODIN text into a document | `const doc = Odin.parse(src)` |
| `Odin.stringify(doc)` | Serialize document to ODIN text | `const text = Odin.stringify(doc)` |
| `Odin.canonicalize(doc)` | Deterministic bytes for hashing/signatures | `const bytes = Odin.canonicalize(doc)` |
| `Odin.validate(doc, schema)` | Validate against an ODIN schema | `const result = Odin.validate(doc, schema)` |
| `Odin.parseSchema(text)` | Parse a schema definition | `const schema = Odin.parseSchema(src)` |
| `Odin.diff(a, b)` | Structured diff between two documents | `const changes = Odin.diff(docA, docB)` |
| `Odin.patch(doc, diff)` | Apply a diff to a document | `const updated = Odin.patch(doc, changes)` |
| `Odin.parseTransform(text)` | Parse a transform specification | `const tx = Odin.parseTransform(src)` |
| `Odin.executeTransform(tx, source)` | Run a transform on data | `const out = Odin.executeTransform(tx, doc)` |
| `doc.toJSON()` | Export to JSON | `const json = doc.toJSON()` |
| `doc.toXML()` | Export to XML | `const xml = doc.toXML()` |
| `doc.toCSV()` | Export to CSV | `const csv = doc.toCSV()` |
| `Odin.stringify(doc)` | Export to ODIN | `const odin = Odin.stringify(doc)` |
| `Odin.builder()` | Fluent document builder | `Odin.builder().section('policy')...` |
| `Odin.parseForm(text)` | Parse a form definition | `const form = Odin.parseForm(src)` |
| `Odin.renderForm(form, data?)` | Render form to HTML/CSS | `const html = Odin.renderForm(form)` |

The SDK also exports `parseTransform`, `executeTransform`, `parseForm`, `renderForm`, type guards (`isOdinString`, `isOdinNumber`, etc.), and all ODIN types.

## Schema Validation

```typescript
import { Odin } from '@odin-foundation/core';

const schema = Odin.parseSchema(`
{policy}
!number : string
!effective : date
!premium : currency
active : boolean
`);

const doc = Odin.parse(source);
const result = Odin.validate(doc, schema);

if (!result.valid) {
  console.error(result.errors);
}
```

## Transforms

```typescript
import { Odin } from '@odin-foundation/core';

const transform = Odin.parseTransform(`
map policy -> record
  policy.number -> record.id
  policy.premium -> record.amount
`);

const result = Odin.executeTransform(transform, doc);
```

## Forms

```typescript
import { Odin } from '@odin-foundation/core';

const form = Odin.parseForm(`
{$}
odin = "1.0"
forms = "1.0"
title = "Application"
{$.page}
width = #8.5
height = #11
unit = "inch"
{page[0]}
{.field.name}
type = "text"
label = "Name"
x = #0.5
y = #1
w = #3
h = #0.3
bind = @applicant.name
required = ?true
`);

const html = Odin.renderForm(form);       // accessible HTML/CSS
const filled = Odin.renderForm(form, doc); // with data binding
```

## Export

```typescript
const odin = Odin.stringify(doc); // ODIN string
const json = doc.toJSON();       // JSON string
const xml = doc.toXML();         // XML string
const csv = doc.toCSV();         // CSV string
```

## Builder

```typescript
const doc = Odin.builder()
  .section('policy')
  .set('number', 'PAP-2024-001')
  .set('effective', new Date('2024-06-01'))
  .set('premium', { type: 'currency', value: 747.50 })
  .set('active', true)
  .build();
```

## Testing

Tests use [Vitest](https://vitest.dev/) and the shared golden test suite:

```bash
npm test
```

## Links

- [.Odin Foundation Website](https://odin.foundation)
- [GitHub](https://github.com/odin-foundation/odin)
- [Golden Test Suite](https://github.com/odin-foundation/odin/tree/main/sdk/golden)
- [License (Apache 2.0)](https://github.com/odin-foundation/odin/blob/main/LICENSE)
