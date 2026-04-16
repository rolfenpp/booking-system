import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import { AppBar, Box, Button, Container, IconButton, Stack, ToggleButton, ToggleButtonGroup, Toolbar, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { NavLink, Route, Routes, useMatch } from "react-router-dom";
import { useLocale } from "./context/LocaleContext";
import { useTheme } from "./context/ThemeContext";
import { AdminPage } from "./pages/AdminPage";
import { BookPage } from "./pages/BookPage";

const NAV_MAX_WIDTH = 1120;

function NavLinkItem({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  const match = useMatch({ path: to, end: !!end });
  return (
    <Button
      component={NavLink}
      to={to}
      end={end}
      disableElevation
      disableRipple
      sx={(theme) => ({
        textTransform: "none",
        fontWeight: 600,
        fontSize: "0.92rem",
        px: 1.25,
        py: 0.65,
        borderRadius: 2,
        minWidth: 0,
        color: match ? theme.palette.primary.main : theme.palette.text.secondary,
        bgcolor: match ? alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.1 : 0.15) : "transparent",
        boxShadow: "none",
        "&:hover": {
          bgcolor: match
            ? alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.16 : 0.22)
            : alpha(theme.palette.text.primary, theme.palette.mode === "light" ? 0.06 : 0.08),
          boxShadow: "none",
        },
      })}
    >
      {children}
    </Button>
  );
}

export default function App() {
  const { theme, toggle } = useTheme();
  const { locale, setLocale, t } = useLocale();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: "background.default",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Toolbar
          disableGutters
          sx={{
            maxWidth: NAV_MAX_WIDTH,
            mx: "auto",
            width: "100%",
            px: { xs: 2, sm: 3 },
            py: { xs: 1.25, sm: 1.5 },
            minHeight: { xs: 56, sm: 64 },
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            columnGap: 1,
          }}
        >
          <Typography
            variant="h6"
            component="span"
            sx={{
              fontWeight: 700,
              fontSize: { xs: "1.05rem", sm: "1.15rem" },
              letterSpacing: "-0.02em",
              color: "text.primary",
              justifySelf: "start",
            }}
          >
            Bookable
          </Typography>

          <Stack
            direction="row"
            spacing={0.25}
            component="nav"
            aria-label={t("navAriaMain")}
            sx={{ alignItems: "center", justifySelf: "center" }}
          >
            <NavLinkItem to="/" end>
              {t("navBook")}
            </NavLinkItem>
            <NavLinkItem to="/admin">{t("navAdmin")}</NavLinkItem>
          </Stack>

          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", justifySelf: "end", flexWrap: "wrap" }}>
            <ToggleButtonGroup
              value={locale}
              exclusive
              size="small"
              aria-label={t("navAriaLang")}
              onChange={(_, v: "en" | "sv" | null) => {
                if (v != null) setLocale(v);
              }}
              sx={(theme) => ({
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                overflow: "hidden",
                "& .MuiToggleButtonGroup-grouped": {
                  border: 0,
                  borderRadius: "0 !important",
                  px: 1.25,
                  py: 0.35,
                  fontWeight: 600,
                  fontSize: "0.8rem",
                  textTransform: "none",
                  color: "text.secondary",
                  "&.Mui-selected": {
                    bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.12 : 0.2),
                    color: "primary.main",
                    "&:hover": {
                      bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.18 : 0.28),
                    },
                  },
                },
              })}
            >
              <ToggleButton value="en" aria-label={t("navLangEn")}>
                EN
              </ToggleButton>
              <ToggleButton value="sv" aria-label={t("navLangSv")}>
                SV
              </ToggleButton>
            </ToggleButtonGroup>

            <IconButton
              onClick={toggle}
              color="inherit"
              aria-label={theme === "light" ? t("navThemeDark") : t("navThemeLight")}
              size="small"
              sx={{
                color: "text.secondary",
                "&:hover": {
                  bgcolor: (th) => alpha(th.palette.text.primary, th.palette.mode === "light" ? 0.06 : 0.08),
                },
              }}
            >
              {theme === "light" ? <DarkModeOutlined fontSize="small" /> : <LightModeOutlined fontSize="small" />}
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container
        maxWidth={false}
        sx={{
          maxWidth: NAV_MAX_WIDTH,
          px: { xs: 2, sm: 3 },
          py: 3,
        }}
      >
        <Routes>
          <Route path="/" element={<BookPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </Container>
    </Box>
  );
}
