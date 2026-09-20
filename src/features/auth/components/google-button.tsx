"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC04"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.29a12 12 0 0 0 0 10.78l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.59 1.79l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.29 6.61l4 3.11C6.23 6.87 8.88 4.75 12 4.75Z"
      />
    </svg>
  );
}

/** FR-01.2 — เข้าสู่ระบบด้วย Google */
export function GoogleButton({ next }: { next?: string }) {
  const [loading, setLoading] = React.useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full gap-3 rounded-[9px] text-[14px] font-medium"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await authClient.signIn.social({
          provider: "google",
          callbackURL: next || "/dashboard",
        });
        setLoading(false);
      }}
    >
      {loading ? <Loader2 className="size-[18px] animate-spin" /> : <GoogleIcon />}
      เข้าสู่ระบบด้วยบัญชี Google
    </Button>
  );
}
