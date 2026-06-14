import glob
from pathlib import Path

UPLOAD_DIR = Path('/app/data/uploads')
order_name = '8мм'
pattern = f'{UPLOAD_DIR}/{order_name}*'
all_files = glob.glob(pattern + '.*')
print('All matching files:')
for f in all_files:
    is_layout = '_layout_' in Path(f).name.lower()
    print(f'  {Path(f).name}  layout={is_layout}')

filtered = [f for f in all_files if '_layout_' not in f.lower() and f.lower().endswith(('.doc', '.docx'))]
print(f'\nFiltered (no _layout_):')
for f in filtered:
    print(f'  {Path(f).name}')
