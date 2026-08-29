import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const PUBLIC_CANONICAL_HOST = "https://www.tugeocercas.com";

function normalizePath(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  const clean = pathname.replace(/\/+$/, "");
  return clean || "/";
}

function buildCanonicalHref(pathname) {
  const cleanPath = normalizePath(pathname);

  if (cleanPath === "/") {
    return `${PUBLIC_CANONICAL_HOST}/`;
  }

  return `${PUBLIC_CANONICAL_HOST}${cleanPath}`;
}

export default function CanonicalUrl() {
  const location = useLocation();

  useEffect(() => {
    const canonicalHref = buildCanonicalHref(location.pathname);

    let link = document.querySelector('link[rel="canonical"]');

    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }

    link.setAttribute("href", canonicalHref);
  }, [location.pathname]);

  return null;
}