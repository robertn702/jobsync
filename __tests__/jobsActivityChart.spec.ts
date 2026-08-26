import {
  buildDonutSlices,
  arcLabelLines,
  OTHER_SLICE_ID,
} from "@/components/dashboard/jobsActivityChart";

describe("buildDonutSlices", () => {
  const activities = [
    { label: "Jobsync", hours: 28.1 },
    { label: "Side Project 1", hours: 9.2 },
    { label: "Learning", hours: 8.6 },
  ];

  it("assigns one fixed hue per rank in light mode", () => {
    const slices = buildDonutSlices(activities, 0, "light");

    expect(slices.map((s) => s.color)).toEqual([
      "#2a9d90",
      "#c97e22",
      "#6d4fc7",
    ]);
  });

  it("uses the dark palette in dark mode", () => {
    const slices = buildDonutSlices(activities, 0, "dark");

    expect(slices.map((s) => s.color)).toEqual([
      "#16a89a",
      "#c08438",
      "#8b72e8",
    ]);
  });

  it("keeps each activity's label, hours and identity", () => {
    const slices = buildDonutSlices(activities, 0, "light");

    expect(slices).toHaveLength(3);
    expect(slices[0]).toMatchObject({
      id: "Jobsync",
      label: "Jobsync",
      value: 28.1,
    });
  });

  it("appends a grey Other slice when there are leftover hours", () => {
    const slices = buildDonutSlices(activities, 17.5, "light");

    expect(slices).toHaveLength(4);
    expect(slices[3]).toEqual({
      id: OTHER_SLICE_ID,
      label: "Other",
      value: 17.5,
      color: "#94a3b8",
    });
  });

  it("omits the Other slice when there are no leftover hours", () => {
    const slices = buildDonutSlices(activities, 0, "light");

    expect(slices.some((s) => s.id === OTHER_SLICE_ID)).toBe(false);
  });

  it("drops activities with no logged hours", () => {
    const slices = buildDonutSlices(
      [
        { label: "Jobsync", hours: 4 },
        { label: "Learning", hours: 0 },
      ],
      0,
      "light",
    );

    expect(slices.map((s) => s.label)).toEqual(["Jobsync"]);
  });

  it("returns nothing when there is no activity at all", () => {
    expect(buildDonutSlices([], 0, "light")).toEqual([]);
  });
});

describe("arcLabelLines", () => {
  it("splits the name and the hours onto separate lines", () => {
    expect(
      arcLabelLines({
        id: "Jobsync",
        label: "Jobsync",
        value: 28.1,
        color: "#2a9d90",
      }),
    ).toEqual(["Jobsync", "28.1h"]);
  });

  it("trims a long activity name so it cannot run off the card", () => {
    expect(
      arcLabelLines({
        id: "x",
        label: "Interview Preparation Deep Dive",
        value: 4,
        color: "#2a9d90",
      }),
    ).toEqual(["Interview Prepa…", "4h"]);
  });
});
