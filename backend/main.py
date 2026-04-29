from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
import httpx, hashlib, pathlib
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import psycopg2, psycopg2.extras, os, re, html as htmlmod

ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")]

app = FastAPI(
    title="Gundam TCG Analyzer API",
    docs_url="/docs" if os.environ.get("ENABLE_DOCS") == "true" else None,
    redoc_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)

DB_DSN = os.environ.get("DB_DSN")
if not DB_DSN:
    raise RuntimeError("DB_DSN environment variable is required")

def get_conn():
    return psycopg2.connect(DB_DSN, cursor_factory=psycopg2.extras.RealDictCursor)

# ── Scoring ────────────────────────────────────────────────────────────────────

MAX_LEVEL = 8

def compute_score(card: dict, weights: dict, meta_cache: dict = None) -> float:
    """Compute weighted score for a card.
    meta_cache is a pre-built lookup dict from build_meta_cache().
    Pass None (or empty dict) when no meta pool is available.
    No recursion possible — RTH and DD use O(1) dict lookups into the cache.
    """
    s = 0.0
    cache = meta_cache or {}
    def w(k): return float(weights.get(k) or 0)
    def v(k): return float(card.get(k) or 0)

    # Level/Cost INVERTED — higher weight = prefer lower values
    level = v("level"); cost = v("cost")
    if level > 0: s += w("w_level") * (MAX_LEVEL - level + 1)
    if cost  > 0: s += w("w_cost")  * (MAX_LEVEL - cost  + 1)

    s += w("w_ap") * v("ap")
    s += w("w_hp") * v("hp")

    # Repair — scaled by HP
    kw_repair = v("kw_repair"); hp = v("hp")
    if kw_repair > 0 and hp > 0:
        s += w("w_repair") * (kw_repair * (hp / (hp + kw_repair)))

    s += w("w_breach")         * v("kw_breach")
    s += w("w_support")        * v("kw_support")
    s += w("w_blocker")        * (1 if card.get("kw_blocker") else 0)
    s += w("w_first_strike")   * (1 if card.get("kw_first_strike") else 0)
    s += w("w_high_maneuver")  * (1 if card.get("kw_high_maneuver") else 0)
    s += w("w_suppression")    * (1 if card.get("kw_suppression") else 0)
    s += w("w_draw")           * v("kw_draw")
    s += w("w_discard")        * v("kw_discard")
    s += w("w_cant_attack_player") * (1 if card.get("kw_cant_attack_player") else 0)
    s += w("w_ramp")           * (1 if card.get("kw_ramp") else 0)
    s += w("w_linkable")       * (1 if card.get("kw_linkable") else 0)
    s += w("w_burstable")      * (1 if card.get("kw_burstable") else 0)

    # RTH — O(1) cache lookup, no recursion
    rth_count = v("rth_count")
    rth_lv    = int(v("rth_max_level"))
    rth_hp    = int(v("rth_hp_threshold"))
    if rth_count > 0:
        s += w("w_rth_count") * rth_count
        if rth_lv > 0 and cache.get("avg_level_by_lv"):
            s += w("w_rth_level") * cache["avg_level_by_lv"].get(rth_lv, float(rth_lv))
        if rth_hp > 0 and cache.get("avg_hp_by_hp"):
            s += w("w_rth_hp") * cache["avg_hp_by_hp"].get(rth_hp, float(rth_hp))

    # Direct Damage — O(1) cache lookup, no recursion
    dd = int(v("kw_direct_damage"))
    if dd > 0 and cache.get("avg_score_by_hp"):
        avg_dd_val = cache["avg_score_by_hp"].get(dd, float(dd))
        multiplier = 2.0 if (card.get("card_type") or "").upper() == "UNIT" else 1.0
        s += w("w_direct_damage") * avg_dd_val * multiplier

    # Dependency penalty — applied as an additive offset when card has conditional effects
    # w_dependency_penalty is typically negative (e.g. -2), reducing score for dependent cards
    if card.get("kw_dependent"):
        s += w("w_dependency_penalty")

    return round(s, 2)

def build_meta_cache(meta_pool: list, weights: dict) -> dict:
    """
    Pre-compute all meta-pool derived values once.
    Scores each meta card shallowly (no meta lookups), then builds lookup tables
    keyed by threshold value so compute_score can do O(1) dict lookups.
    Returns a cache dict with keys:
      - avg_score_by_hp[X]  : avg shallow score of meta cards with HP <= X
      - avg_level_by_lv[X]  : avg level of meta cards with level <= X
      - avg_hp_by_hp[X]     : avg HP of meta cards with HP <= X
    """
    if not meta_pool:
        return {"avg_score_by_hp": {}, "avg_level_by_lv": {}, "avg_hp_by_hp": {}}

    # Score every meta card shallowly once
    shallow_scores = {
        c["cardno"]: _score_shallow(c, weights)
        for c in meta_pool
    }

    # Build lookup tables for every threshold value that appears in the data
    hp_values  = sorted(set(int(float(c.get("hp")  or 0)) for c in meta_pool if c.get("hp")))
    lv_values  = sorted(set(int(float(c.get("level") or 0)) for c in meta_pool if c.get("level")))

    avg_score_by_hp = {}
    avg_level_by_lv = {}
    avg_hp_by_hp    = {}

    for threshold in range(1, 10):  # thresholds 1-9 cover all card HP/level values
        # avg shallow score of cards with HP <= threshold
        matching_hp = [c for c in meta_pool if c.get("hp") and float(c["hp"]) <= threshold]
        if matching_hp:
            avg_score_by_hp[threshold] = round(
                sum(shallow_scores[c["cardno"]] for c in matching_hp) / len(matching_hp), 2)
        else:
            avg_score_by_hp[threshold] = float(threshold)  # fallback

        # avg level of cards with level <= threshold
        matching_lv = [c for c in meta_pool if c.get("level") and float(c["level"]) <= threshold]
        if matching_lv:
            avg_level_by_lv[threshold] = round(
                sum(float(c["level"]) for c in matching_lv) / len(matching_lv), 2)
        else:
            avg_level_by_lv[threshold] = float(threshold)

        # avg HP of cards with HP <= threshold
        if matching_hp:
            avg_hp_by_hp[threshold] = round(
                sum(float(c["hp"]) for c in matching_hp) / len(matching_hp), 2)
        else:
            avg_hp_by_hp[threshold] = float(threshold)

    return {
        "avg_score_by_hp": avg_score_by_hp,
        "avg_level_by_lv": avg_level_by_lv,
        "avg_hp_by_hp":    avg_hp_by_hp,
    }


def _score_shallow(card: dict, weights: dict) -> float:
    """Score a card using only static fields — no meta pool lookups. Used when
    building the meta cache to avoid any possibility of recursion."""
    s = 0.0
    def w(k): return float(weights.get(k) or 0)
    def v(k): return float(card.get(k) or 0)

    level = v("level"); cost = v("cost")
    if level > 0: s += w("w_level") * (MAX_LEVEL - level + 1)
    if cost  > 0: s += w("w_cost")  * (MAX_LEVEL - cost  + 1)
    s += w("w_ap") * v("ap")
    s += w("w_hp") * v("hp")

    kw_repair = v("kw_repair"); hp = v("hp")
    if kw_repair > 0 and hp > 0:
        s += w("w_repair") * (kw_repair * (hp / (hp + kw_repair)))

    s += w("w_breach")         * v("kw_breach")
    s += w("w_support")        * v("kw_support")
    s += w("w_blocker")        * (1 if card.get("kw_blocker") else 0)
    s += w("w_first_strike")   * (1 if card.get("kw_first_strike") else 0)
    s += w("w_high_maneuver")  * (1 if card.get("kw_high_maneuver") else 0)
    s += w("w_suppression")    * (1 if card.get("kw_suppression") else 0)
    s += w("w_draw")           * v("kw_draw")
    s += w("w_discard")        * v("kw_discard")
    s += w("w_cant_attack_player") * (1 if card.get("kw_cant_attack_player") else 0)
    s += w("w_ramp")           * (1 if card.get("kw_ramp") else 0)
    s += w("w_linkable")       * (1 if card.get("kw_linkable") else 0)
    s += w("w_burstable")      * (1 if card.get("kw_burstable") else 0)
    return round(s, 2)

def score_breakdown(card: dict, weights: dict, meta_cache: dict = None) -> list:
    rows = []
    cache = meta_cache or {}
    def add(label, val, weight_key, note=""):
        w = float(weights.get(weight_key) or 0)
        val = float(val or 0)
        contrib = round(w * val, 2)
        rows.append({"label": label, "value": val, "weight": w,
                     "contribution": contrib, "note": note})

    level = float(card.get("level") or 0)
    cost  = float(card.get("cost") or 0)
    if level > 0: add("Level (inv)", MAX_LEVEL - level + 1, "w_level", f"Lv.{int(level)} → {MAX_LEVEL - int(level) + 1}")
    if cost  > 0: add("Cost (inv)",  MAX_LEVEL - cost  + 1, "w_cost",  f"Cost {int(cost)} → {MAX_LEVEL - int(cost) + 1}")
    add("AP", card.get("ap") or 0, "w_ap")
    add("HP", card.get("hp") or 0, "w_hp")

    kw_repair = float(card.get("kw_repair") or 0)
    hp        = float(card.get("hp") or 0)
    if kw_repair > 0 and hp > 0:
        rv = kw_repair * (hp / (hp + kw_repair))
        rows.append({"label": "Repair", "value": round(rv, 2),
                     "weight": float(weights.get("w_repair") or 0),
                     "contribution": round(float(weights.get("w_repair") or 0) * rv, 2),
                     "note": f"Repair {int(kw_repair)} on {int(hp)} HP"})

    add("Breach",           card.get("kw_breach") or 0,         "w_breach")
    add("Support",          card.get("kw_support") or 0,        "w_support")
    add("Blocker",          1 if card.get("kw_blocker") else 0,  "w_blocker")
    add("First Strike",     1 if card.get("kw_first_strike") else 0, "w_first_strike")
    add("High-Maneuver",    1 if card.get("kw_high_maneuver") else 0, "w_high_maneuver")
    add("Suppression",      1 if card.get("kw_suppression") else 0, "w_suppression")
    add("Draw",             card.get("kw_draw") or 0,            "w_draw")
    add("Discard",          card.get("kw_discard") or 0,         "w_discard")
    add("Can't Atk Player", 1 if card.get("kw_cant_attack_player") else 0, "w_cant_attack_player")
    add("Ramp",             1 if card.get("kw_ramp") else 0,     "w_ramp")
    add("Linkable",         1 if card.get("kw_linkable") else 0, "w_linkable")
    add("Burstable",        1 if card.get("kw_burstable") else 0,"w_burstable")
    add("Return(Total Units)", card.get("rth_count") or 0,       "w_rth_count")

    rth_lv = int(float(card.get("rth_max_level") or 0))
    rth_hp = int(float(card.get("rth_hp_threshold") or 0))
    if rth_lv > 0:
        av = cache.get("avg_level_by_lv", {}).get(rth_lv, float(rth_lv))
        rows.append({"label":"Return(LVL)","value":av,"weight":float(weights.get("w_rth_level") or 0),
                     "contribution":round(float(weights.get("w_rth_level") or 0)*av,2),
                     "note":f"avg level ≤{rth_lv} from meta ({av})"})
    if rth_hp > 0:
        av = cache.get("avg_hp_by_hp", {}).get(rth_hp, float(rth_hp))
        rows.append({"label":"Return(HP)","value":av,"weight":float(weights.get("w_rth_hp") or 0),
                     "contribution":round(float(weights.get("w_rth_hp") or 0)*av,2),
                     "note":f"avg HP ≤{rth_hp} from meta ({av})"})

    dd = int(float(card.get("kw_direct_damage") or 0))
    if dd > 0:
        av = cache.get("avg_score_by_hp", {}).get(dd, float(dd))
        mult = 2.0 if (card.get("card_type") or "").upper() == "UNIT" else 1.0
        contrib = round(float(weights.get("w_direct_damage") or 0) * av * mult, 2)
        rows.append({"label":"Direct Damage","value":round(av,2),
                     "weight":float(weights.get("w_direct_damage") or 0),
                     "contribution":contrib,
                     "note":f"Deal {dd} dmg | avg score HP≤{dd} = {av} | {'Unit 2×' if mult==2 else '1×'}"})

    if card.get("kw_dependent"):
        w_dep = float(weights.get("w_dependency_penalty") or 0)
        rows.append({"label":"Dependency Penalty","value":1,
                     "weight":w_dep,
                     "contribution":round(w_dep, 2),
                     "note":"Card effect depends on board/trash/hand state"})
    return rows

# ── Helpers ────────────────────────────────────────────────────────────────────

def _bool(c, k): return bool(c.get(k))
def _enrich(card):
    for k in ("kw_blocker","kw_first_strike","kw_high_maneuver","kw_suppression",
              "kw_cant_attack_player","kw_ramp","kw_linkable","kw_burstable","kw_dependent"):
        card[k] = _bool(card, k)
    return card

# ── Cards ──────────────────────────────────────────────────────────────────────

@app.get("/api/cards")
def list_cards(
    card_type: Optional[str] = None,
    color:     Optional[str] = None,
    set_code:  Optional[str] = None,
    search:    Optional[str] = None,
    sort_by:   str = "score",
    # weights passed as query params
    w_level: float=0, w_cost: float=0, w_ap: float=1, w_hp: float=1,
    w_repair: float=1, w_breach: float=1, w_support: float=1,
    w_blocker: float=2, w_first_strike: float=2, w_high_maneuver: float=2,
    w_suppression: float=2, w_draw: float=1, w_discard: float=-1,
    w_rth_count: float=1, w_rth_level: float=1, w_rth_hp: float=1,
    w_direct_damage: float=1, w_cant_attack_player: float=0,
    w_ramp: float=0, w_linkable: float=0, w_burstable: float=0,
    w_dependency_penalty: float=0,
    meta_cardnos: Optional[str] = None,  # comma-separated cardnos for meta pool
):
    weights = dict(w_level=w_level,w_cost=w_cost,w_ap=w_ap,w_hp=w_hp,
        w_repair=w_repair,w_breach=w_breach,w_support=w_support,
        w_blocker=w_blocker,w_first_strike=w_first_strike,w_high_maneuver=w_high_maneuver,
        w_suppression=w_suppression,w_draw=w_draw,w_discard=w_discard,
        w_rth_count=w_rth_count,w_rth_level=w_rth_level,w_rth_hp=w_rth_hp,
        w_direct_damage=w_direct_damage,w_cant_attack_player=w_cant_attack_player,
        w_ramp=w_ramp,w_linkable=w_linkable,w_burstable=w_burstable,
        w_dependency_penalty=w_dependency_penalty)

    where, params = ["1=1"], []
    if card_type: where.append("card_type = %s"); params.append(card_type)
    if color:     where.append("color = %s");     params.append(color)
    if set_code:  where.append("set_code = %s");  params.append(set_code)
    if search:
        where.append("(name ILIKE %s OR effect ILIKE %s OR trait ILIKE %s)")
        params += [f"%{search}%"] * 3

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT * FROM cards WHERE {' AND '.join(where)} ORDER BY cardno", params)
            cards = [_enrich(dict(r)) for r in cur.fetchall()]

    meta_cache = _get_meta_cache(meta_cardnos, weights)
    for c in cards:
        c["score"] = compute_score(c, weights, meta_cache)
    if sort_by == "score":
        cards.sort(key=lambda x: x["score"], reverse=True)
    return cards

@app.get("/api/cards/{cardno}")
def get_card_detail(cardno: str,
    w_level: float=0, w_cost: float=0, w_ap: float=1, w_hp: float=1,
    w_repair: float=1, w_breach: float=1, w_support: float=1,
    w_blocker: float=2, w_first_strike: float=2, w_high_maneuver: float=2,
    w_suppression: float=2, w_draw: float=1, w_discard: float=-1,
    w_rth_count: float=1, w_rth_level: float=1, w_rth_hp: float=1,
    w_direct_damage: float=1, w_cant_attack_player: float=0,
    w_ramp: float=0, w_linkable: float=0, w_burstable: float=0,
    w_dependency_penalty: float=0,
    meta_cardnos: Optional[str] = None,
):
    weights = _weights_from_params(locals())
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM cards WHERE cardno = %s", (cardno,))
            row = cur.fetchone()
    if not row: raise HTTPException(404, "Card not found")
    card = _enrich(dict(row))
    meta_cache = _get_meta_cache(meta_cardnos, weights)
    card["score"] = compute_score(card, weights, meta_cache)
    card["breakdown"] = score_breakdown(card, weights, meta_cache)
    return card

def _weights_from_params(loc):
    keys = ["w_level","w_cost","w_ap","w_hp","w_repair","w_breach","w_support",
            "w_blocker","w_first_strike","w_high_maneuver","w_suppression","w_draw",
            "w_discard","w_rth_count","w_rth_level","w_rth_hp","w_direct_damage",
            "w_cant_attack_player","w_ramp","w_linkable","w_burstable","w_dependency_penalty"]
    return {k: float(loc.get(k) or 0) for k in keys}

def _get_meta_cache(meta_cardnos: Optional[str], weights: dict) -> dict:
    """Fetch meta pool cards and return a pre-built score cache."""
    if not meta_cardnos: return {}
    codes = [c.strip() for c in meta_cardnos.split(",") if c.strip()]
    if not codes: return {}
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM cards WHERE cardno = ANY(%s)", (codes,))
            pool = [_enrich(dict(r)) for r in cur.fetchall()]
    return build_meta_cache(pool, weights)

# ── Bulk card lookup (for deck importer) ──────────────────────────────────────

class CardLookupPayload(BaseModel):
    cardnos: list[str]

@app.post("/api/cards/lookup")
def lookup_cards(payload: CardLookupPayload):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM cards WHERE cardno = ANY(%s)", (payload.cardnos,))
            return {r["cardno"]: _enrich(dict(r)) for r in cur.fetchall()}

# ── Filters ────────────────────────────────────────────────────────────────────

@app.get("/api/filters")
def get_filters():
    with get_conn() as conn:
        with conn.cursor() as cur:
            def distinct(col):
                cur.execute(f"SELECT DISTINCT {col} FROM cards WHERE {col} IS NOT NULL ORDER BY {col}")
                return [r[col] for r in cur.fetchall()]

            # Parse traits — stored as "Trait A / Trait B", split and dedupe
            cur.execute("SELECT trait FROM cards WHERE trait IS NOT NULL")
            trait_set = set()
            for row in cur.fetchall():
                for part in re.split(r'\s*/\s*', row["trait"]):
                    part = part.strip().strip("()")
                    if part:
                        trait_set.add(part)

            return {
                "types":    distinct("card_type"),
                "colors":   distinct("color"),
                "sets":     distinct("set_code"),
                "rarities": distinct("rarity"),
                "traits":   sorted(trait_set),
            }

# ── Deck analyzer ──────────────────────────────────────────────────────────────

class DeckAnalyzePayload(BaseModel):
    entries: list[dict]   # [{cardno, count}]
    weights: dict
    meta_cardnos: list[str] = []

@app.post("/api/deck/analyze")
def analyze_deck(payload: DeckAnalyzePayload):
    # Build meta cache once — used for RTH and Direct Damage lookups across all cards
    meta_pool = []
    if payload.meta_cardnos:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM cards WHERE cardno = ANY(%s)", (payload.meta_cardnos,))
                meta_pool = [_enrich(dict(r)) for r in cur.fetchall()]
    meta_cache = build_meta_cache(meta_pool, payload.weights)

    all_codes = [e["cardno"] for e in payload.entries]
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM cards WHERE cardno = ANY(%s)", (all_codes,))
            card_db = {r["cardno"]: _enrich(dict(r)) for r in cur.fetchall()}

    results, missing = [], []
    total_score, total_cards = 0.0, 0

    for entry in payload.entries:
        code, count = entry["cardno"], entry.get("count", 1)
        card = card_db.get(code)
        if not card:
            missing.append(code)
            continue
        score = compute_score(card, payload.weights, meta_cache)
        contrib = round(score * count, 2)
        total_score += contrib
        total_cards += count
        results.append({
            "cardno": code, "name": card["name"], "color": card.get("color"),
            "card_type": card.get("card_type"), "count": count,
            "score": score, "contribution": contrib,
            "breakdown": score_breakdown(card, payload.weights, meta_cache),
            "level": card.get("level"), "cost": card.get("cost"),
            "ap": card.get("ap"), "hp": card.get("hp"),
        })

    results.sort(key=lambda x: x["contribution"], reverse=True)
    kw_totals = _kw_totals(results)
    return {
        "total_score": round(total_score, 2),
        "total_cards": total_cards,
        "avg_score": round(total_score / total_cards, 2) if total_cards else 0,
        "cards": results, "missing": missing, "keyword_totals": kw_totals,
    }

def _kw_totals(results):
    totals = {}
    kw_keys = ["kw_repair","kw_breach","kw_support","kw_blocker","kw_first_strike",
               "kw_high_maneuver","kw_suppression","kw_draw","kw_discard",
               "kw_direct_damage","kw_cant_attack_player","kw_ramp","kw_linkable","kw_burstable","kw_dependent"]
    return totals

# ── Image cache ───────────────────────────────────────────────────────────────

IMAGE_CACHE_DIR = pathlib.Path("/app/image_cache")
IMAGE_CACHE_DIR.mkdir(exist_ok=True)
IMAGE_SOURCE    = "https://image.optcg.gg/gcg/card-images"

@app.get("/api/images/{cardno}")
async def get_card_image(cardno: str):
    # Sanitize — only allow safe card number patterns
    if not re.match(r'^[A-Z0-9]+-[A-Z0-9]+$', cardno):
        raise HTTPException(400, "Invalid card number format")

    CACHE_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}

    # Serve from cache — check both png and webp
    for ext, mime in [("png", "image/png"), ("webp", "image/webp")]:
        cache_path = IMAGE_CACHE_DIR / f"{cardno}.{ext}"
        if cache_path.exists():
            return FileResponse(cache_path, media_type=mime, headers=CACHE_HEADERS)

    # Not cached — try sources in order
    set_code = cardno.split("-")[0].lower()
    fetch_sources = [
        (f"https://www.gundam-gcg.com/en/images/cards/card/{cardno}.webp", "image/webp"),
        (f"{IMAGE_SOURCE}/{cardno}.png",                                   "image/png"),
        (f"https://tcgtopdecks-hq.com/wp-content/gallery/{set_code}/{cardno}.webp", "image/webp"),
    ]
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:149.0) Gecko/20100101 Firefox/149.0",
        "Accept": "image/webp,image/png,image/*",
        "Referer": "https://tcgtopdecks-hq.com/",
    }
    try:
        async with httpx.AsyncClient(timeout=10, headers=headers, follow_redirects=True) as client:
            for url, mime in fetch_sources:
                resp = await client.get(url)
                if resp.status_code == 200 and resp.headers.get("content-type","").startswith("image"):
                    ext = "webp" if "webp" in mime else "png"
                    cache_path = IMAGE_CACHE_DIR / f"{cardno}.{ext}"
                    cache_path.write_bytes(resp.content)
                    return Response(content=resp.content, media_type=mime, headers=CACHE_HEADERS)
        raise HTTPException(404, "Image not found in any source")
    except httpx.RequestError:
        raise HTTPException(503, "Image source unavailable")

@app.get("/api/health")
def health():
    return {"status": "ok"}
