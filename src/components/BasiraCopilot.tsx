import { FloatingChatPanel, type CopilotStatus } from '@/components/FloatingChatPanel';
import { getCredentialStatus } from '@/lib/meta-credentials';
import { getSession } from '@/lib/session';
import { getWorkspace } from '@/lib/users';

/**
 * Mounts the copilot on every screen from the root layout, resolving *server-side* what
 * it is allowed to do: answer questions, or point at the one thing standing in the way.
 *
 * Every lookup is guarded. This renders on the landing page too, and a database blip
 * must not take the whole app down — the copilot just degrades to its signed-out state.
 */
export async function BasiraCopilot() {
  const session = await getSession().catch(() => null);

  if (!session) {
    return <FloatingChatPanel companyId={null} status="signed-out" />;
  }

  const [credential, workspace] = await Promise.all([
    getCredentialStatus(session.companyId, session.userId).catch(() => null),
    getWorkspace(session.companyId, session.userId).catch(() => null),
  ]);

  const status: CopilotStatus =
    credential?.connected && credential.isValid ? 'ready' : 'needs-connection';

  return (
    <FloatingChatPanel
      companyId={session.companyId}
      status={status}
      workspaceName={workspace?.name}
    />
  );
}
