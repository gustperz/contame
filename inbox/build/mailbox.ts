import { build } from "esbuild";
const ENTRY = decodeURIComponent(new URL("../valtown/email.ts", import.meta.url).pathname);

/**
 * The Val Town mailbox as a single readable file: the email handler with the
 * notice parser inlined, so the val has no imports to resolve. The app adds
 * the project settings on top when it copies it.
 */
export async function bundleMailbox(): Promise<string> {
  const out = await build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    legalComments: "none",
    charset: "utf8",
  });
  return out.outputFiles[0].text;
}

/** Vite plugin: `import code from "virtual:mailbox-code"` gives the bundled mailbox. */
export function mailboxCode() {
  const id = "virtual:mailbox-code";
  return {
    name: "contame-mailbox-code",
    resolveId: (source: string) => (source === id ? `\0${id}` : null),
    async load(resolved: string) {
      if (resolved !== `\0${id}`) return null;
      return `export default ${JSON.stringify(await bundleMailbox())};`;
    },
  };
}
