import type { Options } from "tsup";

const config: Options = {
	entry: ["src/index.ts"],
	dts: true,
	sourcemap: false,
	format: ["cjs", "esm"],
	clean: true,
};

export default config;
