export interface WebsiteSource {
  commentId: number; author: string | null; date: string; url: string; discussionUrl: string;
  recommendedUrl: string; reason: string; quote: string | null; kind:string; appeal:string[];
}
export interface Website {
  id: string; name: string; url: string; hostname: string; state: 'draft' | 'approved';
  sourceCount: number; recommendations: WebsiteSource[];
  linkCheck: {checkedAt: string; status: number | null; finalUrl: string | null; error: string | null} | null;
}
export interface WebsitesPage {total: number; limit: number; offset: number; websites: Website[]; notice: string}
