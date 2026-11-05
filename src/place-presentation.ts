import type { Place } from './types';

export function placeTeaser(place: Place) { return place.description; }
export function placeLocation(place: Place) { return place.neighborhood || place.city; }
export function placeCategory(place: Place) { return ({ Museums: 'Museum', Libraries: 'Library', Observatories: 'Observatory' } as Record<string,string>)[place.category] || place.category; }
export function curatedOrder(places: Place[]) { return [...places]; }
