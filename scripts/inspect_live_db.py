import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / 'data' / 'raffle.db'
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
print('participants:', cur.execute('SELECT COUNT(*) FROM participants').fetchone()[0])
print('card_pool_total:', cur.execute('SELECT COUNT(*) FROM card_pool').fetchone()[0])
print('assigned_cards:', cur.execute('SELECT COUNT(*) FROM card_pool WHERE participant_id IS NOT NULL').fetchone()[0])
print('names:', cur.execute('SELECT name FROM participants ORDER BY registered_at LIMIT 20').fetchall())
conn.close()
