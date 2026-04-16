import { ThemeProvider as MuiThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { useMemo, type ReactNode } from "react";
import { useTheme } from "../context/ThemeContext";

const lightPalette = {
  mode: "light" as const,
  primary: { main: "#2563eb" },
  background: { default: "#f4f6f8", paper: "#ffffff" },
  divider: "#e5e7eb",
  text: { primary: "#111827", secondary: "#6b7280" },
};

const darkPalette = {
  mode: "dark" as const,
  primary: { main: "#3b82f6" },
  background: { default: "#0f1117", paper: "#171a21" },
  divider: "#2d3340",
  text: { primary: "#f3f4f6", secondary: "#9ca3af" },
};

export function AppMuiProvider({ children }: { children: ReactNode }) {
  const { theme: mode } = useTheme();
  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: mode === "dark" ? darkPalette : lightPalette,
        shape: { borderRadius: 10 },
        typography: {
          fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
        },
        components: {
          MuiAppBar: {
            styleOverrides: {
              root: ({ theme }) => ({
                ...(theme.palette.mode === "dark" && {
                  backgroundColor: theme.palette.background.paper,
                  color: theme.palette.text.primary,
                }),
              }),
            },
          },
        },
      }),
    [mode]
  );

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}
