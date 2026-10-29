import { m } from '@/paraglide/messages';
import { SsoView } from '@/views/auth';

export function SsoPage() {
  return (
    <>
      <title>{m.login()}</title>
      <SsoView />
    </>
  );
}
