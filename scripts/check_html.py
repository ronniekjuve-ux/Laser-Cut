import tempfile, subprocess, re
from pathlib import Path
from urllib.parse import unquote

filepath = '/app/data/uploads/8мм_8мм.DOC'

with tempfile.TemporaryDirectory() as tmpdir:
    subprocess.run(['libreoffice', '--headless', '--convert-to', 'html', '--outdir', tmpdir, filepath],
                   capture_output=True, timeout=60)

    html_files = list(Path(tmpdir).glob('*.html'))
    html = html_files[0].read_text(encoding='utf-8', errors='ignore')

    # Show 1000 chars around each img
    for i, m in enumerate(re.finditer(r'<img[^>]+src=["\']([^"\']+)', html)):
        start = max(0, m.start() - 1000)
        end = min(len(html), m.end() + 200)
        chunk = html[start:end]
        name = unquote(m.group(1)).split('/')[-1]
        # Find all .dft references in this chunk
        dfts = re.findall(r'([\wА-Яа-яёЁ0-9\-]+\.dft)', chunk, re.IGNORECASE)
        print(f"=== IMG [{i}] {name} ===")
        print(f"  dft nearby: {dfts}")
        # Show the table row context
        row_start = chunk.rfind('<tr')
        if row_start >= 0:
            row = chunk[row_start:chunk.find('</tr>', row_start)+5] if '</tr>' in chunk[row_start:] else chunk[row_start:]
            # Extract text
            texts = re.findall(r'>([^<]+)<', row)
            texts = [t.strip() for t in texts if t.strip()]
            print(f"  row texts: {texts}")
        print()
