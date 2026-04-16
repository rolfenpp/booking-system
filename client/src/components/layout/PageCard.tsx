import { Card, CardContent, Typography, Stack, type CardProps } from "@mui/material";
import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
} & Pick<CardProps, "variant">;

export function PageCard({ title, subtitle, children, variant = "outlined" }: Props) {
  return (
    <Card variant={variant} sx={{ mb: 2 }}>
      <CardContent>
        <Stack spacing={2}>
          <div>
            <Typography variant="h5" component="h1" gutterBottom>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </div>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}
