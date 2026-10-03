import { useEffect } from "react";
import type { Game } from "../app/game.ts";
import { GameContext, useUI } from "./common.tsx";
import { Caption, FamilyLab, HubHud, Onboarding, PauseSheet, SettingsSheet, TitleScreen, Toast } from "./screens.tsx";
import { MapUI, Briefing } from "./map.tsx";
import { RushHud } from "./rush.tsx";
import { BuildPanel } from "./build.tsx";
import { LaunchHud } from "./launch.tsx";
import { ActivityHud } from "./activity.tsx";
import { Results } from "./results.tsx";
import { Lounge, Grownups, Training } from "./lounge.tsx";
import { ObservatoryUI } from "./observatory.tsx";
import { StudioUI } from "./studio.tsx";
import { STUDIO_ENABLED } from "../app/features.ts";

function Screen() {
  const screen = useUI((s) => s.screen);
  switch (screen) {
    case "title": return <TitleScreen />;
    case "onboard": return <Onboarding />;
    case "hub": return <HubHud />;
    case "map": return <MapUI />;
    case "brief": return <><MapUI /><Briefing /></>;
    case "rush": return <RushHud />;
    case "build": case "sandbox": return <BuildPanel />;
    case "launch": return <LaunchHud />;
    case "activity": return <ActivityHud />;
    case "results": return <Results />;
    case "lounge": return <><HubHud /><Lounge /></>;
    case "family": return <><HubHud /><FamilyLab /></>;
    case "grownups": return <Grownups />;
    case "training": return <><HubHud /><Training /></>;
    case "observatory": return <ObservatoryUI />;
    case "studio": return STUDIO_ENABLED ? <StudioUI /> : null;
    default: return null;
  }
}

function Overlays() {
  const overlay = useUI((s) => s.overlay);
  if (overlay === "settings") return <SettingsSheet />;
  if (overlay === "pause") return <PauseSheet />;
  return null;
}

function Keys({ game }: { game: Game }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "p") {
        if (game.ui.get().overlay) game.closeOverlay();
        else if (!["title", "onboard"].includes(game.ui.get().screen)) game.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    const onHide = () => { if (document.hidden && ["rush", "activity", "launch"].includes(game.ui.get().screen)) game.pause(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onHide); };
  }, [game]);
  return null;
}

export function App({ game }: { game: Game }) {
  return (
    <GameContext.Provider value={game}>
      <Keys game={game} />
      <Screen />
      <Caption />
      <Toast />
      <Overlays />
    </GameContext.Provider>
  );
}
