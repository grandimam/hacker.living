import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterPlaces, distanceKm, parseSaved } from '../shared/domain.mjs';
const { places } = JSON.parse(await readFile(new URL('../data/places.json', import.meta.url)));

test('search finds cities, place names, and interests without case sensitivity', () => {
  assert.deepEqual(filterPlaces(places, { query: 'CROSSNESS' }).map(p => p.id), ['crossness']);
  assert.equal(filterPlaces(places, { query: 'London' }).length, 7);
  assert.ok(filterPlaces(places, { query: 'steam' }).some(p => p.id === 'crossness'));
  assert.equal(filterPlaces(places, { query: 'London Colossus' }).length, 0);
});
test('category, region, and saved filters intersect', () => {
  const saved = new Set(['soane', 'crossness', 'jurassic']);
  assert.deepEqual(filterPlaces(places, { saved, category: 'Museums', region: 'London' }).map(p => p.id), ['soane']);
  assert.equal(filterPlaces(places, { saved: new Set() }).length, 0);
});
test('nearby filters exclude distant places and sort by actual distance', () => {
  const sf = [37.80, -122.40];
  assert.deepEqual(filterPlaces(places, { origin: sf, radius: 100 }).map(p => p.id), ['exploratorium']);
  assert.equal(filterPlaces(places, { origin: [25.20,55.27], radius: 100 }).length, 0);
  assert.ok(distanceKm([51.5,0], [37.8,-122.4]) > 8000);
  assert.equal(distanceKm([1,2], [1,2]), 0);
});
test('visible map bounds narrow the list; antimeridian bounds are supported', () => {
  assert.equal(filterPlaces(places, { bounds: { south:51.4,north:51.6,west:-.2,east:.2 } }).length,7);
  const tiny = [{...places[0],coordinates:[0,179]},{...places[1],coordinates:[0,-179]},{...places[2],coordinates:[0,0]}];
  assert.equal(filterPlaces(tiny,{bounds:{south:-1,north:1,west:170,east:-170}}).length,2);
});
test('corrupt or obsolete local saves never break discovery', () => {
  const valid = new Set(places.map(p => p.id));
  assert.deepEqual([...parseSaved('broken json',valid)],[]);
  assert.deepEqual([...parseSaved('{"wrong":"shape"}',valid)],[]);
  assert.deepEqual([...parseSaved('["crossness","missing",4,"crossness"]',valid)],['crossness']);
});
