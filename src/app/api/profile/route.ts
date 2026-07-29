import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { renameWorkspace } from '@/lib/users';

/** Renames the signed-in user's active workspace (the label above their ad data). */
export async function PATCH(req: NextRequest) {
  const session = await getSession().catch(() => null);

  if (!session) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  let name: unknown;

  try {
    ({ name } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'A workspace name is required.' }, { status: 400 });
  }

  // The column is VARCHAR(255); truncating here beats a 500 from Postgres.
  const trimmed = name.trim().slice(0, 255);

  // Scoped by membership inside the query, so the session's company id is the only
  // company this can ever touch.
  const updated = await renameWorkspace(session.companyId, session.userId, trimmed).catch(
    (error) => {
      console.error('[profile] rename failed', error);
      return null;
    },
  );

  if (updated === null) {
    return NextResponse.json({ error: 'Could not save the name.' }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, name: trimmed });
}
