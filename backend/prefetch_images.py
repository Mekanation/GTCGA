#!/usr/bin/env python3
"""
prefetch_images.py — Download all card images and cache locally.
Tries multiple sources in order until one succeeds.

Run inside the backend container:
  docker exec -e DB_DSN=postgresql://gundam:PASSWORD@postgres:5432/gundamtcg \
    gundam-backend python prefetch_images.py

Options:
  --force   Re-download all images even if already cached
"""

import asyncio, os, sys, pathlib
import psycopg2, psycopg2.extras
import httpx

DB_DSN      = os.environ.get("DB_DSN", "postgresql://gundam:gundam@postgres:5432/gundamtcg")
CACHE_DIR   = pathlib.Path("/app/image_cache")
CONCURRENCY = 8
TIMEOUT     = 15
FORCE       = "--force" in sys.argv

def sources(cardno: str) -> list:
    set_code = cardno.split("-")[0].lower()
    return [
        # Source 1: official Bandai CDN (confirmed working)
        (f"https://www.gundam-gcg.com/en/images/cards/card/{cardno}.webp", "gundam-gcg.com"),
        # Source 2: optcg.gg
        (f"https://image.optcg.gg/gcg/card-images/{cardno}.png",          "optcg.gg"),
        # Source 3: tcgtopdecks-hq.com webp gallery
        (f"https://tcgtopdecks-hq.com/wp-content/gallery/{set_code}/{cardno}.webp", "tcgtopdecks-hq.com"),
    ]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:149.0) Gecko/20100101 Firefox/149.0",
    "Accept": "image/webp,image/png,image/*,*/*",
    "Referer": "https://tcgtopdecks-hq.com/",
}

async def fetch_one(client, sem, cardno):
    dest_png  = CACHE_DIR / f"{cardno}.png"
    dest_webp = CACHE_DIR / f"{cardno}.webp"
    if not FORCE and (dest_png.exists() or dest_webp.exists()):
        return cardno, "cached", ""

    async with sem:
        for url, label in sources(cardno):
            try:
                resp = await client.get(url, timeout=TIMEOUT, follow_redirects=True)
                ct = resp.headers.get("content-type", "")
                if resp.status_code == 200 and "image" in ct:
                    if "webp" in ct or url.endswith(".webp"):
                        dest_webp.write_bytes(resp.content)
                    else:
                        dest_png.write_bytes(resp.content)
                    return cardno, "downloaded", label
            except Exception:
                continue
    return cardno, "not_found", ""

async def main():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    print("Connecting to database...")
    conn = psycopg2.connect(DB_DSN, cursor_factory=psycopg2.extras.RealDictCursor)
    with conn.cursor() as cur:
        cur.execute("SELECT cardno FROM cards ORDER BY cardno")
        cardnos = [r["cardno"] for r in cur.fetchall()]
    conn.close()

    total  = len(cardnos)
    cached = sum(1 for c in cardnos if
                 (CACHE_DIR/f"{c}.png").exists() or (CACHE_DIR/f"{c}.webp").exists())
    print(f"Total: {total}  |  Cached: {cached}  |  To fetch: {total-cached if not FORCE else total}")
    if not FORCE and cached == total:
        print("All cached!"); return

    print(f"\nFetching with {CONCURRENCY} workers, {len(sources('X-0'))} sources per card...\n")
    sem    = asyncio.Semaphore(CONCURRENCY)
    counts = {}
    hits   = {}
    done   = 0

    async with httpx.AsyncClient(headers=HEADERS) as client:
        for coro in asyncio.as_completed([fetch_one(client, sem, c) for c in cardnos]):
            cardno, status, source = await coro
            done += 1
            counts[status] = counts.get(status, 0) + 1
            if source: hits[source] = hits.get(source, 0) + 1

            if status == "downloaded":
                print(f"  [{done:>4}/{total}] ✓  {cardno:<16} via {source}")
            elif status == "not_found":
                print(f"  [{done:>4}/{total}] ✗  {cardno}")

            if done % 50 == 0 or done == total:
                pct = done/total*100
                print(f"\n  [{'█'*int(pct/5)}{'░'*(20-int(pct/5))}] {pct:.0f}%\n")
                sys.stdout.flush()

    all_files  = list(CACHE_DIR.glob("*.png")) + list(CACHE_DIR.glob("*.webp"))
    cache_size = sum(f.stat().st_size for f in all_files)
    print("\n── Summary ──────────────────────────────")
    print(f"  Downloaded:  {counts.get('downloaded',0)}")
    print(f"  Already had: {counts.get('cached',0)}")
    print(f"  Not found:   {counts.get('not_found',0)}")
    print(f"  Cache size:  {cache_size/1024/1024:.1f} MB ({len(all_files)} files)")
    if hits:
        print(f"\n  By source:")
        for s, n in sorted(hits.items(), key=lambda x: -x[1]):
            print(f"    {s:<40} {n}")
    print("─────────────────────────────────────────")

if __name__ == "__main__":
    asyncio.run(main())
