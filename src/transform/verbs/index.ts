/**
 * ODIN Transform Verbs
 *
 * Implementation of transformation verbs as specified in ODIN Transform 1.0.
 * Organized by category: core, coercion, string, numeric, datetime, aggregation,
 * generation, encoding, and array operations.
 */

import type { VerbFunction, VerbRegistry } from '../../types/transform.js';

// Re-export TransformContext for verb implementations that need it
export type { TransformContext } from '../../types/transform.js';

// Import all verb implementations
import * as core from './core.js';
import * as coercion from './coercion.js';
import * as datetime from './datetime.js';
import * as stringVerbs from './string.js';
import * as numeric from './numeric.js';
import * as aggregation from './aggregation.js';
import * as generation from './generation.js';
import * as encoding from './encoding.js';
import * as array from './array.js';
import * as financial from './financial.js';
import * as logic from './logic.js';
import * as object from './object.js';
import * as geo from './geo.js';

// ─────────────────────────────────────────────────────────────────────────────
// Verb Registry Implementation
// ─────────────────────────────────────────────────────────────────────────────

class VerbRegistryImpl implements VerbRegistry {
  private builtIn: Map<string, VerbFunction> = new Map();
  private custom: Map<string, VerbFunction> = new Map();

  constructor() {
    // Core verbs
    this.builtIn.set('concat', core.concat);
    this.builtIn.set('upper', core.upper);
    this.builtIn.set('lower', core.lower);
    this.builtIn.set('trim', core.trim);
    this.builtIn.set('trimLeft', core.trimLeft);
    this.builtIn.set('trimRight', core.trimRight);
    this.builtIn.set('coalesce', core.coalesce);
    this.builtIn.set('ifNull', core.ifNull);
    this.builtIn.set('ifEmpty', core.ifEmpty);
    this.builtIn.set('ifElse', core.ifElse);
    this.builtIn.set('lookup', core.lookup);
    this.builtIn.set('lookupDefault', core.lookupDefault);

    // Coercion verbs
    this.builtIn.set('coerceString', coercion.coerceString);
    this.builtIn.set('coerceNumber', coercion.coerceNumber);
    this.builtIn.set('coerceInteger', coercion.coerceInteger);
    this.builtIn.set('coerceBoolean', coercion.coerceBoolean);
    this.builtIn.set('coerceDate', coercion.coerceDate);
    this.builtIn.set('coerceTimestamp', coercion.coerceTimestamp);

    // Date/Time verbs
    this.builtIn.set('formatDate', datetime.formatDate);
    this.builtIn.set('parseDate', datetime.parseDate);
    this.builtIn.set('today', datetime.today);
    this.builtIn.set('now', datetime.now);

    // String verbs
    this.builtIn.set('capitalize', stringVerbs.capitalize);
    this.builtIn.set('titleCase', stringVerbs.titleCase);
    this.builtIn.set('length', stringVerbs.length);
    this.builtIn.set('contains', stringVerbs.contains);
    this.builtIn.set('startsWith', stringVerbs.startsWith);
    this.builtIn.set('endsWith', stringVerbs.endsWith);
    this.builtIn.set('substring', stringVerbs.substring);
    this.builtIn.set('replace', stringVerbs.replace);
    this.builtIn.set('padLeft', stringVerbs.padLeft);
    this.builtIn.set('padRight', stringVerbs.padRight);
    this.builtIn.set('truncate', stringVerbs.truncate);
    this.builtIn.set('split', stringVerbs.split);
    this.builtIn.set('join', stringVerbs.join);

    // Numeric verbs
    this.builtIn.set('formatNumber', numeric.formatNumber);
    this.builtIn.set('formatInteger', numeric.formatInteger);
    this.builtIn.set('formatCurrency', numeric.formatCurrency);
    this.builtIn.set('abs', numeric.abs);
    this.builtIn.set('round', numeric.round);
    this.builtIn.set('floor', numeric.floor);
    this.builtIn.set('ceil', numeric.ceil);
    this.builtIn.set('add', numeric.add);
    this.builtIn.set('subtract', numeric.subtract);
    this.builtIn.set('multiply', numeric.multiply);
    this.builtIn.set('divide', numeric.divide);
    this.builtIn.set('mod', numeric.mod);
    this.builtIn.set('negate', numeric.negate);
    this.builtIn.set('switch', numeric.switchVerb);

    // Date arithmetic verbs
    this.builtIn.set('addDays', datetime.addDays);
    this.builtIn.set('addMonths', datetime.addMonths);
    this.builtIn.set('addYears', datetime.addYears);
    this.builtIn.set('dateDiff', datetime.dateDiff);

    // Regex verbs
    this.builtIn.set('replaceRegex', stringVerbs.replaceRegex);
    this.builtIn.set('mask', stringVerbs.mask);
    this.builtIn.set('pad', stringVerbs.pad);

    // Time formatting verbs
    this.builtIn.set('formatTime', datetime.formatTime);
    this.builtIn.set('formatTimestamp', datetime.formatTimestamp);
    this.builtIn.set('parseTimestamp', datetime.parseTimestamp);

    // Aggregation verbs
    this.builtIn.set('accumulate', aggregation.accumulate);
    this.builtIn.set('set', aggregation.set);
    this.builtIn.set('sum', aggregation.sum);
    this.builtIn.set('count', aggregation.count);
    this.builtIn.set('min', aggregation.min);
    this.builtIn.set('max', aggregation.max);
    this.builtIn.set('avg', aggregation.avg);
    this.builtIn.set('first', aggregation.first);
    this.builtIn.set('last', aggregation.last);

    // Generation verbs
    this.builtIn.set('uuid', generation.uuid);
    this.builtIn.set('sequence', generation.sequence);
    this.builtIn.set('resetSequence', generation.resetSequence);

    // Encoding verbs
    this.builtIn.set('base64Encode', encoding.base64Encode);
    this.builtIn.set('base64Decode', encoding.base64Decode);
    this.builtIn.set('urlEncode', encoding.urlEncode);
    this.builtIn.set('urlDecode', encoding.urlDecode);
    this.builtIn.set('jsonEncode', encoding.jsonEncode);
    this.builtIn.set('jsonDecode', encoding.jsonDecode);
    this.builtIn.set('hexEncode', encoding.hexEncode);
    this.builtIn.set('hexDecode', encoding.hexDecode);

    // Array verbs
    this.builtIn.set('filter', array.filter);
    this.builtIn.set('flatten', array.flatten);
    this.builtIn.set('distinct', array.distinct);
    this.builtIn.set('sort', array.sort);
    this.builtIn.set('sortDesc', array.sortDesc);
    this.builtIn.set('sortBy', array.sortBy);
    this.builtIn.set('map', array.map);
    this.builtIn.set('indexOf', array.indexOf);
    this.builtIn.set('at', array.at);
    this.builtIn.set('slice', array.slice);
    this.builtIn.set('reverse', array.reverse);

    // Financial & Statistical verbs
    // Mathematical
    this.builtIn.set('log', financial.log);
    this.builtIn.set('ln', financial.ln);
    this.builtIn.set('log10', financial.log10);
    this.builtIn.set('exp', financial.exp);
    this.builtIn.set('pow', financial.pow);
    this.builtIn.set('sqrt', financial.sqrt);
    // Time Value of Money
    this.builtIn.set('compound', financial.compound);
    this.builtIn.set('discount', financial.discount);
    this.builtIn.set('pmt', financial.pmt);
    this.builtIn.set('fv', financial.fv);
    this.builtIn.set('pv', financial.pv);
    // Statistics
    this.builtIn.set('std', financial.std);
    this.builtIn.set('stdSample', financial.stdSample);
    this.builtIn.set('variance', financial.variance);
    this.builtIn.set('varianceSample', financial.varianceSample);
    this.builtIn.set('median', financial.median);
    this.builtIn.set('mode', financial.mode);
    this.builtIn.set('percentile', financial.percentile);
    this.builtIn.set('quantile', financial.quantile);
    // Correlation
    this.builtIn.set('covariance', financial.covariance);
    this.builtIn.set('correlation', financial.correlation);
    // Utility
    this.builtIn.set('clamp', financial.clamp);
    this.builtIn.set('interpolate', financial.interpolate);
    this.builtIn.set('weightedAvg', financial.weightedAvg);
    // Additional financial verbs
    this.builtIn.set('npv', financial.npv);
    this.builtIn.set('irr', financial.irr);
    this.builtIn.set('rate', financial.rate);
    this.builtIn.set('nper', financial.nper);
    this.builtIn.set('depreciation', financial.depreciation);

    // Logic verbs (boolean logic, comparisons, type checks)
    this.builtIn.set('and', logic.and);
    this.builtIn.set('or', logic.or);
    this.builtIn.set('not', logic.not);
    this.builtIn.set('xor', logic.xor);
    this.builtIn.set('eq', logic.eq);
    this.builtIn.set('ne', logic.ne);
    this.builtIn.set('lt', logic.lt);
    this.builtIn.set('lte', logic.lte);
    this.builtIn.set('gt', logic.gt);
    this.builtIn.set('gte', logic.gte);
    this.builtIn.set('between', logic.between);
    this.builtIn.set('isNull', logic.isNullVerb);
    this.builtIn.set('isString', logic.isString);
    this.builtIn.set('isNumber', logic.isNumber);
    this.builtIn.set('isBoolean', logic.isBoolean);
    this.builtIn.set('isArray', logic.isArray);
    this.builtIn.set('isObject', logic.isObject);
    this.builtIn.set('isDate', logic.isDate);
    this.builtIn.set('typeOf', logic.typeOf);
    this.builtIn.set('cond', logic.cond);

    // Object verbs
    this.builtIn.set('keys', object.keys);
    this.builtIn.set('values', object.values);
    this.builtIn.set('entries', object.entries);
    this.builtIn.set('has', object.has);
    this.builtIn.set('get', object.get);
    this.builtIn.set('merge', object.merge);

    // Additional string verbs
    this.builtIn.set('reverseString', stringVerbs.reverseString);
    this.builtIn.set('repeat', stringVerbs.repeat);
    this.builtIn.set('camelCase', stringVerbs.camelCase);
    this.builtIn.set('snakeCase', stringVerbs.snakeCase);
    this.builtIn.set('kebabCase', stringVerbs.kebabCase);
    this.builtIn.set('pascalCase', stringVerbs.pascalCase);
    this.builtIn.set('slugify', stringVerbs.slugify);
    this.builtIn.set('match', stringVerbs.match);
    this.builtIn.set('extract', stringVerbs.extract);
    this.builtIn.set('normalizeSpace', stringVerbs.normalizeSpace);
    this.builtIn.set('leftOf', stringVerbs.leftOf);
    this.builtIn.set('rightOf', stringVerbs.rightOf);
    this.builtIn.set('wrap', stringVerbs.wrap);
    this.builtIn.set('center', stringVerbs.center);

    // Additional numeric verbs
    this.builtIn.set('sign', numeric.sign);
    this.builtIn.set('trunc', numeric.trunc);
    this.builtIn.set('random', numeric.random);
    this.builtIn.set('minOf', numeric.minOf);
    this.builtIn.set('maxOf', numeric.maxOf);
    this.builtIn.set('formatPercent', numeric.formatPercent);
    this.builtIn.set('isFinite', numeric.isFiniteVerb);
    this.builtIn.set('isNaN', numeric.isNaNVerb);
    this.builtIn.set('parseInt', numeric.parseIntVerb);

    // Additional datetime verbs
    this.builtIn.set('addHours', datetime.addHours);
    this.builtIn.set('addMinutes', datetime.addMinutes);
    this.builtIn.set('addSeconds', datetime.addSeconds);
    this.builtIn.set('startOfDay', datetime.startOfDay);
    this.builtIn.set('endOfDay', datetime.endOfDay);
    this.builtIn.set('startOfMonth', datetime.startOfMonth);
    this.builtIn.set('endOfMonth', datetime.endOfMonth);
    this.builtIn.set('startOfYear', datetime.startOfYear);
    this.builtIn.set('endOfYear', datetime.endOfYear);
    this.builtIn.set('dayOfWeek', datetime.dayOfWeek);
    this.builtIn.set('weekOfYear', datetime.weekOfYear);
    this.builtIn.set('quarter', datetime.quarter);
    this.builtIn.set('isLeapYear', datetime.isLeapYear);
    this.builtIn.set('isBefore', datetime.isBefore);
    this.builtIn.set('isAfter', datetime.isAfter);
    this.builtIn.set('isBetween', datetime.isBetween);
    this.builtIn.set('toUnix', datetime.toUnix);
    this.builtIn.set('fromUnix', datetime.fromUnix);

    // Additional array verbs
    this.builtIn.set('every', array.every);
    this.builtIn.set('some', array.some);
    this.builtIn.set('find', array.find);
    this.builtIn.set('findIndex', array.findIndex);
    this.builtIn.set('includes', array.includes);
    this.builtIn.set('concatArrays', array.concatArrays);
    this.builtIn.set('zip', array.zip);
    this.builtIn.set('groupBy', array.groupBy);
    this.builtIn.set('partition', array.partition);
    this.builtIn.set('take', array.take);
    this.builtIn.set('drop', array.drop);
    this.builtIn.set('chunk', array.chunk);
    this.builtIn.set('range', array.range);
    this.builtIn.set('compact', array.compact);
    this.builtIn.set('pluck', array.pluck);
    this.builtIn.set('unique', array.unique);

    // Additional encoding verbs
    this.builtIn.set('sha256', encoding.sha256);
    this.builtIn.set('md5', encoding.md5);
    this.builtIn.set('sha1', encoding.sha1);
    this.builtIn.set('sha512', encoding.sha512);
    this.builtIn.set('crc32', encoding.crc32);

    // Additional generation verbs
    this.builtIn.set('nanoid', generation.nanoid);

    // Locale-aware formatting verbs
    this.builtIn.set('formatLocaleNumber', numeric.formatLocaleNumber);
    this.builtIn.set('formatLocaleDate', datetime.formatLocaleDate);

    // Cumulative and time-series array verbs
    this.builtIn.set('cumsum', array.cumsum);
    this.builtIn.set('cumprod', array.cumprod);
    this.builtIn.set('shift', array.shift);
    this.builtIn.set('diff', array.diff);
    this.builtIn.set('pctChange', array.pctChange);

    // Additional string verbs
    this.builtIn.set('matches', stringVerbs.matches);
    this.builtIn.set('stripAccents', stringVerbs.stripAccents);
    this.builtIn.set('clean', stringVerbs.clean);

    // Statistical verbs
    this.builtIn.set('zscore', financial.zscore);

    // Date calculation verbs
    this.builtIn.set('daysBetweenDates', datetime.daysBetweenDates);
    this.builtIn.set('ageFromDate', datetime.ageFromDate);
    this.builtIn.set('isValidDate', datetime.isValidDate);

    // Safe arithmetic verbs
    this.builtIn.set('safeDivide', numeric.safeDivide);

    // Deduplication verbs
    this.builtIn.set('dedupe', array.dedupe);

    // Geo/Spatial verbs
    this.builtIn.set('distance', geo.distance);
    this.builtIn.set('inBoundingBox', geo.inBoundingBox);
    this.builtIn.set('toRadians', geo.toRadians);
    this.builtIn.set('toDegrees', geo.toDegrees);
    this.builtIn.set('bearing', geo.bearing);
    this.builtIn.set('midpoint', geo.midpoint);

    // LLM/Text processing verbs
    this.builtIn.set('tokenize', stringVerbs.tokenize);
    this.builtIn.set('wordCount', stringVerbs.wordCount);

    // Fuzzy string matching verbs
    this.builtIn.set('levenshtein', stringVerbs.levenshtein);
    this.builtIn.set('soundex', stringVerbs.soundex);

    // Window/Ranking verbs
    this.builtIn.set('rowNumber', array.rowNumber);
    this.builtIn.set('rank', array.rank);
    this.builtIn.set('lag', array.lag);
    this.builtIn.set('lead', array.lead);

    // Sampling verbs
    this.builtIn.set('sample', array.sample);
    this.builtIn.set('limit', array.limit);
    this.builtIn.set('fillMissing', array.fillMissing);

    // Validation verbs
    this.builtIn.set('assert', logic.assert);

    // Collection coercion verbs
    this.builtIn.set('toArray', coercion.toArray);
    this.builtIn.set('toObject', coercion.toObject);

    // Auto-detection coercion
    this.builtIn.set('tryCoerce', coercion.tryCoerce);

    // JSON query verbs
    this.builtIn.set('jsonPath', encoding.jsonPath);

    // New verbs (Phase: 9 new transform verbs)
    // Array fold/reshape
    this.builtIn.set('reduce', array.reduce);
    this.builtIn.set('pivot', array.pivot);
    this.builtIn.set('unpivot', array.unpivot);
    // String formatting
    this.builtIn.set('formatPhone', stringVerbs.formatPhone);
    // Financial
    this.builtIn.set('movingAvg', financial.movingAvg);
    // DateTime
    this.builtIn.set('businessDays', datetime.businessDays);
    this.builtIn.set('nextBusinessDay', datetime.nextBusinessDay);
    this.builtIn.set('formatDuration', datetime.formatDuration);
    // Numeric
    this.builtIn.set('convertUnit', numeric.convertUnit);
  }

  get(name: string): VerbFunction | undefined {
    return this.builtIn.get(name);
  }

  register(namespace: string, name: string, fn: VerbFunction): void {
    const fullName = `${namespace}.${name}`;
    this.custom.set(fullName, fn);
  }

  getCustom(fullName: string): VerbFunction | undefined {
    return this.custom.get(fullName);
  }
}

/**
 * Default verb registry with all built-in verbs
 */
export const defaultVerbRegistry: VerbRegistry = new VerbRegistryImpl();

/**
 * Create a new verb registry with all built-in verbs
 */
export function createVerbRegistry(): VerbRegistry {
  return new VerbRegistryImpl();
}
