import { isAdminConfigured } from "@/lib/server/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const configured = isAdminConfigured();
  return (
    <div className="mx-auto mt-8 sm:mt-16 max-w-sm border border-hairline bg-surface px-4 sm:px-6 py-8">
      <div className="text-sm tracking-[0.2em] text-gold">LINE</div>
      <div className="mt-1 text-[11px] tracking-[0.18em] text-mute">ADMIN</div>
      {!configured ? <p className="mt-4 text-sm text-ink">admin not configured</p> : null}
      <LoginForm configured={configured} />
    </div>
  );
}
