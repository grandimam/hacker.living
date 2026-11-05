export const placeCategories = ['Museums', 'Libraries', 'Engineering', 'Observatories', 'Computing', 'Science'] as const;
export type Category = typeof placeCategories[number];
export type Coordinates = [number, number];

export interface Source {
  commentId: number;
  storyId: number;
  url: string;
  discussionUrl: string;
  author: string;
  date: string;
  quote: string | null;
}

export interface PlaceImage {
  path: string;
  alt: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  modifications: string;
}

export interface ReviewMetadata {
  status: 'draft' | 'approved';
  reviewedAt?: string;
  reviewer?: string;
  method?: string;
  evidenceText?: string;
  locationVerified?: boolean;
  recommendationVerified?: boolean;
}

export interface ApprovedReview extends ReviewMetadata {
  status: 'approved';
  reviewedAt: string;
}

export interface Place {
  id: string;
  name: string;
  city: string;
  country: string;
  category: Category;
  coordinates: Coordinates;
  coordinateSource: string;
  description: string;
  reason: string;
  visitNote: string;
  tags: string[];
  neighborhood?: string;
  officialUrl: string;
  officialCheckedAt: string;
  source: Source;
  sources?: Source[];
  review: ApprovedReview;
  image: PlaceImage | null;
}

export interface DraftPlace extends Omit<Place, 'coordinates' | 'officialCheckedAt' | 'review'> {
  candidateId?: string;
  coordinates: [number | null, number | null];
  officialCheckedAt: string | null;
  review: ReviewMetadata;
}

export interface ReviewablePlace extends Omit<DraftPlace, 'coordinates'> {
  coordinates: Coordinates;
}

export interface PublishedData {
  schemaVersion: 1;
  updatedAt: string;
  places: Place[];
}

export interface Bounds { north: number; south: number; west: number; east: number }
export interface FilterOptions {
  query?: string;
  category?: string;
  region?: string;
  saved?: Set<string> | null;
  origin?: Coordinates | null;
  radius?: number;
  bounds?: Bounds | null;
  sort?: string;
}
