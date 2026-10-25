// Közös segédek a `skill-iro` scriptjeihez: repógyökér, frontmatter-olvasás, leltár.
//
// Zéró függőség, szándékosan. A projekt szabálya, hogy új csomag csak kérdezés után
// kerül be (CLAUDE.md), és a `.claude/` mappa nem tagja egyik build rendszernek sem —
// ide egy YAML-könyvtár nem tud „csak úgy" bekerülni. Ezért a lenti parser a YAML-nek
// azt a szűk részhalmazát ismeri, amit a skill- és agent-frontmatterek használnak:
// egyszerű skalár, blokk-skalár (`|`), sztringlista (`- elem`) és — nyersen, szövegként —
// a beágyazott blokk (`hooks:`). Bármi ezen túl `blocks`-ba kerül, feldolgozatlanul.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A repó gyökere. A hook-bekötésekben látott `${CLAUDE_PROJECT_DIR}` feloldásához is ez kell. */
export const REPO = process.env.CLAUDE_PROJECT_DIR
  ? resolve(process.env.CLAUDE_PROJECT_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export const SKILLS_DIR = join(REPO, ".claude", "skills");
export const AGENTS_DIR = join(REPO, ".claude", "agents");

function stripQuotes(s) {
  const t = String(s).trim();
  const last = t[t.length - 1];
  if (t.length >= 2 && ((t[0] === '"' && last === '"') || (t[0] === "'" && last === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * A fájl elején álló `---` … `---` blokk feldolgozása.
 * @returns {{scalars:Object,lists:Object,blocks:Object,raw:string,fmStart:number,bodyStart:number}|null}
 *          `null`, ha nincs frontmatter. A sorszámok 1-alapúak, hogy hibaüzenetbe mehessenek.
 */
export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return null;

  const fm = lines.slice(1, end);
  const scalars = {};
  const lists = {};
  const blocks = {};
  const keyLines = {};

  for (let i = 0; i < fm.length; i += 1) {
    const m = /^([A-Za-z_][\w-]*):(.*)$/.exec(fm[i]); // csak a 0 behúzású kulcs számít
    if (!m) continue;
    const key = m[1];
    const rest = m[2].trim();
    keyLines[key] = i + 2; // +1 a `---` sor, +1 az 1-alapú számozás

    // A kulcshoz tartozó behúzott blokk összegyűjtése.
    const buf = [];
    let j = i + 1;
    for (; j < fm.length; j += 1) {
      if (fm[j].trim() === "") {
        buf.push("");
        continue;
      }
      if (/^\S/.test(fm[j])) break;
      buf.push(fm[j]);
    }

    if (/^[|>]-?\+?$/.test(rest)) {
      const joiner = rest.startsWith(">") ? " " : "\n";
      scalars[key] = buf.map((l) => l.replace(/^\s+/, "")).join(joiner).trim();
    } else if (rest !== "") {
      scalars[key] = stripQuotes(rest);
    } else if (buf.some((l) => l.trim()) && buf.every((l) => !l.trim() || /^\s*-\s/.test(l))) {
      lists[key] = buf.filter((l) => l.trim()).map((l) => stripQuotes(l.replace(/^\s*-\s*/, "")));
    } else {
      blocks[key] = buf.join("\n");
    }

    i = j - 1;
  }

  return { scalars, lists, blocks, raw: fm.join("\n"), keyLines, bodyStart: end + 2 };
}

function readEntry(kind, name, file) {
  const text = readFileSync(file, "utf8");
  const fm = parseFrontmatter(text);
  const lines = text.split(/\r?\n/);
  return {
    kind, // "skill" | "agent"
    name, // a mappa-, illetve fájlnévből — NEM a frontmatterből
    file,
    dir: dirname(file),
    text,
    lines,
    fm,
    body: fm ? lines.slice(fm.bodyStart - 1).join("\n") : text,
    bodyStart: fm ? fm.bodyStart : 1,
  };
}

/** Minden skill (SKILL.md a `.claude/skills` alatt) és agent (`.md` a `.claude/agents` alatt). */
export function readAll() {
  const out = [];

  if (existsSync(SKILLS_DIR)) {
    for (const dir of readdirSync(SKILLS_DIR)) {
      const file = join(SKILLS_DIR, dir, "SKILL.md");
      if (statSync(join(SKILLS_DIR, dir)).isDirectory() && existsSync(file)) {
        out.push(readEntry("skill", dir, file));
      }
    }
  }

  if (existsSync(AGENTS_DIR)) {
    for (const f of readdirSync(AGENTS_DIR)) {
      if (!f.endsWith(".md")) continue;
      out.push(readEntry("agent", basename(f, ".md"), join(AGENTS_DIR, f)));
    }
  }

  return out;
}

/** Egy bejegyzés leírása egy sorban, üres sorok és többszörös szóköz nélkül. */
export function oneLine(s, max = 0) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return max && t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
