import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dino Frontier Survival",
  description: "Track, defend and evolve across a colorful futuristic dinosaur frontier.",
  metadataBase: new URL("https://frontier.flexzonicgames.com"),
  openGraph: { title: "Dino Frontier Survival", description: "Track. Defend. Evolve.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "Dino Frontier Survival", description: "Track. Defend. Evolve.", images: ["/og.png"] },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#07130f" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
