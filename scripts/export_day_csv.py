#!/usr/bin/env python3
"""Export attendance for a specific day from the SQLite database."""

import sqlite3
import csv
import sys
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / 'data' / 'raffle.db'

EVENT_DATES = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-18']
PRETEST_DATE = '2026-10-11'
ALL_DATES = [PRETEST_DATE] + EVENT_DATES

DAY_LABELS = {
    '2026-10-11': 'Pre-test (Oct 11)',
    '2026-10-13': 'Day 1 (Tue Oct 13)',
    '2026-10-14': 'Day 2 (Wed Oct 14)',
    '2026-10-15': 'Day 3 (Thu Oct 15)',
    '2026-10-16': 'Day 4 (Fri Oct 16 - Radical Praise)',
    '2026-10-18': 'Day 6 (Sun Oct 18 - Thanksgiving)',
}

def export_day(date_key: str, output_file: str = None):
    if date_key not in ALL_DATES:
        print(f"Invalid date: {date_key}. Valid dates: {ALL_DATES}")
        return

    if output_file is None:
        label = DAY_LABELS[date_key].replace(' ', '-').replace('(', '').replace(')', '').lower()
        output_file = f"attendance-{label}-{datetime.now().strftime('%Y%m%d')}.csv"

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    query = '''
        SELECT p.id, p.name, p.contact, p.card_code, p.raffle_number,
               p.test_attended, p.invited_by_id, p.registered_at,
               (SELECT GROUP_CONCAT(a.date) FROM attendance a WHERE a.participant_id = p.id) as attended_dates,
               inviter.name as inviter_name
        FROM participants p
        LEFT JOIN participants inviter ON inviter.id = p.invited_by_id
        ORDER BY p.registered_at
    '''
    participants = conn.execute(query).fetchall()

    filtered = []
    for p in participants:
        attended = (p['attended_dates'] or '').split(',') if p['attended_dates'] else []
        attended = [d for d in attended if d in EVENT_DATES]
        test_attended = bool(p['test_attended'])

        if date_key == PRETEST_DATE:
            if test_attended:
                filtered.append((p, attended, test_attended))
        else:
            if date_key in attended:
                filtered.append((p, attended, test_attended))

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            'Name', 'Contact', 'Card Code', 'Raffle Number',
            'Inviter', 'Pre-test (Oct 11)', 'All Attendance Days',
            f'Attended {DAY_LABELS[date_key]}', 'Registered At'
        ])

        for p, attended, test_attended in filtered:
            writer.writerow([
                p['name'], p['contact'] or '', p['card_code'], p['raffle_number'],
                p['inviter_name'] or '', 'Yes' if test_attended else 'No',
                '; '.join(attended) if attended else '—', 'Yes', p['registered_at']
            ])

    print(f"Exported {len(filtered)} attendees to {output_file}")
    conn.close()

def export_all_days():
    for date_key in ALL_DATES:
        export_day(date_key)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python export_day_csv.py <date>          # e.g. 2026-10-18")
        print("  python export_day_csv.py --all           # Export all days separately")
        print("  python export_day_csv.py --list          # List valid dates")
        sys.exit(1)

    if sys.argv[1] == '--all':
        export_all_days()
    elif sys.argv[1] == '--list':
        for d in ALL_DATES:
            print(f"  {d} - {DAY_LABELS[d]}")
    else:
        export_day(sys.argv[1])