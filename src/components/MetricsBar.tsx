import { Box, Card, CardContent, Stack, Tooltip, Typography } from '@mui/material';
import { useTasksContext } from '@/context/TasksContext';
import { Metrics } from '@/types';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const content = (
    <Stack spacing={0.5}>
      <Typography variant="overline" color="text.secondary">{label}</Typography>
      <Typography variant="h5" fontWeight={700}>{value}</Typography>
    </Stack>
  );
  return hint ? <Tooltip title={hint}>{content}</Tooltip> : content;
}

const safeFixed = (v: any, digits = 1, fallback = '0') =>
  Number.isFinite(Number(v)) ? Number(Number(v)).toFixed(digits) : fallback;

export default function MetricsBar({ metricsOverride }: { metricsOverride?: Metrics }) {
  const { metrics } = useTasksContext();
  const m = metricsOverride ?? metrics;
  const { totalRevenue, timeEfficiencyPct, revenuePerHour, averageROI, performanceGrade, totalTimeTaken } = m;

  const totalRevenueDisplay = Number.isFinite(Number(totalRevenue)) ? `$${Number(totalRevenue).toLocaleString()}` : '$0';
  const timeEfficiencyDisplay = Number.isFinite(Number(timeEfficiencyPct)) ? `${Math.round(Number(timeEfficiencyPct))}%` : '0%';
  const revenuePerHourDisplay = `$${safeFixed(revenuePerHour, 1, '0.0')}`;
  const averageROIDisplay = safeFixed(averageROI, 1, '0.0');

  return (
    <Card>
      <CardContent>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(5, 1fr)',
            },
          }}
        >
          <Stat label="Total Revenue" value={totalRevenueDisplay} hint="Sum of revenue for Done tasks" />
          <Stat label="Time Efficiency" value={timeEfficiencyDisplay} hint="(Done / All) * 100" />
          <Stat label="Revenue / Hour" value={revenuePerHourDisplay} hint="Total revenue divided by total time" />
          <Stat label="Average ROI" value={averageROIDisplay} hint="Mean of valid ROI values" />
          <Stat label="Grade" value={`${performanceGrade ?? '—'}`} hint={`Based on Avg ROI (${averageROIDisplay}) • Total time ${totalTimeTaken ?? 0}h`} />
        </Box>
      </CardContent>
    </Card>
  );
}
