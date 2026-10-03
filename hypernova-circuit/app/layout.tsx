import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Hypernova Circuit | Full 3D Grand Prix Racing";
const description =
  "Race a full 3D hovercar Grand Prix: six circuits with hills, banked bends, tunnels and a figure-eight bridge, seven AI rivals, slipstream, drifting, ghost laps and upgradeable cars.";

export const metadata: Metadata = {
  metadataBase: new URL("https://racer.flexzonicgames.com"),
  title,
  description,
  applicationName: "Hypernova Circuit",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Hypernova Circuit",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title,
    description,
    type: "website",
    url: "/",
    siteName: "Flexzonic Games",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#050316",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
