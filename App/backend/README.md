# AmharicNext backend

## Install

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh   # once, installs uv
cd App/backend
uv sync
```

The model folders (`serving/full`, `serving/default`) are not in git. Create them from the Colab
tables in `model_artifacts/` with:

```bash
uv run python scripts/convert_npz.py
uv run python scripts/export_pruned.py --top-k 0 --min-count-34 1 --out serving/full
```

## Run

```bash
uv run python app.py          # http://0.0.0.0:8000, prints the LAN URL for your phone
uv run pytest -q              # tests
```

`localhost` does not work from a phone: use the printed LAN URL, with the phone on the same Wi-Fi.
Set `AMHARICNEXT_MODEL_DIR=serving/default` to use the 296 MB lite model instead.

## Examples

```bash
curl http://localhost:8000/health

curl -X POST http://localhost:8000/v1/suggest \
  -H 'Content-Type: application/json' \
  -d '{"text": "ኢትዮጵያ ውስጥ የቡና", "k": 5}'
```
