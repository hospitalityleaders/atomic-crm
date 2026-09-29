import { useEffect, useState } from "react";

export type PublicTheme = "light" | "dark" | "system";

function storedTheme(): PublicTheme {
  const value = window.localStorage.getItem("holedo-theme");
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

export function usePublicTheme() {
  const [theme, setThemeState] = useState<PublicTheme>(storedTheme);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root.classList.remove("light", "dark");
      root.classList.add(
        theme === "system" ? (media.matches ? "dark" : "light") : theme,
      );
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = (value: PublicTheme) => {
    window.localStorage.setItem("holedo-theme", value);
    setThemeState(value);
  };

  return { theme, setTheme };
}
