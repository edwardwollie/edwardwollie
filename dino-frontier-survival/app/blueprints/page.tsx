import type { Metadata } from "next";
import BlueprintViewer from "./BlueprintViewer";

export const metadata: Metadata = {
  title: "Blueprints · Dino Frontier Survival",
  description: "Orthographic 3D blueprints of every ranger, dinosaur and structure in Dino Frontier Survival.",
};

export default function BlueprintsPage() {
  return <BlueprintViewer />;
}
