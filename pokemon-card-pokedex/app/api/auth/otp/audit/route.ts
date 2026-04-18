import { NextRequest, NextResponse } from "next/server";
import {
  auditEnabled,
  registerOtpFailure,
  storeOtpAudit,
  verifyOtpAudit,
} from "@/lib/otp-audit";

/**
 * POST /api/auth/otp/audit
 *
 * Endpoint "shadow" que registra en Docker, cifrado, la actividad OTP de la
 * app. Se llama en paralelo a los métodos reales de Supabase (signInWithOtp,
 * verifyOtp) — no los reemplaza.
 *
 * Body: { action, email, code?, purpose? }
 *   action = "send"   → genera y guarda nuestro OTP paralelo cifrado.
 *   action = "verify" → compara `code` contra el hash bcrypt guardado.
 *   action = "failed" → incrementa contador de fallos (cuando Supabase rechaza).
 *
 * Respuestas:
 *   { ok: true, audited: boolean, ... }
 *
 * Best-effort: si DATABASE_URL o OTP_ENCRYPTION_KEY no están configuradas,
 * devuelve { ok: true, audited: false } con status 200. El flujo de login
 * de Supabase no se ve afectado jamás por este endpoint.
 */
export const dynamic = "force-dynamic";

type Body = {
  action?: "send" | "verify" | "failed";
  email?: string;
  code?: string;
  purpose?: "login" | "signup" | "mfa" | "debug";
};

function getClientIp(req: NextRequest): string | null {
  // Vercel pone `x-forwarded-for` con lista "cli, proxy1, proxy2".
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || null;
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return null;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido en el body." },
      { status: 400 }
    );
  }

  const { action, email, code, purpose } = body;

  if (!action || !email) {
    return NextResponse.json(
      { ok: false, error: "Parámetros requeridos: action, email." },
      { status: 400 }
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Email con formato inválido." },
      { status: 400 }
    );
  }

  // Si no hay DATABASE_URL configurada, salimos sin error pero sin auditar.
  if (!auditEnabled()) {
    return NextResponse.json({ ok: true, audited: false, reason: "disabled" });
  }

  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");

  try {
    if (action === "send") {
      const result = await storeOtpAudit({
        email,
        purpose: purpose ?? "login",
        ip,
        userAgent,
      });
      if (!result) {
        return NextResponse.json({
          ok: true,
          audited: false,
          reason: "missing_encryption_key",
          hint:
            "Define OTP_ENCRYPTION_KEY (>=16 chars) en .env.local para activar la auditoría cifrada.",
        });
      }
      return NextResponse.json({
        ok: true,
        audited: true,
        id: result.id,
        expiresAt: result.expiresAt,
        // El código plano sólo viaja de vuelta en dev (NODE_ENV!==production).
        previewCode: result.code,
      });
    }

    if (action === "verify") {
      if (!code) {
        return NextResponse.json(
          { ok: false, error: "Falta `code` para action=verify." },
          { status: 400 }
        );
      }
      const result = await verifyOtpAudit({
        email,
        code,
        purpose: purpose ?? "login",
      });
      if (!result) {
        return NextResponse.json({ ok: true, audited: false });
      }
      return NextResponse.json({
        ok: true,
        audited: true,
        matched: result.matched,
        reason: result.reason,
      });
    }

    if (action === "failed") {
      await registerOtpFailure(email, purpose ?? "login");
      return NextResponse.json({ ok: true, audited: true });
    }

    return NextResponse.json(
      { ok: false, error: `Acción desconocida: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/auth/otp/audit] error:", msg);
    // Nunca 5xx hacia el cliente: este endpoint es ornamental, no bloqueante.
    return NextResponse.json({ ok: true, audited: false, error: msg });
  }
}
