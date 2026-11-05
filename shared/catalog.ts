import type {PublishedData} from './types';
export interface CatalogPage extends PublishedData {total:number;limit:number;offset:number;facets:{cities:string[];categories:string[]}}

export interface DiscoveryPage extends Omit<CatalogPage,'places'> {places: import('./types').DisplayPlace[];unlocated: import('./recommendations').Recommendation[]}
