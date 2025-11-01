import re
import nbformat
from nbconvert import PythonExporter
from pathlib import Path

# === SETTINGS ===
NOTEBOOK_FILE = "py_process.ipynb"   # <-- Change this to your notebook name
OUTPUT_FILE = Path(NOTEBOOK_FILE).with_suffix(".py")

# === LOAD NOTEBOOK ===
with open(NOTEBOOK_FILE, "r", encoding="utf-8") as f:
    nb = nbformat.read(f, as_version=4)

# === CONVERT TO PYTHON SCRIPT ===
exporter = PythonExporter()
source, _ = exporter.from_notebook_node(nb)

# === REMOVE COMMENTS AND MARKDOWN ===
# First, remove triple-quoted blocks (both '''...''' and """...""")
# Matches multi-line docstrings and block comments
clean_code = re.sub(r"(?s)(['\"]{3}).*?\1", "", source)

# Then remove single-line comments (lines starting with #)
lines = [
    line for line in clean_code.splitlines()
    if not line.strip().startswith("#")
]

clean_code = "\n".join(lines)

# === STRIP EMPTY LINES ===
clean_code = "\n".join(
    [line for line in clean_code.splitlines() if line.strip()]
)

# === SAVE CLEANED PYTHON FILE ===
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    f.write(clean_code)

print(f" Clean Python script saved to: {OUTPUT_FILE}")