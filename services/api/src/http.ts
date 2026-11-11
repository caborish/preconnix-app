// Shared HTTP helpers: RFC 9457 problems and payload-free audit events.
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StaffRole } from './auth.ts';
import type { Tx } from './db/database.ts';

export function problem(reply: FastifyReply, status: number, code: string, title: string, extra: Record<string, unknown> = {}) {
  return reply
    .code(status)
    .type('application/problem+json')
    .send({ type: `https://api.preconnix.com/problems/${code.replace(/_/g, '-')}`, title, status, code, requestId: reply.request.id, ...extra });
}

export async function audit(tx: Tx, req: FastifyRequest, action: string, resourceType: string, resourceId: string | null, outcome: string, actorType: 'user' | 'admin' = 'user') {
  await tx.query(
    'INSERT INTO audit.events (actor_type, actor_ref, action, resource_type, resource_id, outcome, request_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [actorType, req.userId, action, resourceType, resourceId, outcome, req.id]
  );
}

/** Staff-only guard. Sends 403 and returns false when the caller has none of `roles`. */
export function requireRole(req: FastifyRequest, reply: FastifyReply, ...roles: StaffRole[]) {
  if (roles.some(r => req.roles?.includes(r))) return true;
  problem(reply, 403, 'forbidden_role', 'Not allowed for your role');
  return false;
}
