import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const ANDROID_PACKAGE_ID = "com.fenice.geocercas";
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`;
const APP_LINK_ORIGIN = "https://preview.tugeocercas.com";

function getTrackerTarget(search) {
	const incoming = new URLSearchParams(search || "");
	const out = new URLSearchParams();

	["org_id", "lang", "invite_id", "invite_token", "token", "access_token"].forEach((k) => {
		const v = incoming.get(k);
		if (v) out.set(k, v);
	});

	return `/tracker-gps?${out.toString()}`;
}

function buildIntentUrl(targetPath) {
	const clean = String(targetPath || "/tracker-gps").replace(/^\//, "");
	return `intent://preview.tugeocercas.com/${clean}#Intent;scheme=https;package=${ANDROID_PACKAGE_ID};end`;
}

export default function TrackerInviteStart() {
	const location = useLocation();
	const navigate = useNavigate();
	const [showInstall, setShowInstall] = useState(false);
	const [triedOpen, setTriedOpen] = useState(false);

	const isAndroid = useMemo(() => /Android/i.test(String(navigator.userAgent || "")), []);
	const targetPath = useMemo(() => getTrackerTarget(location.search), [location.search]);
	const appLinkUrl = `${APP_LINK_ORIGIN}${targetPath}`;

	useEffect(() => {
		if (!isAndroid || triedOpen) return;

		setTriedOpen(true);
		let hidden = false;

		const onVisibility = () => {
			if (document.hidden) hidden = true;
		};

		document.addEventListener("visibilitychange", onVisibility);

		const timer = window.setTimeout(() => {
			if (!hidden) {
				setShowInstall(true);
			}
		}, 1800);

		window.location.href = buildIntentUrl(targetPath);

		return () => {
			document.removeEventListener("visibilitychange", onVisibility);
			window.clearTimeout(timer);
		};
	}, [isAndroid, triedOpen, targetPath]);

	const openInBrowser = () => {
		navigate(targetPath, { replace: true });
	};

	const openAppLink = () => {
		window.location.href = appLinkUrl;
	};

	return (
		<div className="min-h-screen bg-slate-100 text-slate-900 flex items-center justify-center p-6">
			<div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6">
				<h1 className="text-2xl font-semibold tracking-tight">Tracker Invite</h1>
				<p className="mt-2 text-sm text-slate-600">
					Estamos intentando abrir la app de Geocercas en tu Android.
				</p>

				<div className="mt-5 space-y-3">
					<button
						type="button"
						onClick={openAppLink}
						className="w-full rounded-xl bg-slate-900 text-white px-4 py-3 font-medium"
					>
						Abrir app
					</button>

					{showInstall && (
						<a
							href={PLAY_STORE_URL}
							className="block w-full text-center rounded-xl bg-emerald-600 text-white px-4 py-3 font-medium"
						>
							Instalar app
						</a>
					)}

					<button
						type="button"
						onClick={openInBrowser}
						className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-4 py-3 font-medium"
					>
						Continuar en navegador
					</button>
				</div>
			</div>
		</div>
	);
}
