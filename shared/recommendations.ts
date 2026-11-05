export interface Recommendation {
  id: string;
  sourceCount?: number;
  name: string;
  city: string | null;
  country: string | null;
  reason: string;
  quote: string | null;
  author: string | null;
  date: string | null;
  sourceUrl: string;
  officialUrl?: string;
  status: 'unverified';
}
export interface RecommendationPage {
  recommendations: Recommendation[];
  total: number;
  limit: number;
  offset: number;
}
