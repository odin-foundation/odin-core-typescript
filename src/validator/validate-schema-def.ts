/**
 * ODIN Validator - Schema definition validation.
 *
 * Validates that the schema itself is well-formed, independent of any document:
 * override restrictiveness, intersection field conflicts, tabular column rules,
 * and default-value rules. Violations are reported as V017.
 */

import type {
  OdinSchema,
  SchemaField,
  SchemaFieldType,
  SchemaType,
  SchemaConstraint,
  SchemaBoundsConstraint,
  ValidationError,
} from '../types/schema.js';
import type { OdinValue } from '../types/values.js';
import type { TypeRegistry } from '../resolver/type-registry.js';

export interface SchemaDefContext {
  schema: OdinSchema;
  typeRegistry?: TypeRegistry | undefined;
  errors: ValidationError[];
}

function addError(
  ctx: SchemaDefContext,
  path: string,
  message: string,
  expected?: unknown,
  actual?: unknown
): void {
  const error: ValidationError = { path, code: 'V017', message };
  if (expected !== undefined) (error as { expected?: unknown }).expected = expected;
  if (actual !== undefined) (error as { actual?: unknown }).actual = actual;
  ctx.errors.push(error);
}

function lookupBaseType(ctx: SchemaDefContext, name: string): SchemaType | undefined {
  if (ctx.typeRegistry) {
    const t = ctx.typeRegistry.lookup(name);
    if (t) return t;
  }
  return ctx.schema.types.get(name);
}

/**
 * Run all schema-definition validations.
 */
export function validateSchemaDefinition(ctx: SchemaDefContext): void {
  validateTypeDefinitions(ctx);
  validatePathCompositions(ctx);
  validateTabularColumns(ctx);
  validateDefaults(ctx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Override and Intersection (type definitions)
// ─────────────────────────────────────────────────────────────────────────────

function validateTypeDefinitions(ctx: SchemaDefContext): void {
  for (const [typeName, type] of ctx.schema.types) {
    const composition = type.fields.get('_composition');
    if (!composition || composition.type.kind !== 'typeRef') continue;

    const memberNames = composition.type.name
      .split('&')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    if (composition.type.override === true) {
      validateOverride(ctx, typeName, type, memberNames);
    } else if (memberNames.length > 1) {
      validateIntersectionConflicts(ctx, typeName, memberNames);
    }
  }
}

/**
 * Override may only narrow: base type must match, optional→required allowed
 * (not reverse), nullability may be removed (not added), bounds may only narrow.
 */
function validateOverride(
  ctx: SchemaDefContext,
  typeName: string,
  type: SchemaType,
  baseNames: string[]
): void {
  const baseFields = new Map<string, SchemaField>();
  for (const baseName of baseNames) {
    const base = lookupBaseType(ctx, baseName);
    if (!base) continue;
    for (const [fn, ff] of base.fields) {
      if (fn !== '_composition') baseFields.set(fn, ff);
    }
  }

  for (const [fn, override] of type.fields) {
    if (fn === '_composition') continue;
    const base = baseFields.get(fn);
    if (!base) continue;
    checkOverrideField(ctx, `@${typeName}.${fn}`, base, override);
  }
}

function checkOverrideField(
  ctx: SchemaDefContext,
  label: string,
  base: SchemaField,
  override: SchemaField
): void {
  // Base type must match
  if (!sameBaseType(base.type, override.type)) {
    addError(
      ctx,
      label,
      `Override changes field type`,
      typeKindLabel(base.type),
      typeKindLabel(override.type)
    );
  }

  // required: optional→required allowed, required→optional forbidden
  if (base.required && !override.required) {
    addError(ctx, label, `Override relaxes required field to optional`, 'required', 'optional');
  }

  // nullable: may remove, may not add
  if (!base.nullable && override.nullable) {
    addError(ctx, label, `Override adds nullability`, 'non-nullable', 'nullable');
  }

  // bounds: may only narrow
  const baseBounds = findBounds(base.constraints);
  const overrideBounds = findBounds(override.constraints);
  if (baseBounds && overrideBounds) {
    if (widensBounds(baseBounds, overrideBounds)) {
      addError(
        ctx,
        label,
        `Override widens constraint bounds`,
        boundsLabel(baseBounds),
        boundsLabel(overrideBounds)
      );
    }
  }
}

/**
 * Intersection field conflicts: a field defined in more than one member with a
 * differing definition is an error.
 */
function validateIntersectionConflicts(
  ctx: SchemaDefContext,
  typeName: string,
  memberNames: string[]
): void {
  const seen = new Map<string, { member: string; field: SchemaField }>();
  for (const memberName of memberNames) {
    const member = lookupBaseType(ctx, memberName);
    if (!member) continue;
    for (const [fn, ff] of member.fields) {
      if (fn === '_composition') continue;
      const prior = seen.get(fn);
      if (prior && !sameFieldDefinition(prior.field, ff)) {
        addError(
          ctx,
          `@${typeName}.${fn}`,
          `Intersection field conflict: '${fn}' differs between @${prior.member} and @${memberName}`,
          'identical field definitions',
          'conflicting definitions'
        );
      } else if (!prior) {
        seen.set(fn, { member: memberName, field: ff });
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Path-level compositions ({path} = @base :override)
// ─────────────────────────────────────────────────────────────────────────────

function validatePathCompositions(ctx: SchemaDefContext): void {
  for (const [path, field] of ctx.schema.fields) {
    if (!path.endsWith('._composition') || field.type.kind !== 'typeRef') continue;
    const parentPath = path.substring(0, path.length - '._composition'.length);

    const memberNames = field.type.name
      .split('&')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    if (field.type.override === true) {
      const baseFields = new Map<string, SchemaField>();
      for (const baseName of memberNames) {
        const base = lookupBaseType(ctx, baseName);
        if (!base) continue;
        for (const [fn, ff] of base.fields) {
          if (fn !== '_composition') baseFields.set(fn, ff);
        }
      }
      for (const [fieldPath, override] of ctx.schema.fields) {
        if (!fieldPath.startsWith(`${parentPath}.`) || fieldPath.endsWith('._composition')) continue;
        const localName = fieldPath.substring(parentPath.length + 1);
        if (localName.includes('.')) continue;
        const base = baseFields.get(localName);
        if (!base) continue;
        checkOverrideField(ctx, fieldPath, base, override);
      }
    } else if (memberNames.length > 1) {
      validateIntersectionConflicts(ctx, parentPath, memberNames);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabular column rules
// ─────────────────────────────────────────────────────────────────────────────

const PRIMITIVE_KINDS = new Set([
  'string',
  'boolean',
  'number',
  'integer',
  'decimal',
  'currency',
  'percent',
  'date',
  'timestamp',
  'time',
  'duration',
  'enum',
  'binary',
]);

function validateTabularColumns(ctx: SchemaDefContext): void {
  for (const [arrayPath, array] of ctx.schema.arrays) {
    if (!array.columns) continue;
    for (const column of array.columns) {
      const label = `${arrayPath}[].${column}`;

      // Multi-level nesting: at most one dot or one index segment.
      if (isMultiLevelColumn(column)) {
        addError(ctx, label, `Tabular column uses multi-level path`, 'single-level column', column);
        continue;
      }

      const itemName = column.replace(/\[\d+\]$/, '');
      const field = array.itemFields.get(itemName) ?? array.itemFields.get(column);
      if (!field) continue;

      if (!isPrimitiveColumnType(ctx, field.type)) {
        addError(
          ctx,
          label,
          `Tabular column must be a primitive type`,
          'primitive',
          typeKindLabel(field.type)
        );
      }
    }
  }
}

function isMultiLevelColumn(column: string): boolean {
  const dotCount = (column.match(/\./g) ?? []).length;
  const indexCount = (column.match(/\[\d+\]/g) ?? []).length;
  if (dotCount > 1 || indexCount > 1) return true;
  // A dot and an index together is two levels.
  if (dotCount === 1 && indexCount === 1) return true;
  return false;
}

function isPrimitiveColumnType(ctx: SchemaDefContext, type: SchemaFieldType): boolean {
  if (type.kind === 'typeRef') return false;
  if (type.kind === 'union') {
    return type.types.every((t) => isPrimitiveColumnType(ctx, t));
  }
  // A reference whose target names a defined type is a type ref, not a primitive.
  if (type.kind === 'reference') {
    if (type.targetPath && lookupBaseType(ctx, type.targetPath)) return false;
    return false;
  }
  return PRIMITIVE_KINDS.has(type.kind);
}

// ─────────────────────────────────────────────────────────────────────────────
// Default value rules
// ─────────────────────────────────────────────────────────────────────────────

function validateDefaults(ctx: SchemaDefContext): void {
  for (const [path, field] of ctx.schema.fields) {
    if (path.endsWith('._composition')) continue;
    checkDefault(ctx, path, field);
  }
  for (const [, type] of ctx.schema.types) {
    for (const [fn, field] of type.fields) {
      if (fn === '_composition') continue;
      checkDefault(ctx, `@${type.name}.${fn}`, field);
    }
  }
  for (const [arrayPath, array] of ctx.schema.arrays) {
    for (const [fn, field] of array.itemFields) {
      checkDefault(ctx, `${arrayPath}[].${fn}`, field);
    }
  }
}

function checkDefault(ctx: SchemaDefContext, label: string, field: SchemaField): void {
  if (field.defaultValue === undefined) return;

  // Required fields cannot have a default.
  if (field.required) {
    addError(ctx, label, `Required field cannot have a default value`, 'no default', 'default present');
    return;
  }

  // Default must satisfy field constraints.
  if (!defaultSatisfiesConstraints(field, field.defaultValue)) {
    addError(
      ctx,
      label,
      `Default value violates field constraints`,
      'value within constraints',
      describeValue(field.defaultValue)
    );
  }
}

function defaultSatisfiesConstraints(field: SchemaField, value: OdinValue): boolean {
  for (const constraint of field.constraints) {
    if (constraint.kind === 'bounds') {
      if (!boundsSatisfied(constraint, value)) return false;
    } else if (constraint.kind === 'enum') {
      if (value.type !== 'string' || !constraint.values.includes(value.value)) return false;
    } else if (constraint.kind === 'pattern') {
      if (value.type === 'string') {
        try {
          if (!new RegExp(constraint.pattern).test(value.value)) return false;
        } catch {
          /* invalid pattern handled elsewhere */
        }
      }
    }
  }
  // Enum-typed field
  if (field.type.kind === 'enum') {
    if (value.type !== 'string' || !field.type.values.includes(value.value)) return false;
  }
  return true;
}

function boundsSatisfied(c: SchemaBoundsConstraint, value: OdinValue): boolean {
  let num: number | undefined;
  let len: number | undefined;
  if (
    value.type === 'number' ||
    value.type === 'integer' ||
    value.type === 'currency' ||
    value.type === 'percent'
  ) {
    num = value.value;
  } else if (value.type === 'string') {
    len = value.value.length;
  }

  const target = num ?? len;
  if (target === undefined) return true;

  if (typeof c.min === 'number' && target < c.min) return false;
  if (typeof c.max === 'number' && target > c.max) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sameBaseType(a: SchemaFieldType, b: SchemaFieldType): boolean {
  return a.kind === b.kind;
}

function typeKindLabel(t: SchemaFieldType): string {
  return t.kind;
}

function findBounds(constraints: SchemaConstraint[]): SchemaBoundsConstraint | undefined {
  return constraints.find((c): c is SchemaBoundsConstraint => c.kind === 'bounds');
}

function boundsLabel(b: SchemaBoundsConstraint): string {
  return `(${b.min ?? ''}..${b.max ?? ''})`;
}

/**
 * A bounds override widens if it loosens either end relative to the base.
 */
function widensBounds(base: SchemaBoundsConstraint, override: SchemaBoundsConstraint): boolean {
  // min: override may only raise (narrow). Removing or lowering min widens.
  if (typeof base.min === 'number') {
    if (typeof override.min !== 'number' || override.min < base.min) return true;
  }
  // max: override may only lower (narrow). Removing or raising max widens.
  if (typeof base.max === 'number') {
    if (typeof override.max !== 'number' || override.max > base.max) return true;
  }
  return false;
}

function sameFieldDefinition(a: SchemaField, b: SchemaField): boolean {
  if (a.type.kind !== b.type.kind) return false;
  if (a.required !== b.required) return false;
  if (a.nullable !== b.nullable) return false;
  if (JSON.stringify(a.constraints) !== JSON.stringify(b.constraints)) return false;
  return true;
}

function describeValue(value: OdinValue): unknown {
  if (
    value.type === 'string' ||
    value.type === 'number' ||
    value.type === 'integer' ||
    value.type === 'currency' ||
    value.type === 'percent' ||
    value.type === 'boolean'
  ) {
    return value.value;
  }
  return value.type;
}
