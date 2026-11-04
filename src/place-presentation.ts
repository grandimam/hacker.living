import type { Place } from './types';

const editorial: Record<string, { teaser: string; neighborhood: string }> = {
  crossness: { teaser: 'A Victorian engine house that looks like a cathedral.', neighborhood: 'Abbey Wood' },
  soane: { teaser: 'An architect’s home, filled with antiquities and unexpected spaces.', neighborhood: 'Holborn' },
  greenwich: { teaser: 'The story of time, navigation, and the machines that changed them.', neighborhood: 'Greenwich' },
};

export function placeTeaser(place: Place) { return editorial[place.id]?.teaser || place.description; }
export function placeLocation(place: Place) { return editorial[place.id]?.neighborhood || place.city; }
export function placeCategory(place: Place) { return ({ Museums: 'Museum', Libraries: 'Library', Observatories: 'Observatory' } as Record<string,string>)[place.category] || place.category; }
export function curatedOrder(places: Place[]) {
  const order = ['crossness','soane','greenwich'];
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  return [...places].sort((a,b) => rank(a.id)-rank(b.id));
}
