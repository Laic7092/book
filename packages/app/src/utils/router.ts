import { reactive, readonly } from "vue";

export interface Route {
  name: "bookshelf" | "reader" | "page";
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
  const readerM = appPath.match(/^\/reader\/([^/]+)$/);
  if (readerM) return { name: "reader", params: { bookId: readerM[1] } };
  const pageM = appPath.match(/^\/page\/([^/]+)$/);
  if (pageM) return { name: "page", params: { pageName: pageM[1] } };
  return { name: "bookshelf", params: {} };
}

const writableRoute = reactive<Route>(matchAppPath(getAppPath(window.location.pathname)));

export const currentRoute = readonly(writableRoute);

export function navigate(url: string, replace = false) {
  const appPath = url.startsWith("/") ? url : "/" + url;
  if (replace) {
    history.replaceState(null, "", toUrl(appPath));
  } else {
    history.pushState(null, "", toUrl(appPath));
  }
  Object.assign(writableRoute, matchAppPath(appPath));
}

window.addEventListener("popstate", () => {
  Object.assign(writableRoute, matchAppPath(getAppPath(window.location.pathname)));
});
