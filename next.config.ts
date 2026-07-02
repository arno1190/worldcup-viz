import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
	// Pin the workspace root: unrelated lockfiles exist in parent directories.
	turbopack: {
		root: path.join(__dirname),
	},
	outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
