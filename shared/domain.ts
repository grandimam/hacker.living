import type { Coordinates, FilterOptions, DisplayPlace } from './types.ts';

export function distanceKm(a: Coordinates, b: Coordinates): number {
  const rad = (x: number) => x * Math.PI / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function filterPlaces<T extends DisplayPlace>(places: T[], { query = '', category = 'all', region = 'all', saved = null, origin = null, radius = 100, bounds = null, sort = 'curated' }: FilterOptions = {}): T[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const results = places.filter(p => {
    const searchable = [p.name, p.city, p.country, p.category, p.neighborhood, p.description, ...(p.tags || [])].join(' ').toLocaleLowerCase();
    return terms.every(t => searchable.includes(t))
      && (category === 'all' || p.category === category)
      && (region === 'all' || p.city === region)
      && (!saved || saved.has(p.id))
      && (!origin || distanceKm(origin, p.coordinates) <= radius)
      && (!bounds || (p.coordinates[0] >= bounds.south && p.coordinates[0] <= bounds.north && (bounds.west <= bounds.east ? p.coordinates[1] >= bounds.west && p.coordinates[1] <= bounds.east : p.coordinates[1] >= bounds.west || p.coordinates[1] <= bounds.east)));
  });
  if (origin) results.sort((a, b) => distanceKm(origin, a.coordinates) - distanceKm(origin, b.coordinates));
  else if (sort === 'name') results.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'curated') results.sort((a,b) => (b.sourceCount??1)-(a.sourceCount??1) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  else if (sort === 'recent') results.sort((a, b) => (b.source.date || '').localeCompare(a.source.date || ''));
  return results;
}

export function parseSaved(raw: string | null, validIds: Set<string>): Set<string> {
  try {
    const parsed: unknown = JSON.parse(raw || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((x: unknown): x is string => typeof x === 'string' && validIds.has(x)) : []);
  } catch { return new Set<string>(); }
}
