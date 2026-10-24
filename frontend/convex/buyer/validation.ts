import { contracts } from '../../src/contracts/index.ts';
import type { Contract } from '../../src/contracts/index.ts';
import { fail, type ReadCtx } from './core.ts';
export async function validateLines(ctx: ReadCtx, lines: Contract<'RequestLine'>[]) {
  for (const line of lines) {
    const profile = await ctx.db.query('categoryProfiles').withIndex('by_profileId_and_version',q=>q.eq('profileId',line.profile.id).eq('version',line.profile.version)).unique();
    if (!profile || profile.category !== line.category) fail('INVALID_INPUT','Unsupported category or profile.');
    if (line.allowedConditions.some(c=>!profile.allowedConditions.includes(c))) fail('INVALID_INPUT','Unsupported product condition.');
    for (const req of line.requirements) {
      const field = profile.fields.find(f=>f.id===req.fieldId);
      if (!field || !field.allowedOperators.includes(req.operator)) fail('INVALID_INPUT','Unsupported requirement field or operator.');
      const rightType = field.kind==='number'?typeof req.value==='number':field.kind==='boolean'?typeof req.value==='boolean':field.kind==='string_array'?Array.isArray(req.value):typeof req.value==='string'||req.operator==='in'&&Array.isArray(req.value);
      if (!rightType || req.unit !== field.unit) fail('INVALID_INPUT','Requirement type or canonical unit is invalid.');
      if (typeof req.value==='number' && (field.minimum!==null&&req.value<field.minimum || field.maximum!==null&&req.value>field.maximum)) fail('INVALID_INPUT','Requirement is outside its supported range.');
      if (field.allowedValues && (Array.isArray(req.value)?req.value:[req.value]).some(v=>typeof v!=='string'||!field.allowedValues!.includes(v))) fail('INVALID_INPUT','Requirement value is unsupported.');
    }
    for (const field of profile.fields) {
      const same=line.requirements.filter(r=>r.fieldId===field.id&&r.strength==='hard');
      const low=same.filter(r=>r.operator==='min').map(r=>Number(r.value));
      const high=same.filter(r=>r.operator==='max').map(r=>Number(r.value));
      const exact=same.filter(r=>r.operator==='equals');
      if (low.length&&high.length&&Math.max(...low)>Math.min(...high) || new Set(exact.map(r=>JSON.stringify(r.value))).size>1) fail('INVALID_INPUT','Requirements contradict each other.');
    }
  }
}
export function parseDraft(data: unknown) { return contracts.DraftView.parse(data); }
