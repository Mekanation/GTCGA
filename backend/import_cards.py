#!/usr/bin/env python3
"""
import_cards.py — Load Gundam TCG cards into Postgres.
Source: exburst_cards.json (preferred) or Gundam_TCG_Complete_GD01_GD04.xlsx
Run: python import_cards.py
"""
import re, sys, json, html as htmlmod
import psycopg2
from pathlib import Path

JSON_FILE  = "exburst_cards.json"
EXCEL_FILE = "Gundam_TCG_Complete_GD01_GD04.xlsx"
DB_DSN     = os.environ.get("DB_DSN", "postgresql://gundam:gundam@postgres:5432/gundamtcg")
import os; DB_DSN = os.environ.get("DB_DSN", DB_DSN)

def clean(s):
    if not s: return ""
    s = htmlmod.unescape(str(s))
    s = s.replace("<br>","  ").replace("<br/>","  ")
    s = re.sub(r"<[^>]+>","",s)
    return re.sub(r"\s+"," ",s).strip()

def extract_keywords(effect_raw: str) -> dict:
    e = effect_raw or ""
    ce = clean(e)  # cleaned for text matching
    
    # ── Angle-bracket keywords ────────────────────────────────────────────────
    def ab_int(kw):
        m = re.search(rf'<{kw}\s*(\d*)>', e, re.IGNORECASE)
        return int(m.group(1)) if m and m.group(1) else (1 if m else 0)

    repair        = ab_int("Repair")
    breach        = ab_int("Breach")
    support       = ab_int("Support")
    blocker       = bool(re.search(r'<Blocker>',       e, re.IGNORECASE))
    first_strike  = bool(re.search(r'<First Strike>',  e, re.IGNORECASE))
    high_maneuver = bool(re.search(r'<High-Maneuver>', e, re.IGNORECASE))
    suppression   = bool(re.search(r'<Suppression>',   e, re.IGNORECASE))

    # ── Draw / Discard with conditional penalty ───────────────────────────────
    def keyword_value_with_penalty(kw_pattern):
        """Sum keyword values, applying 0.5x if 'If' appears in the same sentence."""
        total = 0.0
        sentences = re.split(r'[.。]', ce)
        for sent in sentences:
            matches = re.findall(kw_pattern, sent, re.IGNORECASE)
            if matches:
                val = sum(int(m) if m else 1 for m in matches)
                has_if = bool(re.search(r'\bIf\b', sent))
                total += val * (0.5 if has_if else 1.0)
        return total

    draw    = keyword_value_with_penalty(r'\bDraw\s+(\d+)')
    discard = keyword_value_with_penalty(r'\bdiscard\s+(\d+)')
    # Fallback: keyword present but no number
    if draw == 0 and re.search(r'\bDraw\b', ce, re.IGNORECASE): draw = 1.0
    if discard == 0 and re.search(r'\bdiscard\b', ce, re.IGNORECASE): discard = 1.0

    # ── RTH ───────────────────────────────────────────────────────────────────
    rth_count = rth_max_level = rth_hp_threshold = 0
    # Level-based RTH
    m = re.search(
        r'Choose\s+(\d+)\s+enemy\s+Unit[s]?[^.]*?Lv\.?\s*(\d+)\s+or\s+lower[^.]*?'
        r'Return\s+it\s+to\s+its\s+owner',
        ce, re.IGNORECASE | re.DOTALL)
    if m:
        rth_count     = int(m.group(1))
        rth_max_level = int(m.group(2))
    # HP-based RTH
    m2 = re.search(
        r'Choose\s+(\d+)\s+enemy\s+Unit[s]?[^.]*?(\d+)\s+or\s+less\s+HP[^.]*?'
        r'Return\s+it\s+to\s+its\s+owner',
        ce, re.IGNORECASE | re.DOTALL)
    if m2:
        rth_count         = max(rth_count, int(m2.group(1)))
        rth_hp_threshold  = int(m2.group(2))
    # Fallback: any RTH
    if rth_count == 0:
        m3 = re.search(r'Choose\s+(\d+)\s+enemy', ce, re.IGNORECASE)
        if m3 and re.search(r'Return\s+it\s+to\s+its\s+owner', ce, re.IGNORECASE):
            rth_count = int(m3.group(1))
            lv = re.search(r'Lv\.?\s*(\d+)\s+or\s+lower', ce, re.IGNORECASE)
            hp = re.search(r'(\d+)\s+or\s+less\s+HP', ce, re.IGNORECASE)
            if lv: rth_max_level    = int(lv.group(1))
            if hp: rth_hp_threshold = int(hp.group(1))

    # ── Direct damage ─────────────────────────────────────────────────────────
    dd_matches = re.findall(r'Deal\s+(\d+)\s+damage', ce, re.IGNORECASE)
    # Apply conditional penalty
    dd_total = 0.0
    sentences = re.split(r'[.。]', ce)
    for sent in sentences:
        dm = re.findall(r'Deal\s+(\d+)\s+damage', sent, re.IGNORECASE)
        if dm:
            val = max(int(x) for x in dm)
            has_if = bool(re.search(r'\bIf\b', sent))
            dd_total += val * (0.5 if has_if else 1.0)
    direct_damage = round(dd_total, 2)

    # ── New boolean keywords ──────────────────────────────────────────────────
    cant_attack_player = bool(re.search(
        r"can't choose the enemy player as its attack target", ce, re.IGNORECASE))
    ramp = bool(re.search(r'[Pp]lace\s+\d+\s+(?:EX\s+)?Resource', ce))
    # Linkable: has 【When Linked】 or [Link:] or similar
    linkable = bool(re.search(r'When Linked|Link[:\]]|\[Link', ce, re.IGNORECASE))
    burstable = bool(re.search(r'\bBurst\b', ce, re.IGNORECASE))

    # Dependency — card keywords conditional on board/trash/hand state
    DEPENDENCY_PATTERNS = [
        r'if there are \d+ or more cards? in your trash',
        r'while there are \d+ or more cards? in your trash',
        r'from your trash',
        r'in your trash',
        r'while you have (another|\d+) (?:or more )?(?:other )?(?:\([^)]+\) )?Units? in play',
        r'while you have a (?:\([^)]+\) )?(?:Link )?Unit in play',
        r'if you have \d+ or more (?:\([^)]+\) )?(?:other )?Units? in play',
        r'for each (?:\([^)]+\) )?(?:card|unit)',
        r'if you have \d+ or more (?:\([^)]+\) )?cards? in your hand',
        r'while you have \d+ or more cards? in your hand',
        r'by an amount equal to',
        r'increase.+?equal to the number of',
    ]
    dependent = any(re.search(p, ce, re.IGNORECASE) for p in DEPENDENCY_PATTERNS)

    return dict(
        kw_repair=repair, kw_breach=breach, kw_support=support,
        kw_blocker=blocker, kw_first_strike=first_strike,
        kw_high_maneuver=high_maneuver, kw_suppression=suppression,
        kw_draw=round(draw,2), kw_discard=round(discard,2),
        rth_count=rth_count, rth_max_level=rth_max_level,
        rth_hp_threshold=rth_hp_threshold,
        kw_direct_damage=direct_damage,
        kw_cant_attack_player=cant_attack_player,
        kw_ramp=ramp, kw_linkable=linkable, kw_burstable=burstable,
        kw_dependent=dependent,
    )

def safe_int(v):
    try: return int(v) if v not in (None,"-","") else None
    except: return None
def safe_float(v):
    try: return float(v) if v not in (None,"-","") else None
    except: return None

TYPE_MAP = {
    "UNIT":"Unit","PILOT":"Pilot","COMMAND":"Command","BASE":"Base",
    "EX BASE":"EX Base","RESOURCE":"Resource","EX RESOURCE":"EX Resource",
    "UNIT TOKEN":"Token","TOKEN":"Token",
}

def load_from_json(path):
    with open(path) as f: raw = json.load(f)
    cards = []
    for c in raw:
        if (c.get('cardno') or '').startswith('GD05'): continue
        raw_effect = c.get('effectdata') or ''
        kw = extract_keywords(raw_effect)
        cardno = c.get('cardno','')
        cards.append(dict(
            cardno=cardno, name=c.get('name',''),
            set_code=cardno.split('-')[0] if '-' in cardno else cardno,
            rarity=c.get('rarity',''),
            card_type=TYPE_MAP.get((c.get('categorydata') or '').upper(), c.get('categorydata')),
            color=c.get('color'), level=safe_int(c.get('level')),
            cost=safe_int(c.get('cost')), ap=safe_int(c.get('apdata')),
            hp=safe_int(c.get('hp')), trait=c.get('trait') or None,
            link_pilot=c.get('link') or None, series=c.get('seriesname') or None,
            market_price=safe_float(c.get('marketprice')),
            effect=clean(raw_effect), **kw
        ))
    return cards

CREATE_CARDS = """
CREATE TABLE IF NOT EXISTS cards (
    cardno TEXT PRIMARY KEY, name TEXT NOT NULL, set_code TEXT, rarity TEXT,
    card_type TEXT, color TEXT, level INTEGER, cost INTEGER, ap INTEGER, hp INTEGER,
    trait TEXT, link_pilot TEXT, series TEXT, market_price NUMERIC(8,2), effect TEXT,
    kw_repair NUMERIC(4,2) DEFAULT 0, kw_breach INTEGER DEFAULT 0,
    kw_support INTEGER DEFAULT 0, kw_blocker BOOLEAN DEFAULT FALSE,
    kw_first_strike BOOLEAN DEFAULT FALSE, kw_high_maneuver BOOLEAN DEFAULT FALSE,
    kw_suppression BOOLEAN DEFAULT FALSE,
    kw_draw NUMERIC(4,2) DEFAULT 0, kw_discard NUMERIC(4,2) DEFAULT 0,
    rth_count INTEGER DEFAULT 0, rth_max_level INTEGER DEFAULT 0,
    rth_hp_threshold INTEGER DEFAULT 0,
    kw_direct_damage NUMERIC(4,2) DEFAULT 0,
    kw_cant_attack_player BOOLEAN DEFAULT FALSE,
    kw_ramp BOOLEAN DEFAULT FALSE, kw_linkable BOOLEAN DEFAULT FALSE,
    kw_burstable BOOLEAN DEFAULT FALSE,
    kw_dependent BOOLEAN DEFAULT FALSE
);
"""

UPSERT = """
INSERT INTO cards (
    cardno,name,set_code,rarity,card_type,color,level,cost,ap,hp,
    trait,link_pilot,series,market_price,effect,
    kw_repair,kw_breach,kw_support,kw_blocker,kw_first_strike,kw_high_maneuver,
    kw_suppression,kw_draw,kw_discard,rth_count,rth_max_level,rth_hp_threshold,
    kw_direct_damage,kw_cant_attack_player,kw_ramp,kw_linkable,kw_burstable,kw_dependent
) VALUES (
    %(cardno)s,%(name)s,%(set_code)s,%(rarity)s,%(card_type)s,%(color)s,
    %(level)s,%(cost)s,%(ap)s,%(hp)s,%(trait)s,%(link_pilot)s,%(series)s,
    %(market_price)s,%(effect)s,
    %(kw_repair)s,%(kw_breach)s,%(kw_support)s,%(kw_blocker)s,%(kw_first_strike)s,
    %(kw_high_maneuver)s,%(kw_suppression)s,%(kw_draw)s,%(kw_discard)s,
    %(rth_count)s,%(rth_max_level)s,%(rth_hp_threshold)s,
    %(kw_direct_damage)s,%(kw_cant_attack_player)s,%(kw_ramp)s,
    %(kw_linkable)s,%(kw_burstable)s,%(kw_dependent)s
) ON CONFLICT (cardno) DO UPDATE SET
    name=EXCLUDED.name,set_code=EXCLUDED.set_code,rarity=EXCLUDED.rarity,
    card_type=EXCLUDED.card_type,color=EXCLUDED.color,level=EXCLUDED.level,
    cost=EXCLUDED.cost,ap=EXCLUDED.ap,hp=EXCLUDED.hp,trait=EXCLUDED.trait,
    link_pilot=EXCLUDED.link_pilot,series=EXCLUDED.series,
    market_price=EXCLUDED.market_price,effect=EXCLUDED.effect,
    kw_repair=EXCLUDED.kw_repair,kw_breach=EXCLUDED.kw_breach,
    kw_support=EXCLUDED.kw_support,kw_blocker=EXCLUDED.kw_blocker,
    kw_first_strike=EXCLUDED.kw_first_strike,kw_high_maneuver=EXCLUDED.kw_high_maneuver,
    kw_suppression=EXCLUDED.kw_suppression,kw_draw=EXCLUDED.kw_draw,
    kw_discard=EXCLUDED.kw_discard,rth_count=EXCLUDED.rth_count,
    rth_max_level=EXCLUDED.rth_max_level,rth_hp_threshold=EXCLUDED.rth_hp_threshold,
    kw_direct_damage=EXCLUDED.kw_direct_damage,
    kw_cant_attack_player=EXCLUDED.kw_cant_attack_player,
    kw_ramp=EXCLUDED.kw_ramp,kw_linkable=EXCLUDED.kw_linkable,
    kw_burstable=EXCLUDED.kw_burstable,kw_dependent=EXCLUDED.kw_dependent;
"""

def main():
    src = JSON_FILE if Path(JSON_FILE).exists() else EXCEL_FILE
    if not Path(src).exists():
        print(f"ERROR: {src} not found"); sys.exit(1)
    cards = load_from_json(src) if src.endswith('.json') else load_from_excel(src)
    print(f"Loaded {len(cards)} cards. Connecting...")
    conn = psycopg2.connect(DB_DSN)
    cur  = conn.cursor()
    print("Creating/updating table schema...")
    cur.execute(CREATE_CARDS)
    # Add new columns if upgrading from old schema
    new_cols = [
        ("rth_hp_threshold", "INTEGER DEFAULT 0"),
        ("kw_direct_damage", "NUMERIC(4,2) DEFAULT 0"),
        ("kw_cant_attack_player", "BOOLEAN DEFAULT FALSE"),
        ("kw_ramp", "BOOLEAN DEFAULT FALSE"),
        ("kw_linkable", "BOOLEAN DEFAULT FALSE"),
        ("kw_burstable", "BOOLEAN DEFAULT FALSE"),
        ("kw_dependent", "BOOLEAN DEFAULT FALSE"),
    ]
    for col, defn in new_cols:
        try:
            cur.execute(f"ALTER TABLE cards ADD COLUMN IF NOT EXISTS {col} {defn}")
        except: pass
    conn.commit()
    print("Importing cards...")
    for card in cards:
        cur.execute(UPSERT, card)
    conn.commit()
    cur.close(); conn.close()
    kw_counts = {}
    for c in cards:
        for k in ["kw_repair","kw_breach","kw_support","kw_blocker","kw_first_strike",
                  "kw_high_maneuver","kw_suppression","kw_burstable","kw_linkable",
                  "kw_ramp","kw_cant_attack_player","kw_direct_damage"]:
            if c.get(k): kw_counts[k] = kw_counts.get(k,0)+1
    print(f"\nDone! {len(cards)} cards imported.")
    print("Keyword stats:")
    for k,v in sorted(kw_counts.items(), key=lambda x:-x[1]):
        print(f"  {k:<28}: {v}")

if __name__ == "__main__":
    main()
