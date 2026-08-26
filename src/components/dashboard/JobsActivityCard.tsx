"use client";

import { PieSvgProps, ResponsivePie } from "@nivo/pie";
import { animated } from "@react-spring/web";
import { useTheme } from "next-themes";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobsActivitySummary } from "@/actions/dashboard.actions";
import { usePersistedTabIndex } from "@/hooks/usePersistedTabIndex";
import { APP_CONSTANTS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  ARC_LABEL_TEXT_COLOR,
  arcLabelLines,
  buildDonutSlices,
  DonutSlice,
} from "./jobsActivityChart";

interface JobsActivityCardProps {
  data: {
    label: string;
    summary: JobsActivitySummary;
  }[];
}

type ArcLinkLabelProps = Parameters<
  NonNullable<PieSvgProps<DonutSlice>["arcLinkLabelComponent"]>
>[0];

// nivo renders an arc link label as one <text>, so stacking the hours under
// the name needs a custom component rather than a label formatter.
function ArcLinkLabel({ datum, style }: ArcLinkLabelProps) {
  const [name, hours] = arcLabelLines(datum.data);

  return (
    <animated.g opacity={style.opacity}>
      <animated.path
        fill="none"
        stroke={style.linkColor}
        strokeWidth={style.thickness}
        d={style.path}
      />
      <animated.text
        transform={style.textPosition}
        textAnchor={style.textAnchor}
        dominantBaseline="central"
        fill={style.textColor}
        fontSize={11}
      >
        <tspan x={0} dy="-0.5em">
          {name}
        </tspan>
        <tspan x={0} dy="1.15em" fontWeight={600}>
          {hours}
        </tspan>
      </animated.text>
    </animated.g>
  );
}

export default function JobsActivityCard({ data }: JobsActivityCardProps) {
  const [activeIndex, selectTab] = usePersistedTabIndex(
    APP_CONSTANTS.DASHBOARD_JOBS_ACTIVITY_STORAGE_KEY,
    data.map((item) => item.label),
  );
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "light" ? "light" : "dark";
  const current = data[activeIndex];
  const { jobsApplied, jobsTrend, topActivities, otherHours, totalHours } =
    current.summary;
  const slices = buildDonutSlices(topActivities, otherHours, theme);

  return (
    <Card className="@lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg text-green-600 min-w-0 truncate">
            Jobs &amp; Activity
          </CardTitle>
          <div
            className="flex shrink-0 rounded-md border text-xs"
            data-testid="jobs-activity-toggle-group"
          >
            {data.map((item, index) => (
              <button
                key={item.label}
                onClick={() => selectTab(index)}
                className={cn(
                  "px-2 py-1 transition-colors",
                  index === 0 && "rounded-l-md",
                  index === data.length - 1 && "rounded-r-md",
                  activeIndex === index
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative h-[200px] w-full">
          {slices.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="h-[132px] w-[132px] rounded-full border-[18px] border-muted" />
              <p className="absolute inset-x-0 bottom-0 text-center text-sm text-muted-foreground">
                No activities recorded
              </p>
            </div>
          ) : (
            <ResponsivePie
              data={slices}
              margin={{ top: 26, right: 84, bottom: 26, left: 84 }}
              innerRadius={0.72}
              padAngle={2}
              cornerRadius={2}
              activeOuterRadiusOffset={4}
              colors={{ datum: "data.color" }}
              borderWidth={0}
              enableArcLabels={false}
              enableArcLinkLabels
              arcLinkLabelComponent={ArcLinkLabel}
              arcLinkLabelsThickness={2}
              arcLinkLabelsDiagonalLength={10}
              arcLinkLabelsStraightLength={12}
              arcLinkLabelsTextOffset={4}
              arcLinkLabelsColor={{ from: "data.color" }}
              arcLinkLabelsTextColor={ARC_LABEL_TEXT_COLOR[theme]}
              theme={{
                text: { fontSize: 11 },
                tooltip: {
                  container: { background: "#1e293b", color: "#fff" },
                },
              }}
              tooltip={({ datum }) => (
                <div
                  style={{
                    background: "#1e293b",
                    color: "#fff",
                    padding: "6px 12px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    whiteSpace: "nowrap",
                  }}
                >
                  <strong>{datum.data.label}</strong> — {datum.value}h
                </div>
              )}
            />
          )}
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-px text-center"
            data-testid="jobs-activity-total"
          >
            <span className="text-xl font-bold leading-tight tabular-nums">
              {totalHours}h
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {jobsApplied} {jobsApplied === 1 ? "job" : "jobs"}
            </span>
            {jobsTrend !== 0 && (
              <span
                className={cn(
                  "flex items-center gap-0.5 text-[10px] tabular-nums",
                  jobsTrend > 0 ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {jobsTrend > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {Math.abs(jobsTrend)}%
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
