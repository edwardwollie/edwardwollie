import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neon Sports Arena",
  description: "Compete, upgrade, and dominate four futuristic sports across thirty vivid 3D arena matches.",
  metadataBase: new URL("https://sports.flexzonicgames.com"),
  openGraph: { title: "Neon Sports Arena", description: "Compete. Upgrade. Dominate.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "Neon Sports Arena", description: "Compete. Upgrade. Dominate.", images: ["/og.png"] },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#060819" };

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
