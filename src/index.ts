import fs from "graceful-fs";
import { Buffer } from "node:buffer";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import replaceExt from "replace-ext";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

export interface option {
	destination?: string;
	plugins?: any[];
	glob?: boolean;
}

const handleFile = async (sourcePath: string, opt: option) => {
	const { destination, plugins = [] } = opt;

	if (plugins && !Array.isArray(plugins)) {
		throw new TypeError("The `plugins` option should be an `Array`");
	}

	const pPipe = await import("p-pipe");
	const fileType = await import("file-type");

	let data = await readFile(sourcePath);
	data = await (plugins.length > 0
		? (pPipe.default(...plugins)(data) as Promise<Buffer>)
		: data);

	const { ext } = (await fileType.fileTypeFromBuffer(data)) || {
		ext: path.extname(sourcePath),
	};
	let destinationPath = destination
		? path.join(destination, path.basename(sourcePath))
		: undefined;

	destinationPath =
		ext === "webp" && destinationPath
			? replaceExt(destinationPath, ".webp")
			: destinationPath;

	const returnValue = {
		data,
		sourcePath,
		destinationPath,
	};

	if (!returnValue.destinationPath) {
		return returnValue;
	}

	await fsPromises.mkdir(path.dirname(returnValue.destinationPath), {
		recursive: true,
	});
	await writeFile(returnValue.destinationPath, returnValue.data);

	return returnValue;
};

export default async function imagemin(
	input: string[],
	{ glob = true, ...options }: option = {}
) {
	const globby = await import("globby");
	const slash = await import("slash");
	const junk = await import("junk");

	if (!Array.isArray(input)) {
		throw new TypeError(`Expected an \`Array\`, got \`${typeof input}\``);
	}

	const unixFilePaths = input.map((path) => slash.default(path));

	const filePaths = glob
		? await globby.globby(unixFilePaths, { onlyFiles: true })
		: input;

	return Promise.all(
		filePaths
			.filter((filePath) => junk.isNotJunk(path.basename(filePath)))
			.map(async (filePath) => {
				try {
					return await handleFile(filePath, options);
				} catch (error: any) {
					error.message = `Error occurred when handling file: ${input}\n\n${error.stack}`;
					throw error;
				}
			})
	);
}

imagemin.buffer = async (
	input: Buffer,
	opt: { plugins: any[] } = { plugins: [] }
) => {
	if (!Buffer.isBuffer(input)) {
		throw new TypeError(`Expected a \`Buffer\`, got \`${typeof input}\``);
	}

	if (opt.plugins.length === 0) {
		return input;
	}

	const pPipe = await import("p-pipe");
	return pPipe.default(...opt.plugins)(input) as Promise<Buffer>;
};
