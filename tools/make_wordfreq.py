"""Exportiert die 40 000 häufigsten englischen Wörter mit Zipf-Häufigkeit nach app/data/wordfreq-en.json.

Einmalig auszuführen (braucht `pip install wordfreq`). Daten: wordfreq von Robyn Speer, CC BY-SA 4.0.
Format: {"source", "license", "bands": {"<zipf*10>": "wort wort ..."}}
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from wordfreq import top_n_list, zipf_frequency

WORD = re.compile(r"^[a-z]+(?:'[a-z]+)?$")
out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "app" / "data" / "wordfreq-en.json"

bands = defaultdict(list)
for w in top_n_list("en", 40000):
    if WORD.match(w):
        bands[str(round(zipf_frequency(w, "en") * 10))].append(w)

data = {
    "source": "wordfreq (Robyn Speer), https://github.com/rspeer/wordfreq",
    "license": "CC BY-SA 4.0",
    "bands": {k: " ".join(v) for k, v in sorted(bands.items(), key=lambda kv: -int(kv[0]))},
}
out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="\n")
print(out, sum(len(v) for v in bands.values()), "Wörter")
