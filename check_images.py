import psycopg2
import json

conn = psycopg2.connect('postgresql://postgres:postgres@localhost:5432/laser_cut')
cur = conn.cursor()
cur.execute("SELECT id, order_name, detail_images FROM applications WHERE detail_images IS NOT NULL LIMIT 5")
rows = cur.fetchall()
conn.close()

for row in rows:
    print(f"App #{row[0]} ({row[1]}):")
    try:
        data = json.loads(row[2])
        if isinstance(data, dict):
            print(f"  Type: dict, {len(data)} entries")
            for k, v in list(data.items())[:3]:
                print(f"    {k} -> {v}")
        elif isinstance(data, list):
            print(f"  Type: list, {len(data)} entries")
            for i, v in enumerate(data[:3]):
                print(f"    [{i}] -> {v}")
    except:
        print(f"  Raw: {str(row[2])[:200]}")
    print()
