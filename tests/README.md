# ODIN TypeScript SDK Tests

## Directory Structure

```
tests/
├── unit/                    # Unit tests organized by src/ module
│   ├── parser/              # Parser unit tests
│   │   ├── basic.test.ts
│   │   ├── comments.test.ts
│   │   ├── errors.test.ts
│   │   ├── headers.test.ts
│   │   ├── parser-edge-cases.test.ts
│   │   ├── streaming.test.ts
│   │   └── strings.test.ts
│   ├── serializer/          # Serializer unit tests
│   │   ├── canonicalize.test.ts
│   │   ├── roundtrip.test.ts
│   │   └── stringify-edge-cases.test.ts
│   ├── validator/           # Validator unit tests
│   │   ├── comprehensive-validation.test.ts
│   │   ├── schema-override.test.ts
│   │   ├── schema-parser.test.ts
│   │   ├── schema-parser-coverage.test.ts
│   │   └── validator-edge-cases.test.ts
│   ├── resolver/            # Import resolver unit tests
│   │   ├── import-resolver.test.ts
│   │   ├── imports.test.ts
│   │   └── schema-bundler.test.ts
│   ├── diff/                # Diff/patch unit tests
│   │   └── diff-patch.test.ts
│   └── types/               # Type system unit tests
│       ├── tabular.test.ts
│       ├── temporal.test.ts
│       └── types.test.ts
├── transform/               # Transform engine tests
│   ├── engine.test.ts       # Core engine tests
│   ├── verbs*.test.ts       # Verb operation tests
│   ├── formatters.test.ts   # Output formatter tests
│   └── ...
├── golden/                  # Cross-language contract tests
│   ├── parse.test.ts        # Parser golden tests
│   ├── json-import.test.ts  # JSON import golden tests
│   └── self-test.test.ts    # Framework self-tests
├── schema-api/              # Auto-generated schema API tests
│   ├── insurance.test.ts    # Insurance domain schemas
│   ├── healthcare.test.ts   # Healthcare domain schemas
│   └── ...                  # Other domain schemas
└── utils/                   # Test utilities (not tests)
    ├── generate-large-json.ts
    ├── json-roundtrip.ts
    ├── performance-test.ts
    └── profile-breakdown.ts
```

## Test Organization Principles

### 1. Unit Tests Mirror Source Structure
Tests in `unit/` folders map directly to `src/` modules:
- `src/parser/` → `tests/unit/parser/`
- `src/serializer/` → `tests/unit/serializer/`
- `src/validator/` → `tests/unit/validator/`
- `src/resolver/` → `tests/unit/resolver/`
- `src/diff/` → `tests/unit/diff/`
- `src/types/` → `tests/unit/types/`

### 2. Transform Tests Stay Together
Transform tests in `transform/` folder test the complete transform pipeline including:
- Engine execution
- Verb operations
- Output formatting
- Error handling

### 3. Golden Tests Are Contracts
Tests in `golden/` are cross-language contract tests. These must pass identically in all ODIN implementations (TypeScript, C#, Java, Python). Do not modify expected outputs without updating all implementations.

### 4. Schema API Tests Are Generated
Tests in `schema-api/` are auto-generated from ODIN schema files. Do not edit manually. Regenerate with:
```bash
npm run generate:schemas
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx vitest tests/unit/parser/basic.test.ts

# Run tests in a folder
npx vitest tests/unit/parser/

# Run tests matching pattern
npx vitest -t "parse string"

# Run golden tests only
npm run test:golden

# Run with coverage
npm test -- --coverage
```

## Writing New Tests

1. **Unit tests**: Add to the appropriate `unit/` subfolder
2. **Integration tests**: Add to `transform/` if testing the full pipeline
3. **Golden tests**: Update `../golden/` JSON files and run across all implementations
4. **Schema API tests**: Modify the generator in `src/scripts/generate-schema-api.ts`

## Import Paths

Tests in `unit/` subfolders use `../../../src/` to reach source files:
```typescript
import { Odin } from '../../../src/index.js';
```

Tests in `transform/` use `../../src/`:
```typescript
import { executeTransform } from '../../src/transform/index.js';
```
