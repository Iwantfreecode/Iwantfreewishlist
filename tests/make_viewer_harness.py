# Builds /tmp/vt for ui_viewer_harness.py: viewer.js + style.css + 3 jpgs + a page with a #go button.
# Slide 4 is a dead link on purpose. Run this first, then ui_viewer_harness.py.
import os, shutil
from PIL import Image
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = '/tmp/vt'; shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
shutil.copy(f'{root}/service/js/viewer.js', d); shutil.copy(f'{root}/service/style.css', d)
for n, c in enumerate([(200, 60, 90), (60, 120, 200), (80, 170, 100)], 1):
    Image.new('RGB', (600, 800), c).save(f'{d}/p{n}.jpg')
open(f'{d}/index.html', 'w').write('''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="style.css"><button id="go" style="margin:20px;padding:20px">open</button>
<script type="module">
import { openViewer } from './viewer.js';
const src = ['p1.jpg', 'p2.jpg', 'p3.jpg', 'missing.jpg'];
document.getElementById('go').onclick = () => openViewer(src.map((s) => ({ load: () => Promise.resolve(s) })), 0, 'Test');
</script>''')
print('ok', d)
