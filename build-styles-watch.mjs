import { watch } from "node:fs";
import { buildStyles, orderedSources } from "./build-styles.mjs";

let timer = null;

const scheduleBuild = () => {
	if (timer !== null) {
		clearTimeout(timer);
	}
	timer = setTimeout(() => {
		timer = null;
		try {
			buildStyles();
			console.log("[styles] regenerated styles.css");
		} catch (error) {
			console.error("[styles] failed to regenerate styles.css");
			console.error(error);
		}
	}, 75);
};

for (const path of orderedSources) {
	watch(path, scheduleBuild);
}

console.log("[styles] watching src/styles/*.css");
