import {getPool} from './db/connection.ts';
import type {ProcessingMetricsData} from '../shared/metrics.ts';
let cached:Promise<ProcessingMetricsData>|undefined,expires=0;
// Count each saved comment once, even when both products have processed it.
export function processingMetrics():Promise<ProcessingMetricsData>{
 if(cached&&Date.now()<expires)return cached;
 expires=Date.now()+30000;
 cached=getPool().query(`WITH saved AS MATERIALIZED (
  SELECT DISTINCT candidate_id FROM pipeline_run_candidates
 ), processed AS (
  SELECT candidate_id FROM labels UNION SELECT candidate_id FROM font_labels
 ) SELECT
 (SELECT count(*)::int FROM saved) AS collected,
 (SELECT count(*)::int FROM saved s JOIN processed p USING(candidate_id)) AS processed,
 (SELECT count(*)::int FROM pipeline_jobs WHERE state='running' AND locked_until>now() AND kind IN ('label_comment','label_font','resolve_place','extract_month')) AS processing,
 NOT(EXISTS(SELECT 1 FROM pipeline_runs WHERE stage_config @> '{"collect":true}' OR stage_config @> '{"label":true}' OR stage_config @> '{"enrich":true}')
 OR EXISTS(SELECT 1 FROM font_runs WHERE enabled)
 OR EXISTS(SELECT 1 FROM provider_pools WHERE enabled)) AS paused
 `).then(result=>({...result.rows[0],costUsd:419,updatedAt:new Date().toISOString()})).catch(error=>{cached=undefined;throw error;});
 return cached;
}
