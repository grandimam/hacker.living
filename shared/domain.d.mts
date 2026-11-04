import type { Place, Coordinates, FilterOptions } from '../src/types';
export function distanceKm(a: Coordinates, b: Coordinates): number;
export function filterPlaces(places: Place[], options?: FilterOptions): Place[];
export function parseSaved(raw: string | null, validIds: Set<string>): Set<string>;
