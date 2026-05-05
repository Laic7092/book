import { reactive } from "vue";

export interface Route {
  name: "bookshelf" | "reader";
  params: Record<string, string>;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, ""); // '/book'

function getAppPath(pathname: string): string {
  if (pathname.startsWith(BASE + "/") || pathname === BASE || pathname === BASE + "/") {
    return pathname.slice(BASE.length) || "/";
  }
  return pathname || "/";
}

function toUrl(appPath: string): string {
  return BASE + appPath;
}

function matchAppPath(appPath: string): Route {
  if (appPath === "/") return { name: "bookshelf", params: {} };
  const m = appPath.match(/^\/reader\/([^/]+)$/);
  if (m) return { name: "reader", params: { bookId: m[1] } };
  return { name: "bookshelf", params: {} };
}

export const currentRoute = reactive<Route>(matchAppPath(getAppPath(window.location.pathname)));

export function navigate(url: string, replace = false) {
  const appPath = url.startsWith("/") ? url : "/" + url;
  if (replace) {
    history.replaceState(null, "", toUrl(appPath));
  } else {
    history.pushState(null, "", toUrl(appPath));
  }
  Object.assign(currentRoute, matchAppPath(appPath));
}

window.addEventListener("popstate", () => {
  Object.assign(currentRoute, matchAppPath(getAppPath(window.location.pathname)));
});
