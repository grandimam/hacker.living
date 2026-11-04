export function distanceKm(a, b) {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function filterPlaces(places, { query = '', category = 'all', region = 'all', saved = null, origin = null, radius = 100, bounds = null, sort = 'curated' } = {}) {
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
  else if (sort === 'recent') results.sort((a, b) => (b.source.date || '').localeCompare(a.source.date || ''));
  return results;
}

export function parseSaved(raw, validIds) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && validIds.has(x)) : []);
  } catch { return new Set(); }
}
