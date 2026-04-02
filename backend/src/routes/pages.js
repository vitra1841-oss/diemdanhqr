// ============================
// PAGE ROUTES
// ============================

async function fetchPageAsset(request, env, assetPath) {
  const assetRes = await env.ASSETS.fetch(
    new Request(new URL(assetPath, request.url), request)
  );

  if (assetRes.status >= 300 && assetRes.status < 400) {
    const loc = assetRes.headers.get("Location");
    if (loc) {
      return env.ASSETS.fetch(new Request(new URL(loc, request.url), request));
    }
  }

  return assetRes;
}

export async function handlePageRoutes(request, env, url) {
  if (url.pathname === "/admin" || url.pathname === "/adminpanel") {
    return fetchPageAsset(request, env, "/adminpanel.html");
  }

  if (url.pathname === "/students-admin" || url.pathname === "/studentspanel") {
    return fetchPageAsset(request, env, "/studentspanel.html");
  }

  return null;
}
