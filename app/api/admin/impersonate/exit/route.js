import { clearImpersonation } from '../route';

// Thin alias to clear the impersonation cookie via a dedicated path.
// Frontend calls POST /api/admin/impersonate/exit — matches the handoff
// spec even though DELETE /api/admin/impersonate does the same thing.
export async function POST(request) {
  return clearImpersonation(request);
}
