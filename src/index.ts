import FileType from 'file-type';
import { globby } from 'globby';
import fs from 'graceful-fs';
import junk from 'junk';
import { Buffer } from 'node:buffer';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import pPipe from 'p-pipe';
import replaceExt from 'replace-ext';
import convertToUnixPath from 'slash';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

export interface option {
	destination?: string;
	plugins?: any[];
	glob?: boolean;
}

const handleFile = async (
	sourcePath: string,
	{ destination, plugins = [] }: option
) => {
	if (plugins && !Array.isArray(plugins)) {
		throw new TypeError("The `plugins` option should be an `Array`");
	}

	let data = await readFile(sourcePath);
	data =
		plugins.length > 0
			? ((await pPipe(...plugins)(data)) as any as Buffer)
			: data;

	const { ext } = (await FileType.fromBuffer(data)) || {
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
	if (!Array.isArray(input)) {
		throw new TypeError(`Expected an \`Array\`, got \`${typeof input}\``);
	}

	const unixFilePaths = input.map((path) => convertToUnixPath(path));
	const filePaths = glob
		? await globby(unixFilePaths, { onlyFiles: true })
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

imagemin.buffer = async (input: Buffer, { plugins = [] } = {}) => {
	if (!Buffer.isBuffer(input)) {
		throw new TypeError(`Expected a \`Buffer\`, got \`${typeof input}\``);
	}

	if (plugins.length === 0) {
		return input;
	}

	return pPipe(...plugins)(input);
};
