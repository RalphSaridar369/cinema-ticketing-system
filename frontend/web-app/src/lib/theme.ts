export type Theme = "dark" | "light";

export const STORAGE_KEY = "velour:v1";

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

// Inline script for the root layout: sets the saved theme before first paint.
export const THEME_SCRIPT = `try{var t=JSON.parse(localStorage.getItem("${STORAGE_KEY}")||"{}").theme;if(t!=="light")t="dark";document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){}`;
