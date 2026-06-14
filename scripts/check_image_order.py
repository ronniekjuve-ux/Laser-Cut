import tempfile, subprocess, glob, os, re
from pathlib import Path
from urllib.parse import unquote

filepath = '/app/data/uploads/8мм_8мм.DOC'
print(f"File: {filepath}")

with tempfile.TemporaryDirectory() as tmpdir:
    subprocess.run(['libreoffice', '--headless', '--convert-to', 'html', '--outdir', tmpdir, filepath],
                   capture_output=True, timeout=60)

    html_files = glob.glob(os.path.join(tmpdir, '*.html'))
    if html_files:
        html = Path(html_files[0]).read_text(encoding='utf-8', errors='ignore')
        imgs = re.findall(r'<img[^>]+src=["\']([^"\']+)', html)
        print(f"\nHTML img src order ({len(imgs)}):")
        for i, ref in enumerate(imgs):
            name = unquote(ref).split('/')[-1]
            print(f"  [{i}] src={ref} -> name={name}")

    files_dirs = glob.glob(os.path.join(tmpdir, '*_files'))
    if files_dirs:
        files_dir = files_dirs[0]
        files = [f for f in os.listdir(files_dir) if Path(f).suffix.lower() in {'.png','.jpg','.jpeg','.gif','.bmp','.emf'}]
        print(f"\n_files/ actual files ({len(files)}):")
        for i, f in enumerate(files):
            print(f"  [{i}] {f}")
    else:
        print("\nNo _files/ directory found!")
