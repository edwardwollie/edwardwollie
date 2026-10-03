import type {Metadata,Viewport} from "next";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/barlow-condensed/latin-900.css";
import "@fontsource-variable/inter/wght.css";
import "./base.css";

export const metadata:Metadata={
  metadataBase:new URL("https://hunt.flexzonicgames.com"),
  title:"Wildfront Horizon 3D | Flexzonic Games",
  description:"A full 3D hunting experience: track living wildlife across five blueprint-built reserves with real ballistics, wind and scent, optics, tracking sign, recovery and a trophy lodge.",
  manifest:"/manifest.webmanifest",
  icons:{icon:"/icon.svg"},
  openGraph:{title:"Wildfront Horizon 3D",description:"Track. Stalk. Steady. Respect the wild.",images:["/og.png"]},
  twitter:{card:"summary_large_image",images:["/og.png"]}
};
export const viewport:Viewport={width:"device-width",initialScale:1,maximumScale:1,userScalable:false,themeColor:"#07131f",viewportFit:"cover"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
