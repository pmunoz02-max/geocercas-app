const LOCAL_FALLBACK_ORIGIN = "http://localhost";
const ABSOLUTE_SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

function getCurrentOrigin(): string {
	const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
	return typeof origin === "string" && origin.length > 0
		? origin
		: LOCAL_FALLBACK_ORIGIN;
}

function parseInternalPath(raw: unknown): URL | null {
	if (typeof raw !== "string") return null;

	const value = raw.trim();
	if (!value) return null;

	const lowerValue = value.toLowerCase();
	if (lowerValue.startsWith("javascript:") || lowerValue.startsWith("data:")) {
		return null;
	}

	if (value.startsWith("//") || value.startsWith("/\\") || value.includes("\\")) {
		return null;
	}

	if (ABSOLUTE_SCHEME_RE.test(value)) {
		return null;
	}

	if (!value.startsWith("/")) {
		return null;
	}

	const origin = getCurrentOrigin();

	try {
		const parsed = new URL(value, origin);
		return parsed.origin === origin ? parsed : null;
	} catch {
		return null;
	}
}

export function safeNextPath(raw: unknown, fallback: string): string {
	const safeFallback = parseInternalPath(fallback);
	const parsed = parseInternalPath(raw);

	const target = parsed ?? safeFallback;
	if (!target) return "/";

	return `${target.pathname}${target.search}${target.hash}`;
}

export function isTrackerNextPath(raw: unknown): boolean {
	const parsed = parseInternalPath(raw);
	if (!parsed) return false;

	return parsed.pathname === "/tracker-gps" || parsed.pathname.startsWith("/tracker-gps/");
}
