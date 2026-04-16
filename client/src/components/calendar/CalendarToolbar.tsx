import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import { Box, Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";

export type CalendarViewTab = { id: string; label: string };

type Props = {
  views: readonly CalendarViewTab[];
  activeView: string;
  onViewChange: (id: string) => void;
  viewsAriaLabel: string;
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  prevAria: string;
  nextAria: string;
  todayLabel: string;
};

export function CalendarToolbar({
  views,
  activeView,
  onViewChange,
  viewsAriaLabel,
  title,
  onPrev,
  onNext,
  onToday,
  prevAria,
  nextAria,
  todayLabel,
}: Props) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      sx={{
        alignItems: { xs: "stretch", sm: "center" },
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 1,
      }}
    >
      <ToggleButtonGroup
        value={activeView}
        exclusive
        size="small"
        aria-label={viewsAriaLabel}
        onChange={(_, v: string | null) => {
          if (v != null) onViewChange(v);
        }}
      >
        {views.map((v) => (
          <ToggleButton key={v.id} value={v.id} sx={{ textTransform: "none" }}>
            {v.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Stack direction="row" spacing={0.5} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Button size="small" variant="outlined" onClick={onPrev} aria-label={prevAria} sx={{ minWidth: 40, px: 1 }}>
          <ChevronLeft fontSize="small" />
        </Button>
        <Typography
          variant="body2"
          sx={{
            minWidth: { sm: 200 },
            textAlign: "center",
            px: 1,
            fontWeight: 600,
            flex: { xs: "1 1 100%", sm: "0 1 auto" },
            order: { xs: 3, sm: 0 },
          }}
        >
          {title}
        </Typography>
        <Button size="small" variant="outlined" onClick={onNext} aria-label={nextAria} sx={{ minWidth: 40, px: 1 }}>
          <ChevronRight fontSize="small" />
        </Button>
        <Box sx={{ width: { xs: "100%", sm: "auto" }, order: { xs: 4, sm: 0 } }}>
          <Button size="small" variant="contained" onClick={onToday} fullWidth sx={{ sm: { width: "auto" } }}>
            {todayLabel}
          </Button>
        </Box>
      </Stack>
    </Stack>
  );
}
