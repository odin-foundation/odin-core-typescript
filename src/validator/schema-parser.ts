/**
 * ODIN Schema Parser
 *
 * Parses schema definitions into OdinSchema objects.
 * Handles type definitions, field constraints, conditionals, and validation rules.
 */

import { tokenize } from '../parser/tokenizer.js';
import type { Token } from '../parser/tokens.js';
import { TokenType } from '../parser/tokens.js';
import { ParseError } from '../types/errors.js';
import type { ParseOptions } from '../types/options.js';
import type { OdinValue } from '../types/values.js';
import type {
  OdinSchema,
  SchemaMetadata,
  SchemaType,
  SchemaField,
  SchemaFieldType,
  SchemaArray,
  SchemaObjectConstraint,
  SchemaInvariant,
  SchemaCardinality,
  SchemaImport,
} from '../types/schema.js';
import { SchemaTokenReader } from './schema-token-reader.js';
import type { SchemaParserState, SchemaHeaderType } from './schema-parser-context.js';
import { createInitialState } from './schema-parser-context.js';
import { parseImportDirective } from './schema-import-parser.js';
import {
  parseConstraints as parseConstraintsImpl,
  parseConditionals as parseConditionalsImpl,
  parseEnumValues as parseEnumValuesImpl,
  parseFieldDirectives as parseFieldDirectivesImpl,
} from './schema-constraint-parser.js';
import {
  parseSchemaHeader as parseSchemaHeaderImpl,
  parseArrayConstraints as parseArrayConstraintsImpl,
} from './schema-header-parser.js';
import type { FieldAccumulator } from './schema-parser-types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Schema Parser Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ODIN Schema Parser.
 *
 * Parses ODIN schema text into an OdinSchema object containing type definitions,
 * field specifications, array schemas, and object-level constraints.
 */
class SchemaParser {
  private readonly reader: SchemaTokenReader = new SchemaTokenReader();
  private state: SchemaParserState;

  // Result accumulation
  private metadata: SchemaMetadata = {};
  private imports: SchemaImport[] = [];
  private types: Map<string, SchemaType> = new Map();
  private fields: Map<string, SchemaField> = new Map();
  private arrays: Map<string, SchemaArray> = new Map();
  private constraints: Map<string, SchemaObjectConstraint[]> = new Map();

  // Current type being built (for {@typename} headers)
  private currentTypeFields: Map<string, SchemaField> = new Map();
  private currentTypeName: string = '';

  // Current array being built
  private currentArrayFields: Map<string, SchemaField> = new Map();
  private currentArrayPath: string = '';
  private currentArrayColumns: string[] | undefined;

  constructor() {
    this.state = createInitialState();
  }

  /**
   * Parse schema text into OdinSchema.
   */
  parse(source: string): OdinSchema {
    // Initialize token reader with tokenized source (lenient mode for regex patterns in :pattern)
    this.reader.init(tokenize(source, { lenient: true }), source);
    this.state = createInitialState();

    // Reset accumulators
    this.metadata = {};
    this.imports = [];
    this.types = new Map();
    this.fields = new Map();
    this.arrays = new Map();
    this.constraints = new Map();
    this.currentTypeFields = new Map();
    this.currentTypeName = '';
    this.currentArrayFields = new Map();
    this.currentArrayPath = '';
    this.currentArrayColumns = undefined;

    while (!this.isAtEnd()) {
      const token = this.peek();
      const tokenType = token.type;

      // Skip newlines and comments
      if (tokenType === TokenType.NEWLINE || tokenType === TokenType.COMMENT) {
        this.advance();
        continue;
      }

      // EOF
      if (tokenType === TokenType.EOF) {
        break;
      }

      // Import directive: @import path as alias
      if (tokenType === TokenType.DIRECTIVE_IMPORT) {
        const imp = parseImportDirective(this.reader);
        if (imp) {
          this.imports.push(imp);
        }
        continue;
      }

      // Header
      if (tokenType === TokenType.HEADER_OPEN) {
        this.finalizeCurrentContext();
        this.parseSchemaHeader();
        continue;
      }

      // Object constraint (starts with :)
      if (tokenType === TokenType.COLON) {
        this.parseObjectConstraint();
        continue;
      }

      // Top-level type definition: @TypeName or @&namespace.TypeName
      if (tokenType === TokenType.PREFIX_REFERENCE) {
        this.finalizeCurrentContext();
        this.parseTopLevelTypeDefinition();
        continue;
      }

      // Field definition or type composition
      if (tokenType === TokenType.IDENTIFIER || tokenType === TokenType.EQUALS) {
        this.parseFieldDefinition();
        continue;
      }

      // Skip unknown tokens
      this.advance();
    }

    // Finalize any pending context
    this.finalizeCurrentContext();

    return {
      metadata: this.metadata,
      imports: this.imports,
      types: this.types,
      fields: this.fields,
      arrays: this.arrays,
      constraints: this.constraints,
    };
  }

  /**
   * Finalize current type or array definition before switching context.
   */
  private finalizeCurrentContext(): void {
    // Finalize type definition
    if (this.currentTypeName && this.currentTypeFields.size > 0) {
      const typeDef: SchemaType = {
        name: this.currentTypeName,
        fields: this.currentTypeFields,
      };
      this.types.set(this.currentTypeName, typeDef);
      this.currentTypeFields = new Map();
      this.currentTypeName = '';
    }

    // Finalize array definition
    if (this.currentArrayPath) {
      const arraySchema: SchemaArray = {
        path: this.currentArrayPath,
        unique: this.pendingArrayUnique,
        itemFields: this.currentArrayFields,
      };
      if (this.currentArrayColumns !== undefined) {
        arraySchema.columns = this.currentArrayColumns;
      }
      if (this.pendingArrayMinItems !== undefined) {
        arraySchema.minItems = this.pendingArrayMinItems;
      }
      if (this.pendingArrayMaxItems !== undefined) {
        arraySchema.maxItems = this.pendingArrayMaxItems;
      }
      this.arrays.set(this.currentArrayPath, arraySchema);
      this.currentArrayFields = new Map();
      this.currentArrayPath = '';
      this.currentArrayColumns = undefined;
      // Reset pending array constraints
      this.pendingArrayMinItems = undefined;
      this.pendingArrayMaxItems = undefined;
      this.pendingArrayUnique = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Header Parsing
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Parse a schema header and apply results to parser state.
   */
  private parseSchemaHeader(): void {
    const result = parseSchemaHeaderImpl(this.reader, this.state.definedTypes);

    // Apply header result to state
    this.state.currentHeader = result.header;
    this.state.currentPath = result.path;

    // Handle type definition specific state
    if (result.typeName !== undefined) {
      this.state.definedTypes.add(result.typeName);
      this.currentTypeName = result.typeName;

      // For continuation blocks, preserve existing fields from the type
      if (result.isContinuation && this.types.has(result.typeName)) {
        const existingType = this.types.get(result.typeName)!;
        this.currentTypeFields = new Map(existingType.fields);
      } else {
        this.currentTypeFields = new Map();
      }
    }

    // Handle array header specific state
    if (result.header?.kind === 'array') {
      this.currentArrayPath = result.path;
      this.currentArrayFields = new Map();
      this.currentArrayColumns = result.columns;

      // Check for array constraints on next line
      this.skipNewlines();
      if (this.peek().type === TokenType.COLON) {
        const constraints = parseArrayConstraintsImpl(this.reader);
        if (constraints.minItems !== undefined) {
          this.pendingArrayMinItems = constraints.minItems;
        }
        if (constraints.maxItems !== undefined) {
          this.pendingArrayMaxItems = constraints.maxItems;
        }
        if (constraints.unique) {
          this.pendingArrayUnique = true;
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Top-Level Type Definition Parsing
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Parse a top-level type definition starting with @TypeName.
   * Syntax:
   *   @TypeName              — simple type definition
   *   @&namespace.TypeName   — namespaced type definition
   *   @TypeName : @Parent    — type with single inheritance
   *   @TypeName : @A & @B    — type with multiple inheritance (intersection)
   */
  private parseTopLevelTypeDefinition(): void {
    this.advance(); // consume @

    let namespace: string | undefined;
    let name = '';

    // Check for namespace prefix (&)
    if (this.peek().type === TokenType.PREFIX_EXTENSION) {
      this.advance();
      const parts: string[] = [];
      while (this.peek().type === TokenType.IDENTIFIER || this.peek().type === TokenType.DOT) {
        if (this.peek().type === TokenType.DOT) {
          this.advance();
        } else {
          parts.push(this.getTokenVal(this.peek()));
          this.advance();
        }
      }
      if (parts.length > 1) {
        name = parts.pop()!;
        namespace = parts.join('.');
      } else {
        name = parts[0] ?? '';
      }
    } else {
      // Simple type name
      const parts: string[] = [];
      while (this.peek().type === TokenType.IDENTIFIER || this.peek().type === TokenType.DOT) {
        if (this.peek().type === TokenType.DOT) {
          this.advance();
        } else {
          parts.push(this.getTokenVal(this.peek()));
          this.advance();
        }
      }
      name = parts.join('.');
    }

    this.skipWhitespace();

    // Check for inheritance syntax: : @ParentType [& @AnotherType]
    let extendsTypes: string[] | undefined;
    if (this.peek().type === TokenType.COLON) {
      this.advance(); // consume :
      this.skipWhitespace();
      extendsTypes = [];

      while (!this.isAtEnd()) {
        if (this.peek().type === TokenType.PREFIX_REFERENCE) {
          this.advance(); // consume @
          if (this.peek().type === TokenType.IDENTIFIER) {
            let parentName = this.getTokenVal(this.peek());
            this.advance();
            // Handle dotted names
            while (this.peek().type === TokenType.DOT) {
              this.advance();
              if (this.peek().type === TokenType.IDENTIFIER) {
                parentName += '.' + this.getTokenVal(this.peek());
                this.advance();
              } else {
                break;
              }
            }
            extendsTypes.push(parentName);
          }
        } else if (this.getTokenVal(this.peek()) === '&') {
          this.advance(); // consume &
          this.skipWhitespace();
        } else if (this.peek().type === TokenType.WHITESPACE) {
          this.advance();
        } else {
          break;
        }
      }
    }

    this.consumeToNewline();

    // Set up type definition context
    this.state.definedTypes.add(name);
    this.currentTypeName = name;
    this.currentTypeFields = new Map();

    // Set the header context so subsequent fields are treated as type fields
    const header: SchemaHeaderType = { kind: 'typeDefinition', name };
    if (namespace !== undefined) {
      header.namespace = namespace;
    }
    this.state.currentHeader = header;
    this.state.currentPath = '';

    // Store inheritance info in the type definition
    if (extendsTypes && extendsTypes.length > 0) {
      // Store extends info as a special composition field
      const extendsField: SchemaField = {
        path: '_extends',
        type: { kind: 'typeRef', name: extendsTypes.map(t => '@' + t).join('&') },
        required: false,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      };
      this.currentTypeFields.set('_extends', extendsField);
    }
  }

  // Pending array constraint values
  private pendingArrayMinItems: number | undefined;
  private pendingArrayMaxItems: number | undefined;
  private pendingArrayUnique: boolean = false;

  // ─────────────────────────────────────────────────────────────────────────────
  // Field Definition Parsing
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Parse a field definition.
   */
  private parseFieldDefinition(): void {
    const startToken = this.peek();

    // Check for type composition: = @type1 & @type2
    if (startToken.type === TokenType.EQUALS) {
      this.parseTypeComposition();
      return;
    }

    // Parse field path (left side of =)
    const fieldPath = this.parseFieldPath();

    this.expect(TokenType.EQUALS, 'Expected =');
    this.skipWhitespace();

    // Parse field specification (right side of =)
    const fieldSpec = this.parseFieldSpec(fieldPath);

    // Store field in appropriate location
    const header = this.state.currentHeader;

    if (header?.kind === 'metadata') {
      // Metadata fields
      const key = fieldPath;
      const value = fieldSpec.defaultValue;
      if (value && 'value' in value) {
        (this.metadata as Record<string, unknown>)[key] = value.value;
      }
    } else if (header?.kind === 'derivation') {
      // Derivation metadata - skip for now
    } else if (header?.kind === 'typeDefinition') {
      // Type definition field
      this.currentTypeFields.set(fieldPath, fieldSpec);
    } else if (header?.kind === 'array') {
      // Array item field
      this.currentArrayFields.set(fieldPath, fieldSpec);
    } else {
      // Regular field
      const fullPath = this.state.currentPath
        ? `${this.state.currentPath}.${fieldPath}`
        : fieldPath;
      // Check if field already exists - merge conditionals (OR semantics)
      const existingField = this.fields.get(fullPath);
      if (existingField && fieldSpec.conditionals.length > 0) {
        // Merge conditionals from new definition into existing
        existingField.conditionals.push(...fieldSpec.conditionals);
      } else {
        this.fields.set(fullPath, { ...fieldSpec, path: fullPath });
      }
    }

    this.consumeToNewline();
  }

  /**
   * Parse field path (left side of =).
   */
  private parseFieldPath(): string {
    const parts: string[] = [];

    while (!this.isAtEnd() && this.peek().type !== TokenType.EQUALS) {
      const token = this.peek();

      if (token.type === TokenType.IDENTIFIER) {
        parts.push(this.getTokenVal(token));
        this.advance();
      } else if (token.type === TokenType.DOT) {
        this.advance();
      } else if (token.type === TokenType.ARRAY_INDEX) {
        if (parts.length > 0) {
          parts[parts.length - 1] += this.getTokenVal(token);
        }
        this.advance();
      } else if (token.type === TokenType.WHITESPACE) {
        this.advance();
      } else {
        break;
      }
    }

    return parts.join('.');
  }

  /**
   * Parse field specification (right side of =).
   */
  private parseFieldSpec(path: string): SchemaField {
    // Initialize field with defaults
    const field: SchemaField = {
      path,
      type: { kind: 'string' },
      required: false,
      nullable: false,
      redacted: false,
      deprecated: false,
      computed: false,
      immutable: false,
      constraints: [],
      conditionals: [],
    };

    // Parse modifiers: ! ~ * -
    this.parseSchemaModifiers(field);

    // Parse type specification
    this.parseTypeSpec(field);

    // Parse constraints (returns pending conditional if found in same token)
    const pendingConditional = this.parseConstraints(field);

    // Parse conditionals (:if, :unless)
    this.parseConditionals(field, pendingConditional);

    // Parse field directives (:computed, :immutable, :format)
    this.parseFieldDirectives(field);

    // Parse default value
    this.parseDefaultValue(field);

    return field;
  }

  /**
   * Parse schema modifiers: ! (required), ~ (nullable), * (redacted), - (deprecated)
   */
  private parseSchemaModifiers(field: SchemaField): void {
    while (!this.isAtEnd()) {
      const token = this.peek();

      if (token.type === TokenType.MODIFIER_CRITICAL) {
        field.required = true;
        this.advance();
      } else if (token.type === TokenType.PREFIX_NULL) {
        field.nullable = true;
        this.advance();
      } else if (token.type === TokenType.MODIFIER_REDACTED) {
        field.redacted = true;
        this.advance();
      } else if (token.type === TokenType.MODIFIER_DEPRECATED) {
        field.deprecated = true;
        this.advance();
      } else {
        break;
      }
    }
  }

  /**
   * Parse type specification.
   */
  private parseTypeSpec(field: SchemaField): void {
    const token = this.peek();

    // Boolean: ?
    if (token.type === TokenType.PREFIX_BOOLEAN) {
      this.advance();
      field.type = { kind: 'boolean' };
      this.checkForUnion(field);
      return;
    }

    // Integer: ##
    if (token.type === TokenType.PREFIX_INTEGER) {
      this.advance();
      field.type = { kind: 'integer' };
      this.checkForUnion(field);
      return;
    }

    // Currency: #$
    if (token.type === TokenType.PREFIX_CURRENCY) {
      this.advance();
      // Check for decimal places #$.N
      if (this.peek().type === TokenType.DOT) {
        this.advance();
        if (this.peek().type === TokenType.NUMBER) {
          const places = parseInt(this.getTokenVal(this.peek()), 10);
          this.advance();
          field.type = { kind: 'currency', places };
        } else {
          field.type = { kind: 'currency', places: 2 };
        }
      } else {
        field.type = { kind: 'currency', places: 2 };
      }
      this.checkForUnion(field);
      return;
    }

    // Number: # or #.N
    if (token.type === TokenType.PREFIX_NUMBER) {
      this.advance();
      // Check for decimal places #.N
      if (this.peek().type === TokenType.DOT) {
        this.advance();
        if (this.peek().type === TokenType.NUMBER) {
          const places = parseInt(this.getTokenVal(this.peek()), 10);
          this.advance();
          field.type = { kind: 'decimal', places };
        } else {
          field.type = { kind: 'number' };
        }
      } else {
        field.type = { kind: 'number' };
      }
      this.checkForUnion(field);
      return;
    }

    // Reference: @
    if (token.type === TokenType.PREFIX_REFERENCE) {
      this.advance();
      // Check for reference with target path @path or @namespace.path
      if (this.peek().type === TokenType.IDENTIFIER) {
        let targetPath = this.getTokenVal(this.peek());
        this.advance();
        // Handle namespaced references like @types.address
        while (this.peek().type === TokenType.DOT) {
          this.advance(); // consume the dot
          if (this.peek().type === TokenType.IDENTIFIER) {
            targetPath += '.' + this.getTokenVal(this.peek());
            this.advance();
          } else {
            break;
          }
        }
        field.type = { kind: 'reference', targetPath };
      } else {
        field.type = { kind: 'reference' };
      }
      this.checkForUnion(field);
      return;
    }

    // Binary: ^
    if (token.type === TokenType.PREFIX_BINARY) {
      this.advance();
      // Check for algorithm ^sha256
      if (this.peek().type === TokenType.IDENTIFIER) {
        const algorithm = this.getTokenVal(this.peek());
        this.advance();
        field.type = { kind: 'binary', algorithm };
      } else {
        field.type = { kind: 'binary' };
      }
      return;
    }

    // Temporal types
    if (token.type === TokenType.IDENTIFIER) {
      const val = this.getTokenVal(token);

      if (val === 'date') {
        this.advance();
        field.type = { kind: 'date' };
        this.checkForUnion(field);
        return;
      }
      if (val === 'timestamp') {
        this.advance();
        field.type = { kind: 'timestamp' };
        this.checkForUnion(field);
        return;
      }
      if (val === 'time') {
        this.advance();
        field.type = { kind: 'time' };
        this.checkForUnion(field);
        return;
      }
      if (val === 'duration') {
        this.advance();
        field.type = { kind: 'duration' };
        this.checkForUnion(field);
        return;
      }
    }

    // Enum: (value1, value2, ...)
    const tokenVal = this.getTokenVal(token);
    if (tokenVal.startsWith('(')) {
      const enumValues = this.parseEnumValues();
      if (enumValues.length > 0) {
        field.type = { kind: 'enum', values: enumValues };
        return;
      }
    }

    // Default: string type (no prefix)
    field.type = { kind: 'string' };
    this.checkForUnion(field);
  }

  /**
   * Check for union type syntax (trailing |).
   * Union syntax: #| (number or string), #|? (number or boolean), #|~ (number or null)
   * The | may be its own token or part of a STRING_BARE like "|?" or "|~"
   */
  private checkForUnion(field: SchemaField): void {
    const tokenVal = this.getTokenVal(this.peek());

    // Check if token starts with | (could be "|", "|?", "|~", etc.)
    if (tokenVal.startsWith('|')) {
      this.advance();
      const currentType = field.type;
      const unionTypes: SchemaFieldType[] = [currentType];

      // If the token was just "|", look at next token
      if (tokenVal === '|') {
        const nextToken = this.peek();

        // Check for null (~)
        if (nextToken.type === TokenType.PREFIX_NULL) {
          this.advance();
          unionTypes.push({ kind: 'null' });
          field.type = { kind: 'union', types: unionTypes };
          this.checkForUnion(field); // Check for more union members
          return;
        }

        // Check for boolean (?)
        if (nextToken.type === TokenType.PREFIX_BOOLEAN) {
          this.advance();
          unionTypes.push({ kind: 'boolean' });
          field.type = { kind: 'union', types: unionTypes };
          this.checkForUnion(field);
          return;
        }

        // Check for number (#)
        if (nextToken.type === TokenType.PREFIX_NUMBER) {
          this.advance();
          unionTypes.push({ kind: 'number' });
          field.type = { kind: 'union', types: unionTypes };
          this.checkForUnion(field);
          return;
        }

        // Check for integer (##)
        if (nextToken.type === TokenType.PREFIX_INTEGER) {
          this.advance();
          unionTypes.push({ kind: 'integer' });
          field.type = { kind: 'union', types: unionTypes };
          this.checkForUnion(field);
          return;
        }

        // Check for quoted string ("" means string type in union)
        if (nextToken.type === TokenType.STRING_QUOTED) {
          this.advance();
          unionTypes.push({ kind: 'string' });
          field.type = { kind: 'union', types: unionTypes };
          this.checkForUnion(field);
          return;
        }

        // End of line or no more union members - don't add implicit string
        field.type = { kind: 'union', types: unionTypes };
        return;
      }

      // Token contains more than just "|" (e.g., "|?", "|~", "|""", "|?|", etc.)
      // Parse the rest character by character to handle multi-type unions
      let rest = tokenVal.substring(1);
      let expectMoreTypes = false;

      while (rest.length > 0) {
        // Check for null (~)
        if (rest.startsWith('~')) {
          unionTypes.push({ kind: 'null' });
          rest = rest.substring(1);
          // Check for | indicating more types
          if (rest.startsWith('|')) {
            rest = rest.substring(1);
            expectMoreTypes = rest.length === 0; // trailing | means more types in next token
          }
          continue;
        }

        // Check for boolean (?)
        if (rest.startsWith('?')) {
          unionTypes.push({ kind: 'boolean' });
          rest = rest.substring(1);
          if (rest.startsWith('|')) {
            rest = rest.substring(1);
            expectMoreTypes = rest.length === 0;
          }
          continue;
        }

        // Check for integer (##) - must check before number (#)
        if (rest.startsWith('##')) {
          unionTypes.push({ kind: 'integer' });
          rest = rest.substring(2);
          if (rest.startsWith('|')) {
            rest = rest.substring(1);
            expectMoreTypes = rest.length === 0;
          }
          continue;
        }

        // Check for number (#)
        if (rest.startsWith('#')) {
          unionTypes.push({ kind: 'number' });
          rest = rest.substring(1);
          if (rest.startsWith('|')) {
            rest = rest.substring(1);
            expectMoreTypes = rest.length === 0;
          }
          continue;
        }

        // Check for quoted string ("" or '')
        if (rest.startsWith('""') || rest.startsWith("''")) {
          unionTypes.push({ kind: 'string' });
          rest = rest.substring(2);
          if (rest.startsWith('|')) {
            rest = rest.substring(1);
            expectMoreTypes = rest.length === 0;
          }
          continue;
        }

        // Unknown character - stop parsing
        break;
      }

      field.type = { kind: 'union', types: unionTypes };

      // If the compound token ended with |, check next token for more types
      if (expectMoreTypes) {
        const nextToken = this.peek();
        // Check for quoted string
        if (nextToken.type === TokenType.STRING_QUOTED) {
          this.advance();
          if (field.type.kind === 'union') {
            field.type.types.push({ kind: 'string' });
          }
        }
        // Check for type prefixes
        else if (nextToken.type === TokenType.PREFIX_NULL) {
          this.advance();
          if (field.type.kind === 'union') {
            field.type.types.push({ kind: 'null' });
          }
        } else if (nextToken.type === TokenType.PREFIX_BOOLEAN) {
          this.advance();
          if (field.type.kind === 'union') {
            field.type.types.push({ kind: 'boolean' });
          }
        } else if (nextToken.type === TokenType.PREFIX_INTEGER) {
          this.advance();
          if (field.type.kind === 'union') {
            field.type.types.push({ kind: 'integer' });
          }
        } else if (nextToken.type === TokenType.PREFIX_NUMBER) {
          this.advance();
          if (field.type.kind === 'union') {
            field.type.types.push({ kind: 'number' });
          }
        }
      }

      this.checkForUnion(field); // Check for more union members in next token
    }
  }

  /**
   * Parse enum values: (value1, value2, value3)
   */
  private parseEnumValues(): string[] {
    return parseEnumValuesImpl(this.reader);
  }

  /**
   * Parse constraints: :(bounds), :/pattern/, :unique
   * Returns any pending conditional string found in bounds parsing.
   */
  private parseConstraints(field: SchemaField): string | undefined {
    return parseConstraintsImpl(this.reader, field as FieldAccumulator);
  }

  /**
   * Parse conditional fields: :if field op value
   */
  private parseConditionals(field: SchemaField, pendingConditional?: string): void {
    parseConditionalsImpl(this.reader, field as FieldAccumulator, pendingConditional);
  }

  /**
   * Parse field directives: :computed, :immutable, :format
   */
  private parseFieldDirectives(field: SchemaField): void {
    parseFieldDirectivesImpl(this.reader, field as FieldAccumulator);
  }

  /**
   * Parse default value.
   */
  private parseDefaultValue(field: SchemaField): void {
    this.skipWhitespace();

    const token = this.peek();
    const tokenType = token.type;

    // Skip if it's at end of line or not a value token
    if (
      tokenType === TokenType.NEWLINE ||
      tokenType === TokenType.COMMENT ||
      tokenType === TokenType.EOF ||
      tokenType === TokenType.COLON
    ) {
      return;
    }

    // Check for typed default values
    if (
      tokenType === TokenType.PREFIX_NUMBER ||
      tokenType === TokenType.PREFIX_INTEGER ||
      tokenType === TokenType.PREFIX_CURRENCY ||
      tokenType === TokenType.PREFIX_BOOLEAN ||
      tokenType === TokenType.STRING_QUOTED ||
      tokenType === TokenType.IDENTIFIER ||
      tokenType === TokenType.NUMBER ||
      tokenType === TokenType.BOOLEAN ||
      tokenType === TokenType.DATE
    ) {
      const defaultVal = this.parseDefaultValueToken();
      if (defaultVal) {
        field.defaultValue = defaultVal;
      }
    }
  }

  /**
   * Parse default value token.
   */
  private parseDefaultValueToken(): OdinValue | undefined {
    const token = this.peek();

    if (token.type === TokenType.PREFIX_INTEGER) {
      this.advance();
      if (this.peek().type === TokenType.NUMBER) {
        const val = parseInt(this.getTokenVal(this.peek()), 10);
        this.advance();
        return { type: 'integer', value: val };
      }
    }

    if (token.type === TokenType.PREFIX_NUMBER) {
      this.advance();
      if (this.peek().type === TokenType.NUMBER) {
        const val = parseFloat(this.getTokenVal(this.peek()));
        this.advance();
        return { type: 'number', value: val };
      }
    }

    if (token.type === TokenType.PREFIX_CURRENCY) {
      this.advance();
      if (this.peek().type === TokenType.NUMBER) {
        const val = parseFloat(this.getTokenVal(this.peek()));
        this.advance();
        return { type: 'currency', value: val, decimalPlaces: 2 };
      }
    }

    if (token.type === TokenType.PREFIX_BOOLEAN) {
      this.advance();
      if (this.peek().type === TokenType.BOOLEAN) {
        const val = this.getTokenVal(this.peek()) === 'true';
        this.advance();
        return { type: 'boolean', value: val };
      }
    }

    if (token.type === TokenType.BOOLEAN) {
      const val = this.getTokenVal(token) === 'true';
      this.advance();
      return { type: 'boolean', value: val };
    }

    if (token.type === TokenType.STRING_QUOTED) {
      const val = this.getTokenVal(token);
      this.advance();
      return { type: 'string', value: val };
    }

    if (token.type === TokenType.IDENTIFIER) {
      const val = this.getTokenVal(token);
      // Only treat as default if at end of meaningful content
      const nextType = this.peekAhead(1).type;
      if (
        nextType === TokenType.NEWLINE ||
        nextType === TokenType.COMMENT ||
        nextType === TokenType.EOF
      ) {
        this.advance();
        return { type: 'string', value: val };
      }
    }

    return undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Type Composition Parsing
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Parse type composition: = @type1 & @type2 [:override]
   */
  private parseTypeComposition(): void {
    this.expect(TokenType.EQUALS, 'Expected =');
    this.skipWhitespace();

    const typeRefs: string[] = [];
    let hasOverride = false;

    while (!this.isAtEnd()) {
      const token = this.peek();

      if (token.type === TokenType.PREFIX_REFERENCE) {
        this.advance();
        if (this.peek().type === TokenType.IDENTIFIER) {
          // Build full namespaced reference like core.vehicle-core
          let typeRef = this.getTokenVal(this.peek());
          this.advance();
          // Handle namespaced references like @namespace.typename
          while (this.peek().type === TokenType.DOT) {
            this.advance(); // consume the dot
            if (this.peek().type === TokenType.IDENTIFIER) {
              typeRef += '.' + this.getTokenVal(this.peek());
              this.advance();
            } else {
              break;
            }
          }
          typeRefs.push(typeRef);
        }
      } else if (this.getTokenVal(token) === '&') {
        this.advance();
        this.skipWhitespace();
      } else if (token.type === TokenType.COLON) {
        // Check for :override modifier
        this.advance();
        this.skipWhitespace();
        const nextToken = this.peek();
        if (nextToken.type === TokenType.IDENTIFIER && this.getTokenVal(nextToken) === 'override') {
          hasOverride = true;
          this.advance();
        }
      } else if (token.type === TokenType.WHITESPACE) {
        this.advance();
      } else if (token.type === TokenType.NEWLINE || token.type === TokenType.COMMENT) {
        break;
      } else {
        break;
      }
    }

    // Store type composition as a special field
    if (typeRefs.length > 0) {
      const typeRef: { kind: 'typeRef'; name: string; override?: boolean } = {
        kind: 'typeRef',
        name: typeRefs.join('&'),
      };
      if (hasOverride) {
        typeRef.override = true;
      }

      const compositionField: SchemaField = {
        path: '',
        type: typeRef,
        required: false,
        nullable: false,
        redacted: false,
        deprecated: false,
        constraints: [],
        conditionals: [],
      };

      if (this.state.currentHeader?.kind === 'typeDefinition') {
        this.currentTypeFields.set('_composition', compositionField);
      } else if (this.state.currentHeader?.kind === 'array') {
        // Array type inheritance: {array[]} = @typename
        this.currentArrayFields.set('_composition', compositionField);
      } else if (this.state.currentHeader?.kind === 'object') {
        const fullPath = this.state.currentPath;
        this.fields.set(`${fullPath}._composition`, compositionField);
      }
    }

    this.consumeToNewline();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Object Constraint Parsing
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Parse object constraint: :invariant or :of/:one_of/:exactly_one/:at_most_one
   */
  private parseObjectConstraint(): void {
    this.expect(TokenType.COLON, 'Expected :');

    const token = this.peek();
    if (token.type !== TokenType.IDENTIFIER) {
      this.consumeToNewline();
      return;
    }

    const keyword = this.getTokenVal(token);

    if (keyword === 'invariant') {
      this.advance();
      this.parseInvariant();
    } else if (keyword === 'of') {
      this.advance();
      this.parseCardinalityOf();
    } else if (keyword === 'one_of') {
      this.advance();
      this.parseCardinalityShorthand('one_of');
    } else if (keyword === 'exactly_one') {
      this.advance();
      this.parseCardinalityShorthand('exactly_one');
    } else if (keyword === 'at_most_one') {
      this.advance();
      this.parseCardinalityShorthand('at_most_one');
    } else {
      this.consumeToNewline();
    }
  }

  /**
   * Parse invariant constraint.
   */
  private parseInvariant(): void {
    this.skipWhitespace();

    // Record start position to extract expression from source
    const startPos = this.peek().start;
    let endPos = startPos;

    // Scan until newline to find the end position
    while (!this.isAtEnd()) {
      const token = this.peek();
      if (token.type === TokenType.NEWLINE || token.type === TokenType.COMMENT) {
        break;
      }
      endPos = token.end;
      this.advance();
    }

    // Extract expression directly from source to preserve whitespace
    const expression = this.reader.getSource().substring(startPos, endPos).trim();
    if (expression) {
      const invariant: SchemaInvariant = {
        kind: 'invariant',
        expression,
      };

      const path = this.state.currentPath || '';
      const existing = this.constraints.get(path) ?? [];
      existing.push(invariant);
      this.constraints.set(path, existing);
    }

    this.consumeToNewline();
  }

  /**
   * Parse cardinality with bounds: :of (min..max) field1, field2
   */
  private parseCardinalityOf(): void {
    this.skipWhitespace();

    let min: number | undefined;
    let max: number | undefined;
    let remainingFieldsStr: string | undefined;

    // Parse bounds (min..max)
    const startVal = this.getTokenVal(this.peek());
    if (startVal === '(') {
      this.advance();

      if (this.peek().type === TokenType.NUMBER) {
        min = parseInt(this.getTokenVal(this.peek()), 10);
        this.advance();
      }

      // Skip ..
      if (this.peek().type === TokenType.DOT) {
        this.advance();
        if (this.peek().type === TokenType.DOT) {
          this.advance();
        }
      }

      if (this.peek().type === TokenType.NUMBER) {
        max = parseInt(this.getTokenVal(this.peek()), 10);
        this.advance();
      }

      const endVal = this.getTokenVal(this.peek());
      if (endVal === ')') {
        this.advance();
      }
    } else if (startVal.startsWith('(')) {
      // Tokenizer produced compound STRING_BARE like "(2..3) field1, field2"
      // Parse bounds from the string
      const closeIdx = startVal.indexOf(')');
      if (closeIdx > 0) {
        const boundsStr = startVal.substring(1, closeIdx); // e.g., "2..3"
        const dotIdx = boundsStr.indexOf('..');
        if (dotIdx !== -1) {
          const minStr = boundsStr.substring(0, dotIdx);
          const maxStr = boundsStr.substring(dotIdx + 2);
          if (minStr) {
            min = parseInt(minStr, 10);
          }
          if (maxStr) {
            max = parseInt(maxStr, 10);
          }
        }
        // Extract field list from after the closing paren
        remainingFieldsStr = startVal.substring(closeIdx + 1).trim();
        this.advance(); // consume the STRING_BARE token
      }
    }

    this.skipWhitespace();

    // Parse field list
    let fields: string[];
    if (remainingFieldsStr !== undefined) {
      // Parse fields from the extracted string
      fields = remainingFieldsStr
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
    } else {
      fields = this.parseFieldList();
    }

    const cardinality: SchemaCardinality = {
      kind: 'cardinality',
      type: 'of',
      fields,
    };
    if (min !== undefined) {
      cardinality.min = min;
    }
    if (max !== undefined) {
      cardinality.max = max;
    }

    const path = this.state.currentPath || '';
    const existing = this.constraints.get(path) ?? [];
    existing.push(cardinality);
    this.constraints.set(path, existing);

    this.consumeToNewline();
  }

  /**
   * Parse cardinality shorthand: :one_of, :exactly_one, :at_most_one
   */
  private parseCardinalityShorthand(type: 'one_of' | 'exactly_one' | 'at_most_one'): void {
    this.skipWhitespace();

    const fields = this.parseFieldList();

    const cardinality: SchemaCardinality = {
      kind: 'cardinality',
      type,
      fields,
    };

    const path = this.state.currentPath || '';
    const existing = this.constraints.get(path) ?? [];
    existing.push(cardinality);
    this.constraints.set(path, existing);

    this.consumeToNewline();
  }

  /**
   * Parse comma-separated field list.
   */
  private parseFieldList(): string[] {
    const fields: string[] = [];

    while (!this.isAtEnd()) {
      const token = this.peek();

      if (token.type === TokenType.NEWLINE || token.type === TokenType.COMMENT) {
        break;
      }

      if (token.type === TokenType.IDENTIFIER) {
        fields.push(this.getTokenVal(token));
        this.advance();
      } else if (token.type === TokenType.COMMA) {
        this.advance();
      } else if (token.type === TokenType.WHITESPACE) {
        this.advance();
      } else {
        break;
      }
    }

    return fields;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Token Navigation (delegates to SchemaTokenReader)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Skip newline tokens.
   */
  private skipNewlines(): void {
    this.reader.skipNewlines();
  }

  /**
   * Skip whitespace tokens.
   */
  private skipWhitespace(): void {
    this.reader.skipWhitespace();
  }

  /**
   * Consume tokens until newline.
   */
  private consumeToNewline(): void {
    this.reader.consumeToNewline();
  }

  /**
   * Expect a specific token type and throw if not found.
   */
  private expect(type: TokenType, message: string): Token {
    return this.reader.expect(type, message);
  }

  /**
   * Get token value with lazy extraction.
   */
  private getTokenVal(token: Token): string {
    return this.reader.getTokenVal(token);
  }

  /**
   * Peek at current token.
   */
  private peek(): Token {
    return this.reader.peek();
  }

  /**
   * Peek ahead by n tokens.
   */
  private peekAhead(n: number): Token {
    return this.reader.peekAhead(n);
  }

  /**
   * Advance to next token.
   */
  private advance(): Token {
    return this.reader.advance();
  }

  /**
   * Check if at end of tokens.
   */
  private isAtEnd(): boolean {
    return this.reader.isAtEnd();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse ODIN schema text into an OdinSchema object.
 *
 * @param text - Schema text to parse (string or UTF-8 bytes)
 * @param options - Optional parse configuration
 * @returns Parsed schema with types, fields, arrays, and constraints
 * @throws {ParseError} If the schema contains invalid syntax
 *
 * @example
 * ```typescript
 * const schema = parseSchema(`
 * {$}
 * odin = "1.0.0"
 * schema = "1.0.0"
 *
 * {@address}
 * line1 = !:(1..100)
 * city = !
 * state = !:(2)
 * zip = !
 *
 * {customer}
 * name = !
 * billing = @address
 * `);
 *
 * console.log(schema.types.get('address'));
 * console.log(schema.fields.get('customer.name'));
 * ```
 */
export function parseSchema(text: string | Uint8Array, options?: ParseOptions): OdinSchema {
  // Convert Uint8Array to string if needed
  const source = typeof text === 'string' ? text : new TextDecoder().decode(text);

  // Check document size
  if (options?.maxDocumentSize && source.length > options.maxDocumentSize) {
    throw new ParseError('Maximum document size exceeded', 'P011', 1, 1, {
      size: source.length,
      maxSize: options.maxDocumentSize,
    });
  }

  const parser = new SchemaParser();
  return parser.parse(source);
}
