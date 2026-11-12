# Picture files that ui_e2e.py and ui_multi_pics.py upload. Run once per chat: python3 tests/make_fixtures.py
import os, random
from PIL import Image
os.makedirs('/tmp/emu', exist_ok=True)
random.seed(1)
def noisy(w, h, name):
    im = Image.effect_noise((w, h), 60).convert('RGB'); im.save(f'/tmp/emu/{name}', quality=90)
noisy(3000, 2000, 'big.jpg'); noisy(300, 300, 's0.jpg'); noisy(300, 300, 's1.jpg')
print('ok')
