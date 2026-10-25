"""Convert the Colab .npz tables into plain .npy files.

An .npz file is just a zip archive of .npy files. Extracting them lets us open
each array with np.load(..., mmap_mode="r"), so the operating system pages data
in on demand instead of loading ~2 GB into RAM.

Usage:  uv run python scripts/convert_npz.py [--src model_artifacts]
Output: <src>/npy/<table name>/<array name>.npy
"""
import argparse
import shutil
import zipfile
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="model_artifacts")
    src = Path(ap.parse_args().src)

    for npz in sorted(src.glob("*.npz")):
        out_dir = src / "npy" / npz.stem
        out_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(npz) as z:
            for member in z.namelist():
                # Stream-copy in 16 MB blocks: constant memory, no numpy needed.
                with z.open(member) as fin, open(out_dir / member, "wb") as fout:
                    shutil.copyfileobj(fin, fout, 16 * 1024 * 1024)
                print(f"{npz.name}:{member} -> {out_dir / member}")


if __name__ == "__main__":
    main()
