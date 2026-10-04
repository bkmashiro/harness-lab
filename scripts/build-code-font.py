"""Build a small self-hosted code font; not part of the site build."""
from pathlib import Path
import argparse
import urllib.request
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004/Sans/Mono/NotoSansMonoCJKsc-Regular.otf"
parser = argparse.ArgumentParser()
parser.add_argument("--cache", type=Path, required=True)
args = parser.parse_args()
args.cache.mkdir(parents=True, exist_ok=True)
source = args.cache / "NotoSansMonoCJKsc-Regular.otf"
if not source.exists():
    urllib.request.urlretrieve(SOURCE, source)
chars = set("const 请求 = \"读取\"; // 中文注释")
for folder in [ROOT / "src", ROOT / "public" / "design", ROOT / "public" / "build-harness"]:
    for path in folder.rglob("*"):
        if path.suffix in {".ts", ".svelte", ".html", ".json", ".md", ".mjs"}:
            chars.update(path.read_text(encoding="utf-8"))
chars.update((ROOT / "README.md").read_text(encoding="utf-8"))
unicodes = set(map(ord, chars))
for lo, hi in [(0x20, 0x024F), (0x2000, 0x206F), (0x2100, 0x214F), (0x2190, 0x22FF)]:
    unicodes.update(range(lo, hi + 1))
font = TTFont(source)
original_cmap = font.getBestCmap()
requested = unicodes & set(original_cmap)
options = subset.Options()
options.name_IDs = ["*"]
options.name_legacy = True
options.name_languages = ["*"]
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=requested)
subsetter.subset(font)
family = "Harness Code Mono"
postscript = "HarnessCodeMono-Regular"
replacements = {1: family, 2: "Regular", 3: postscript, 4: family + " Regular", 6: postscript, 16: family, 17: "Regular"}
for record in font["name"].names:
    if record.nameID in replacements:
        record.string = replacements[record.nameID].encode(record.getEncoding(), errors="replace")
if "CFF " in font:
    cff = font["CFF "].cff
    cff.fontNames = [postscript]
    top = cff.topDictIndex[0]
    top.FamilyName = family
    top.FullName = family + " Regular"
font.flavor = "woff2"
target = ROOT / "public" / "fonts" / "harness-code-mono.woff2"
target.parent.mkdir(parents=True, exist_ok=True)
font.save(target)
check = TTFont(target)
cmap = check.getBestCmap()
assert requested <= set(cmap), "Subset lost requested glyphs"
assert check["hmtx"].metrics[cmap[ord("中")]][0] == 2 * check["hmtx"].metrics[cmap[ord("M")]][0]
print(f"{target.name}: {target.stat().st_size} bytes, {len(cmap)} codepoints")
print("Family:", check["name"].getDebugName(1))
print("Original copyright:", check["name"].getDebugName(0))
