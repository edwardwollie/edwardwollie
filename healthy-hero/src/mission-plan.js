export const ZONE_COUNT = 6;
export const QUESTIONS_PER_ZONE = 12;
export const RUN_LENGTH = 6;
export const READING_GRACE_MS = 7000;
export const APPROACH_BY_TIER = [30000, 28000, 26000, 24000, 22000];

export function missionTier(index) {
  return Math.max(0, Math.min(APPROACH_BY_TIER.length - 1, Math.floor(index / ZONE_COUNT)));
}

export function approachForMission(index) {
  return APPROACH_BY_TIER[missionTier(index)];
}

export function missionEncounterIds(index) {
  const startZone = index % ZONE_COUNT;
  const questionIndex = index % QUESTIONS_PER_ZONE;
  return Array.from({ length: RUN_LENGTH }, (_, step) => {
    const zone = (startZone + step) % ZONE_COUNT;
    return zone * QUESTIONS_PER_ZONE + questionIndex;
  });
}
