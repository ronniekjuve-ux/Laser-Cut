import sqlite3, json, os

db = os.path.join(os.environ['USERPROFILE'], '.local', 'share', 'mimocode', 'mimocode.db')
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row
c = conn.cursor()

# Sessions to search (non-checkpoint user sessions from last 7 days)
sessions = [
    'ses_0aa83b45cffewBHN7c91qM3gkR',  # Доделка учёта склада после зависания
    'ses_0aad99ddeffezidl1N1Nx80HWW',  # Разработка и внедрение складского учёта
    'ses_0adc58ebeffevH60hMhektByR0',  # Качество изображений и детали заказов
    'ses_0af70a85dffeE9LyTEuTy0eqdr',  # Продолжение работы над приложением
    'ses_0b82cf766ffe6R4zDPUCylHhVC',  # Продолжение работы с приложением
]

# Search user messages for decision/rule keywords
keywords = ['всегда', 'никогда', 'правило', 'решил', 'нужно', 'важно', 'ошибка', 'проблема',
            'always', 'never', 'rule', 'decided', 'important', 'error', 'problem', 'fix',
            'доделка', 'итого', 'готово', 'работает', 'не работает', 'проверил', 'баг']

for sid in sessions:
    c.execute("""SELECT m.id, p.data
                 FROM message m 
                 JOIN part p ON p.message_id = m.id
                 WHERE m.session_id = ? AND json_extract(m.data, '$.role') = 'user'
                 ORDER BY m.time_created""", (sid,))
    rows = c.fetchall()
    for r in rows:
        pd = json.loads(r['data'])
        if pd.get('type') == 'text':
            text = pd.get('text', '').lower()
            for kw in keywords:
                if kw in text:
                    print(f"\n[{sid[:20]}] USER ({kw}):")
                    print(f"  {pd.get('text', '')[:500]}")
                    break

# Also search assistant text for bug fixes, errors, decisions
for sid in sessions:
    c.execute("""SELECT m.id, p.data
                 FROM message m 
                 JOIN part p ON p.message_id = m.id
                 WHERE m.session_id = ? AND json_extract(m.data, '$.role') = 'assistant'
                 ORDER BY m.time_created""", (sid,))
    rows = c.fetchall()
    for r in rows:
        pd = json.loads(r['data'])
        if pd.get('type') == 'text':
            text = pd.get('text', '')
            text_lower = text.lower()
            if any(kw in text_lower for kw in ['ошибка', 'error', 'fixed', 'исправл', 'баг', '500', 'notnull', 'constraint', 'flush', 'решение', 'итого', 'summary']):
                print(f"\n[{sid[:20]}] ASSISTANT:")
                print(f"  {text[:600]}")

conn.close()
