export interface PilotSource {
  commentId: number;
  author: string | null;
  date: string | null;
  url: string;
  reason: string;
  quote: string | null;
  confidence: 'high' | 'medium' | 'low';
}
export interface PilotPlaceGroup {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  sources: PilotSource[];
}
export interface PilotPreviewData {
  sampled: number;
  usefulComments: number;
  decisions: Record<string, number>;
  groups: PilotPlaceGroup[];
}
export interface PipelineFile {
  path: string;
  bytes: number;
  expectedBytes: number;
  modifiedAt: string;
}
export interface PipelineActivity {
  id: string;
  at: string;
  stage: string;
  message: string;
}
export interface PipelineStatus {
  observedAt: string;
  archive: {
    state: 'waiting' | 'active' | 'idle' | 'complete' | 'failed';
    totalFiles: number;
    completedFiles: number;
    expectedBytes: number;
    receivedBytes: number;
    files: PipelineFile[];
    lastActivityAt: string | null;
    failures: number;
  };
  candidates: { total: number; pending: number; updatedAt: string | null };
  published: number;
  database: {research?:{total:number;located:number;images:number};labeled:number;proposals:number;jobs:{kind:string;state:string;count:number}[];partitions:{path:string;state:string;items:string}[]};
  activity: PipelineActivity[];
}
export interface PipelinePreviewResponse extends PilotPreviewData { pipeline: PipelineStatus }

export interface PipelineRun {
 active_stages?:('collect'|'label'|'enrich')[];
 workers?:Record<'collect'|'label'|'enrich',number>;
 capacities?:Record<'collect'|'label'|'enrich',number>;
 stage_config:{collect:boolean;label:boolean;enrich:boolean};requested_stage:'collect'|'label'|'enrich'|null;
 id:string;from_at:string;to_at:string;state:string;collected:boolean;heartbeat_at:string|null;last_error:string|null;stale:boolean;
 failures:{kind:string;message:string;attempts:number}[];
 issues:{name:string;issues:string[]}[];
 counts:{comments:number;labeled:number;proposals:number;researched:number;located?:number;ready:number};
}
