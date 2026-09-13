import React from "react";
import { render, screen } from "@testing-library/react";
import { MatchDetails } from "@/components/automations/MatchDetails";
import type { JobMatchData } from "@/models/ai.schemas";

vi.mock("@/components/TipTapContentViewer", () => ({
  TipTapContentViewer: () => <div data-testid="analysis-body" />,
}));

const matchData: JobMatchData = {
  matchScore: 84,
  recommendation: "strong match",
  body: "## Evaluation",
  lane: "frontend_fullstack",
  fitScore: 84,
  pursuitPriority: "top",
};

describe("MatchDetails structured evaluation", () => {
  it("shows the current lane with a readable label", () => {
    render(<MatchDetails matchData={matchData} />);

    expect(screen.getByText("Frontend / full-stack")).toBeInTheDocument();
  });

  it("shows the current pursuit priority", () => {
    render(<MatchDetails matchData={matchData} />);

    expect(screen.getByText("Top priority")).toBeInTheDocument();
  });

  it("keeps legacy match data backward compatible", () => {
    render(
      <MatchDetails
        matchData={{
          matchScore: 72,
          recommendation: "good match",
          body: "Legacy analysis",
        }}
      />,
    );

    expect(screen.getByText("good match")).toBeInTheDocument();
    expect(screen.queryByText(/priority/i)).not.toBeInTheDocument();
  });
});
