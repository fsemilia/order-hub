// Fails if the trilingual documentation drifts: same files in docs/{en,pt-BR,it}, a README per
// language, the same limitation ids (F1, R2, …) in every limitations.md, and no broken relative links.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

const LANGS = ["en", "pt-BR", "it"];
const errors = [];

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const sets = Object.fromEntries(
  LANGS.map((l) => [
    l,
    walk(join("docs", l))
      .map((p) => relative(join("docs", l), p))
      .sort(),
  ]),
);
for (const l of LANGS.slice(1)) {
  const missing = sets.en.filter((f) => !sets[l].includes(f));
  const extra = sets[l].filter((f) => !sets.en.includes(f));
  if (missing.length) errors.push(`docs/${l} is missing: ${missing.join(", ")}`);
  if (extra.length) errors.push(`docs/${l} has files not in docs/en: ${extra.join(", ")}`);
}

for (const f of ["README.md", "README.pt-BR.md", "README.it.md"]) {
  if (!existsSync(f)) errors.push(`missing ${f}`);
}

const ids = (l) =>
  [...readFileSync(join("docs", l, "limitations.md"), "utf8").matchAll(/^\|\s*([A-Z]\d+)\s*\|/gm)]
    .map((m) => m[1])
    .join(",");
for (const l of LANGS.slice(1)) {
  if (ids(l) !== ids("en"))
    errors.push(`limitation ids differ: en=[${ids("en")}] ${l}=[${ids(l)}]`);
}

const mdFiles = [
  ...LANGS.flatMap((l) => walk(join("docs", l))),
  "README.md",
  "README.pt-BR.md",
  "README.it.md",
];
for (const f of mdFiles.filter((f) => f.endsWith(".md"))) {
  for (const [, target] of readFileSync(f, "utf8").matchAll(/\]\(([^)#\s]+)[^)]*\)/g)) {
    if (/^https?:/.test(target)) continue;
    if (!existsSync(normalize(join(dirname(f), target))))
      errors.push(`${f}: broken link ${target}`);
  }
}

if (errors.length) {
  console.error("Documentation check failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(
  `Docs OK: ${sets.en.length} files × ${LANGS.length} languages, limitation ids [${ids("en")}]`,
);
