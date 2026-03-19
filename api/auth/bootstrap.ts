import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function json(res: VercelResponse, status: number, payload: Record<string, unknown>) {
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	return res.status(status).json(payload);
}

function safeError(error: unknown) {
	if (!error) return null;
	if (typeof error === "string") return { message: error };
	if (typeof error === "object") {
		const err = error as Record<string, unknown>;
		return {
			message: typeof err.message === "string" ? err.message : String(error),
			code: typeof err.code === "string" ? err.code : undefined,
			details: typeof err.details === "string" ? err.details : undefined,
			hint: typeof err.hint === "string" ? err.hint : undefined,
			status: typeof err.status === "number" ? err.status : undefined,
		};
	}
	return { message: String(error) };
}

function getBearerToken(req: VercelRequest) {
	const raw = String(req.headers.authorization || "").trim();
	if (!raw.toLowerCase().startsWith("bearer ")) return null;
	const token = raw.slice(7).trim();
	return token || null;
}

function appendAuthCookies(
	res: VercelResponse,
	accessToken: string,
	refreshToken: string,
	expiresIn: number
) {
	res.setHeader("Set-Cookie", [
		`tg_at=${accessToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${expiresIn}`,
		`tg_rt=${refreshToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
	]);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	const buildTag = "auth-bootstrap-prod-hotfix-v1";

	if (req.method === "OPTIONS") {
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
		res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
		return res.status(204).end();
	}

	if (req.method !== "POST") {
		return json(res, 405, {
			ok: false,
			build_tag: buildTag,
			error_code: "METHOD_NOT_ALLOWED",
		});
	}

	try {
		const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
		const supabaseAnonKey =
			process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

		if (!supabaseUrl || !supabaseAnonKey) {
			console.error("[/api/auth/bootstrap] missing env", {
				buildTag,
				hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
				hasSupabaseAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
				hasViteSupabaseUrl: Boolean(process.env.VITE_SUPABASE_URL),
				hasViteSupabaseAnonKey: Boolean(process.env.VITE_SUPABASE_ANON_KEY),
			});
			return json(res, 503, {
				ok: false,
				build_tag: buildTag,
				error_code: "MISSING_ENV",
			});
		}

		const accessToken = getBearerToken(req);
		const refreshToken = String(req.body?.refresh_token || "").trim();
		const expiresInRaw = Number(req.body?.expires_in);
		const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : 3600;

		if (!accessToken || !refreshToken) {
			console.error("[/api/auth/bootstrap] missing tokens", {
				buildTag,
				hasAccessToken: Boolean(accessToken),
				hasRefreshToken: Boolean(refreshToken),
			});
			return json(res, 400, {
				ok: false,
				build_tag: buildTag,
				error_code: "MISSING_TOKENS",
			});
		}

		const supabase = createClient(supabaseUrl, supabaseAnonKey, {
			auth: {
				persistSession: false,
				autoRefreshToken: false,
				detectSessionInUrl: false,
			},
			global: {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			},
		});

		const { data, error } = await supabase.auth.getUser();

		if (error || !data?.user?.id) {
			console.error("[/api/auth/bootstrap] token validation failed", {
				buildTag,
				error: safeError(error),
			});
			return json(res, 401, {
				ok: false,
				build_tag: buildTag,
				error_code: "INVALID_ACCESS_TOKEN",
				error: safeError(error),
			});
		}

		appendAuthCookies(res, accessToken, refreshToken, expiresIn);

		return json(res, 200, {
			ok: true,
			build_tag: buildTag,
			user_id: data.user.id,
			expires_in: expiresIn,
		});
	} catch (error) {
		console.error("[/api/auth/bootstrap] fatal", {
			buildTag,
			error: safeError(error),
		});
		return json(res, 500, {
			ok: false,
			build_tag: buildTag,
			error_code: "FATAL",
			error: safeError(error),
		});
	}
}
