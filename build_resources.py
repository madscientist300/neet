#!/usr/bin/env python3
"""
build_resources.py -- auto-generate resources.json with tags inferred from filename + chapter.

Usage:
  python build_resources.py
Options:
  --root PATH     resources root (default: resources)
  --out PATH      output file (default: resources.json)
  --prune         remove entries for files no longer present
  --dry           dry-run (print actions, don't write)
  --rules FILE    optional tag rules JSON file (default: tag_rules.json if present)
"""
import os
import json
import argparse
import uuid
import re
from pathlib import Path

# --- Defaults: filename keyword -> tag mappings (lowercase keys -> lowercase tags)
DEFAULT_FILENAME_RULES = {
    "diagram": "diagram",
    "fig": "diagram",
    "figure": "diagram",
    "chart": "chart",
    "table": "table",
    "summary": "summary",
    "notes": "notes",
    "short": "short_notes",
    "mcq": "mcq",
    "pyq": "pyq",
    "ncert": "ncert",
    "flow": "flowchart",
    "pathway": "pathway",
    "lab": "lab",
    "model": "model",
    "map": "map",
    "important": "important",
    "exam": "exam",
    "revision": "revision",
    "lecture": "lecture",
    "solution": "solution",
}

# --- Defaults: chapter folder name (normalized key) -> list of tags
DEFAULT_CHAPTER_RULES = {
    "the_living_world": ["living_world", "introduction"],
    "biological_classification": ["classification", "taxonomy"],
    "plant_kingdom": ["plant_kingdom", "classification"],
    "morphology_of_flowering_plants": ["morphology"],
    "anatomy_of_flowering_plants": ["anatomy"],
    "cell_the_unit_of_life": ["cell", "cell_structure"],
    "cell_cycle_and_cell_division": ["cell_cycle", "mitosis", "meiosis"],
    "photosynthesis_in_higher_plants": ["photosynthesis", "pigments"],
    "respiration_in_plants": ["respiration"],
    "plant_growth_and_development": ["growth", "hormones"],
    "sexual_reproduction_in_flowering_plants": ["reproduction", "flower"],
    "principle_of_inheritance_and_variation": ["genetics", "inheritance"],
    "molecular_basis_of_inheritance": ["dna", "molecular_genetics"],
    "microbes_in_human_welfare": ["microbes", "biotech"],
    "organisms_and_populations": ["population", "organisms"],
    "ecosystem": ["ecosystem", "ecology"],
    "biodiversity_and_conservation": ["biodiversity", "conservation"],
}

IMAGE_EXTS = {"png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "tiff"}
PDF_EXTS = {"pdf"}
VIDEO_EXTS = {"mp4", "mkv", "webm", "mov"}
AUDIO_EXTS = {"mp3", "wav", "m4a"}
OTHER_FILE_EXTS = {"doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "md", "zip", "rar", "csv"}

def detect_type(ext):
    ext = ext.lower().lstrip('.')
    if ext in PDF_EXTS:
        return "pdf"
    if ext in IMAGE_EXTS:
        return "image"
    if ext in VIDEO_EXTS:
        return "video"
    if ext in AUDIO_EXTS:
        return "audio"
    if ext in OTHER_FILE_EXTS:
        return "file"
    return "file"

def make_id():
    return uuid.uuid4().hex[:8]

def load_existing(out_path: Path):
    if not out_path.exists():
        return {}
    try:
        data = json.loads(out_path.read_text(encoding="utf-8"))
        by_file = { item.get("file"): item for item in data if isinstance(item, dict) and item.get("file")}
        return by_file
    except Exception as e:
        print(f"Warning: could not read existing resources.json ({e}). Starting fresh.")
        return {}

def normalize_chapter_key(name: str):
    # normalize chapter folder name to a stable key used by DEFAULT_CHAPTER_RULES and user rules:
    if not name:
        return ""
    k = name.strip().lower()
    k = re.sub(r'[\s\-]+', '_', k)       # spaces/hyphens -> underscore
    k = re.sub(r'[^0-9a-z_]', '', k)     # remove other punctuation
    return k

def read_tag_rules(rules_path: Path):
    # returns dicts filename_rules (keys lowercased) and chapter_rules (normalized keys)
    if not rules_path or not rules_path.exists():
        # return copies to avoid accidental mutation
        return DEFAULT_FILENAME_RULES.copy(), DEFAULT_CHAPTER_RULES.copy()
    try:
        j = json.loads(rules_path.read_text(encoding="utf-8"))
        fr_raw = j.get("filename_rules", {})
        cr_raw = j.get("chapter_rules", {})
        # filename rules: lower keys -> tag or list
        fr = {}
        for k,v in fr_raw.items():
            if not k: continue
            fr[k.lower()] = v
        # chapter rules: normalize keys to match normalize_chapter_key
        cr = {}
        for k,v in cr_raw.items():
            if not k: continue
            cr[ normalize_chapter_key(k) ] = v if isinstance(v, list) else [v]
        # merge with defaults (custom rules override/extend)
        filename_rules = DEFAULT_FILENAME_RULES.copy()
        filename_rules.update(fr)
        chapter_rules = DEFAULT_CHAPTER_RULES.copy()
        chapter_rules.update({kk: (vv if isinstance(vv, list) else [vv]) for kk,vv in cr.items()})
        return filename_rules, chapter_rules
    except Exception as e:
        print(f"Warning: could not parse {rules_path} ({e}). Using defaults.")
        return DEFAULT_FILENAME_RULES.copy(), DEFAULT_CHAPTER_RULES.copy()

def gather_files(root: Path):
    """
    Walk root and return list of dicts with:
      - path_obj (Path)
      - file_rel (string path starting with root.name/..., forward slashes)
      - class, chapter, topic, title, type
    Folder structure assumed:
      resources/<Class>/<Chapter>/<file>
      resources/<Class>/<file>
      resources/<file>
    """
    root = root.resolve()
    found = []
    for dirpath, dirnames, filenames in os.walk(root):
        # skip hidden folders
        dirnames[:] = [d for d in dirnames if not d.startswith('.')]
        for fname in filenames:
            if fname.startswith('.'):
                continue
            p = Path(dirpath) / fname
            try:
                rel = p.relative_to(root)
            except Exception:
                # fallback: make a relative path manually
                rel = Path(os.path.relpath(p, start=root))
            # convert to posix style
            rel_str = str(rel.as_posix())
            parts = rel.parts  # parts under root
            # inference rules:
            # parts: (class, chapter, file) OR (class, file) OR (file)
            if len(parts) >= 3:
                cls = parts[0]
                chapter = parts[1]
            elif len(parts) == 2:
                cls = parts[0]
                chapter = parts[0]   # keep chapter same as class for 2-level layout (intentional)
            elif len(parts) == 1:
                cls = "Unclassed"
                chapter = "Unsorted"
            else:
                cls = "Unclassed"
                chapter = "Unsorted"
            stem = p.stem
            ext = p.suffix.lstrip('.').lower()
            typ = detect_type(ext)
            found.append({
                "path_obj": p,
                "file_rel": f"{root.name}/{rel_str}",
                "class": str(cls),
                "chapter": str(chapter),
                "topic": stem,
                "title": stem,
                "type": typ
            })
    return found

def extract_tags_from_filename(filename, filename_rules):
    """Return set of tags found by matching rules in filename (case-insensitive)."""
    if not filename:
        return set()
    tokens = re.split(r'[^0-9a-zA-Z]+', filename.lower())
    tokens = [t for t in tokens if t]
    found = set()
    lower_name = filename.lower()
    for key, tag in filename_rules.items():
        # match either as token or substring (helps for 'diagram1' or 'cell_diagram')
        if key in lower_name or key in tokens:
            if isinstance(tag, list):
                for tv in tag:
                    if tv: found.add(str(tv).lower())
            else:
                found.add(str(tag).lower())
    return found

def extract_tags_from_chapter(chapter, chapter_rules):
    k = normalize_chapter_key(str(chapter))
    vals = chapter_rules.get(k, [])
    return set([v.lower() for v in vals if v])

def merge_tags(existing_tags, auto_tags):
    s = []
    if existing_tags:
        for t in existing_tags:
            if isinstance(t, str) and t.strip():
                s.append(t.strip().lower())
    for t in sorted(auto_tags):
        if t not in s:
            s.append(t)
    # keep unique and stable order
    out = []
    for t in s:
        if t not in out:
            out.append(t)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="resources", help="resources root folder")
    ap.add_argument("--out", default="resources.json", help="output JSON file")
    ap.add_argument("--prune", action="store_true", help="remove entries no longer present")
    ap.add_argument("--dry", action="store_true", help="dry run")
    ap.add_argument("--rules", default="tag_rules.json", help="optional tag rules JSON file")
    args = ap.parse_args()

    root = Path(args.root)
    out_path = Path(args.out)
    rules_path = Path(args.rules) if args.rules else None

    if not root.exists() or not root.is_dir():
        print(f"ERROR: resources root {root} does not exist or is not a directory.")
        return

    filename_rules, chapter_rules = read_tag_rules(rules_path if rules_path and rules_path.exists() else None)
    existing = load_existing(out_path)
    found = gather_files(root)

    new_entries = []
    new_by_file = {}

    for item in found:
        f = item["file_rel"]
        if f in existing:
            base = existing[f].copy()
            base["file"] = f
            base["class"] = base.get("class", item["class"])
            base["chapter"] = base.get("chapter", item["chapter"])
            base["topic"] = base.get("topic", item["topic"])
            base["type"] = base.get("type", item["type"])
            base["title"] = base.get("title", item["title"])
            if "id" not in base or not base["id"]:
                base["id"] = make_id()
            auto_tags = set()
            auto_tags.update(extract_tags_from_filename(item["topic"], filename_rules))
            auto_tags.update(extract_tags_from_chapter(item["chapter"], chapter_rules))
            base["tags"] = merge_tags(base.get("tags", []), auto_tags)
            new_entries.append(base)
            new_by_file[f] = base
        else:
            entry = {
                "id": make_id(),
                "class": item["class"],
                "chapter": item["chapter"],
                "topic": item["topic"],
                "type": item["type"],
                "title": item["title"],
                "file": f,
                "tags": []
            }
            auto_tags = set()
            auto_tags.update(extract_tags_from_filename(item["topic"], filename_rules))
            auto_tags.update(extract_tags_from_chapter(item["chapter"], chapter_rules))
            entry["tags"] = sorted(auto_tags)
            new_entries.append(entry)
            new_by_file[f] = entry

    # if prune is False, keep old entries for missing files (so manual edits remain)
    if not args.prune:
        for f, e in existing.items():
            if f not in new_by_file:
                # keep existing entry as-is
                new_entries.append(e)

    # sort entries for stable output
    def sort_key(x):
        return (str(x.get("class", "")).lower(), str(x.get("chapter", "")).lower(), str(x.get("title", "")).lower())
    new_entries = sorted(new_entries, key=sort_key)

    if args.dry:
        print("--- DRY RUN: The following files are detected and tags inferred ---")
        for e in new_entries:
            print(f"{e.get('file')}\n  tags: {e.get('tags')}\n")
        return

    out_path.write_text(json.dumps(new_entries, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(new_entries)} entries to {out_path}")

if __name__ == "__main__":
    main()
