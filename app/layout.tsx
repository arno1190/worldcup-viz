import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "2026 World Cup — Road to the Final",
	description:
		"An interactive radial bracket of the 2026 FIFA World Cup knockout stage. Hover a nation to trace its road to the final. Live data, refreshed nightly.",
	openGraph: {
		title: "2026 World Cup — Road to the Final",
		description:
			"Interactive radial knockout bracket of the 2026 FIFA World Cup. Live, refreshed nightly.",
		type: "website",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
		>
			<body className="min-h-full flex flex-col">{children}</body>
		</html>
	);
}
