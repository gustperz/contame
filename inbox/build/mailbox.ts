import { build } from "esbuild";

const dir = (path: string) => decodeURIComponent(new URL(path, import.meta.url).pathname);

/**
 * The shared code the Apps Script mailbox uses, bundled into one global
 * (`var ContameMailbox`), since Apps Script has no modules.
 */
export async function bundleMailboxLib(): Promise<string> {
  const out = await build({
    entryPoints: [dir("../apps-script/lib.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "ContameMailbox",
    platform: "neutral",
    target: "es2019",
    legalComments: "none",
    charset: "utf8",
  });
  return out.outputFiles[0].text;
}

/**
 * Vite plugin: `import parts from "virtual:mailbox-code"` gives what the app
 * needs to hand out the Apps Script project: Code.js, appsscript.json and the
 * bundled shared code (see inbox/apps-script/assemble.ts).
 */
export function mailboxCode() {
  const id = "virtual:mailbox-code";
  return {
    name: "contame-mailbox-code",
    resolveId: (source: string) => (source === id ? `\0${id}` : null),
    async load(resolved: string) {
      if (resolved !== `\0${id}`) return null;
      return [
        `import code from ${JSON.stringify(dir("../apps-script/Code.js") + "?raw")};`,
        `import manifest from ${JSON.stringify(dir("../apps-script/appsscript.json") + "?raw")};`,
        `export default { code, manifest, lib: ${JSON.stringify(await bundleMailboxLib())} };`,
      ].join("\n");
    },
  };
}
