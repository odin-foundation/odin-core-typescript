/**
 * ODIN Transform Geo/Spatial Verbs
 *
 * Geospatial verbs for lat/long calculations: distance, inBoundingBox,
 * toRadians, toDegrees.
 */

import type { VerbFunction } from '../../types/transform.js';
import { toNumber, num, bool, nil } from './helpers.js';
import { incompatibleConversionError } from '../errors.js';

/** Earth's radius in kilometers */
const EARTH_RADIUS_KM = 6371;

/** Earth's radius in miles */
const EARTH_RADIUS_MILES = 3959;

/**
 * Convert degrees to radians
 */
function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * %distance @lat1 @lon1 @lat2 @lon2 [unit] - Calculate distance between two points
 *
 * Uses the Haversine formula for great-circle distance.
 * Default unit is kilometers. Use "miles" or "mi" for miles.
 *
 * @example
 * distKm = "%distance @.lat1 @.lon1 @.lat2 @.lon2"
 * distMi = "%distance ##40.7128 ##-74.0060 ##34.0522 ##-118.2437 \"miles\""
 */
export const distance: VerbFunction = (args, context) => {
  if (args.length < 4) return nil();

  const lat1 = toNumber(args[0]!);
  const lon1 = toNumber(args[1]!);
  const lat2 = toNumber(args[2]!);
  const lon2 = toNumber(args[3]!);

  // Validate coordinates
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) return nil();
  if (lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) return nil();

  // Determine unit
  const unit =
    args.length >= 5
      ? String(args[4]!.type === 'string' ? args[4]!.value : '').toLowerCase()
      : 'km';
  const validUnits = ['km', 'mi', 'miles'];
  if (!validUnits.includes(unit)) {
    if (context.errors) {
      context.errors.push(incompatibleConversionError('distance', `unknown unit '${unit}' (expected 'km', 'mi', or 'miles')`));
    }
    return nil();
  }
  const radius = unit === 'miles' || unit === 'mi' ? EARTH_RADIUS_MILES : EARTH_RADIUS_KM;

  // Haversine formula
  const dLat = degreesToRadians(lat2 - lat1);
  const dLon = degreesToRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degreesToRadians(lat1)) *
      Math.cos(degreesToRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = radius * c;

  return num(dist);
};

/**
 * %inBoundingBox @lat @lon @minLat @minLon @maxLat @maxLon - Check if point is in bounding box
 *
 * Returns true if the point (lat, lon) is within the rectangular bounding box
 * defined by (minLat, minLon) to (maxLat, maxLon).
 *
 * @example
 * inUSA = "%inBoundingBox @.lat @.lon ##24.5 ##-125 ##49.5 ##-66"
 */
export const inBoundingBox: VerbFunction = (args) => {
  if (args.length < 6) return nil();

  const lat = toNumber(args[0]!);
  const lon = toNumber(args[1]!);
  const minLat = toNumber(args[2]!);
  const minLon = toNumber(args[3]!);
  const maxLat = toNumber(args[4]!);
  const maxLon = toNumber(args[5]!);

  // Check if point is within bounds
  const inLat = lat >= minLat && lat <= maxLat;
  const inLon = lon >= minLon && lon <= maxLon;

  return bool(inLat && inLon);
};

/**
 * %toRadians @degrees - Convert degrees to radians
 *
 * @example
 * rad = "%toRadians ##180"  ; Returns ~3.14159
 */
export const toRadians: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const degrees = toNumber(args[0]!);
  return num(degreesToRadians(degrees));
};

/**
 * %toDegrees @radians - Convert radians to degrees
 *
 * @example
 * deg = "%toDegrees ##3.14159"  ; Returns ~180
 */
export const toDegrees: VerbFunction = (args) => {
  if (args.length === 0) return nil();
  const radians = toNumber(args[0]!);
  return num(radiansToDegrees(radians));
};

/**
 * %bearing @lat1 @lon1 @lat2 @lon2 - Calculate initial bearing between two points
 *
 * Returns the initial bearing (forward azimuth) in degrees from point 1 to point 2.
 * Result is in range 0-360 degrees (0 = North, 90 = East, 180 = South, 270 = West).
 *
 * @example
 * heading = "%bearing @.startLat @.startLon @.endLat @.endLon"
 */
export const bearing: VerbFunction = (args) => {
  if (args.length < 4) return nil();

  const lat1 = toNumber(args[0]!);
  const lon1 = toNumber(args[1]!);
  const lat2 = toNumber(args[2]!);
  const lon2 = toNumber(args[3]!);

  // Validate coordinates
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) return nil();
  if (lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) return nil();

  const lat1Rad = degreesToRadians(lat1);
  const lat2Rad = degreesToRadians(lat2);
  const dLonRad = degreesToRadians(lon2 - lon1);

  const y = Math.sin(dLonRad) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLonRad);

  const bearingRad = Math.atan2(y, x);
  let bearingDeg = radiansToDegrees(bearingRad);

  // Normalize to 0-360
  bearingDeg = (bearingDeg + 360) % 360;

  return num(bearingDeg);
};

/**
 * %midpoint @lat1 @lon1 @lat2 @lon2 - Calculate midpoint between two points
 *
 * Returns an object with lat and lon properties representing the geographic
 * midpoint along the great circle path between two points.
 *
 * @example
 * mid = "%midpoint @.startLat @.startLon @.endLat @.endLon"
 */
export const midpoint: VerbFunction = (args) => {
  if (args.length < 4) return nil();

  const lat1 = toNumber(args[0]!);
  const lon1 = toNumber(args[1]!);
  const lat2 = toNumber(args[2]!);
  const lon2 = toNumber(args[3]!);

  // Validate coordinates
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) return nil();
  if (lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) return nil();

  const lat1Rad = degreesToRadians(lat1);
  const lon1Rad = degreesToRadians(lon1);
  const lat2Rad = degreesToRadians(lat2);
  const dLonRad = degreesToRadians(lon2 - lon1);

  const Bx = Math.cos(lat2Rad) * Math.cos(dLonRad);
  const By = Math.cos(lat2Rad) * Math.sin(dLonRad);

  const lat3Rad = Math.atan2(
    Math.sin(lat1Rad) + Math.sin(lat2Rad),
    Math.sqrt((Math.cos(lat1Rad) + Bx) * (Math.cos(lat1Rad) + Bx) + By * By)
  );
  const lon3Rad = lon1Rad + Math.atan2(By, Math.cos(lat1Rad) + Bx);

  return {
    type: 'object' as const,
    value: {
      lat: radiansToDegrees(lat3Rad),
      lon: radiansToDegrees(lon3Rad),
    },
  };
};
