// Theme: "system" (default) | "light" | "dark". Tailwind runs in class mode
// (darkMode: "class"), and the pre-paint script in index.html applies the class
// before first paint to avoid a flash. This module keeps it in sync at runtime,
// re-applying when the OS theme flips while in "system" mode.
//
// Storage: localStorage.theme = "light" | "dark", or absent to follow the system.

const KEY = "theme";
const mq = window.matchMedia("(prefers-color-scheme: dark)");

export function getTheme() {
  return localStorage.getItem(KEY) || "system";
}

export function isDark(theme = getTheme()) {
  return theme === "dark" || (theme === "system" && mq.matches);
}

export function applyTheme() {
  const dark = isDark();
  document.documentElement.classList.toggle("dark", dark);
  // Keep the iOS status-bar / browser chrome colour in step with the theme.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#020617" : "#f8fafc");
}

export function setTheme(theme) {
  if (theme === "system") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, theme);
  applyTheme();
}

export function initTheme() {
  mq.addEventListener?.("change", () => {
    if (getTheme() === "system") applyTheme();
  });
  applyTheme();
}
