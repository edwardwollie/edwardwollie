import type { Metadata } from "next";
import BlueprintViewer from "./BlueprintViewer";

// Access is private: worker/index.ts only lets /blueprints through with ?key=<BLUEPRINTS_KEY>.
export const metadata: Metadata = {
  title: "Blueprints · Dino Frontier Survival",
  description: "Orthographic 3D blueprints of every ranger, dinosaur and structure in Dino Frontier Survival.",
  robots: { index: false, follow: false },
};

export default function BlueprintsPage() {
  return <BlueprintViewer />;
}
