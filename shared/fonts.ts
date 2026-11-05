export const fontContexts=['code','terminal','reading','ui','design','math','other'] as const;
export interface FontRecommendation {
 reason:string;quote:string|null;contexts:string[];features:string[];sourceName:string;
 commentId:number;author:string|null;date:string;url:string;discussionUrl:string;
}
export interface FontFamily {
 id:string;name:string;state:'draft'|'approved'|'rejected';official_url:string|null;license_info:unknown;asset_path:string|null;
 recommendations:FontRecommendation[];
}
export interface FontsPage {total:number;limit:number;offset:number;fonts:FontFamily[];notice:string}
