import { NavLink, Route, Routes } from "react-router-dom";
import { useLocale } from "./context/LocaleContext";
import { useTheme } from "./context/ThemeContext";
import { AdminPage } from "./pages/AdminPage";
import { BookPage } from "./pages/BookPage";

export default function App() {
  const { theme, toggle } = useTheme();
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="app-shell">
      <header className="top-nav">
        <span className="brand">Bookable</span>
        <nav className="nav-links" aria-label={t("navAriaMain")}>
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            {t("navBook")}
          </NavLink>
          <NavLink to="/admin" className={({ isActive }) => (isActive ? "active" : "")}>
            {t("navAdmin")}
          </NavLink>
        </nav>
        <div className="nav-actions">
          <div className="lang-toggle" role="group" aria-label={t("navAriaLang")}>
            <button
              type="button"
              className={locale === "en" ? "is-active" : ""}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={locale === "sv" ? "is-active" : ""}
              onClick={() => setLocale("sv")}
            >
              SV
            </button>
          </div>
          <button type="button" className="theme-toggle" onClick={toggle} aria-label={theme === "light" ? t("navThemeDark") : t("navThemeLight")}>
            {theme === "light" ? t("navThemeDark") : t("navThemeLight")}
          </button>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<BookPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  );
}
