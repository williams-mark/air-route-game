// The achievement list. The ids are also the Steam achievement API names: create each one on the Steamworks partner site with exactly this
// id (A-Z, 0-9 and underscore only, at most 64 characters; enforced by the tests). Do not rename an id once it has shipped.

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
}

/** Distance above which a route counts as long haul, km. */
export const LONG_HAUL_KM = 6000;

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "FIRST_ROUTE", name: "Open for Business", description: "Open a route of your own." },
  { id: "ROUTES_25", name: "Network Builder", description: "Fly 25 routes at the same time." },
  { id: "FLEET_10", name: "Growing Fleet", description: "Have 10 aircraft in your fleet." },
  { id: "FLEET_50", name: "Regional Carrier", description: "Have 50 aircraft in your fleet." },
  { id: "FLEET_100", name: "Major Airline", description: "Have 100 aircraft in your fleet." },
  { id: "SECOND_HUB", name: "Second Base", description: "Unlock a second hub airport." },
  { id: "FIVE_HUBS", name: "Hub Network", description: "Own five hub airports." },
  { id: "FIRST_PROFITABLE_YEAR", name: "In the Black", description: "Finish a full calendar year with a profit." },
  { id: "LONG_HAUL", name: "Long Haul", description: `Fly a route longer than ${LONG_HAUL_KM.toLocaleString("en-US")} km.` },
  { id: "PANDEMIC_SURVIVOR", name: "Through the Storm", description: "Reach 1 January 2021 without going bankrupt, in a game that began before 2020 with the 2020 pandemic switched on." },
  { id: "DISTRESS_RECOVERY", name: "Back from the Brink", description: "Get out of financial distress without going bankrupt." },
  { id: "CAMPAIGN_GRADE_B", name: "Solid Result", description: "Finish a campaign with a grade of B or better." },
  { id: "CAMPAIGN_GRADE_A", name: "Top of the Class", description: "Finish a campaign with grade A." },
];

export const achievementById = (id: string): AchievementDef | undefined => ACHIEVEMENTS.find((a) => a.id === id);
