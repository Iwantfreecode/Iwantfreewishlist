"""Split item pictures out of wishlist.json into separate files.

The Claude page saves each picture inside wishlist.json as a long text code
(a "data URL"). That makes the list file big, so the page can't show any
text until the whole thing has downloaded.

This script moves each picture into its own file in img/ and leaves only a
short path (img/<id>.jpg?v=<hash>) in wishlist.json. The list file becomes
small and loads fast, and the browser fetches the pictures afterwards.

An item can have several pictures ("imgs"). The first one is saved as
img/<id>.<ext>, the next ones as img/<id>-1.<ext>, img/<id>-2.<ext> and so on.
Older lists with a single "img" per item still work: it becomes the first picture.

Run it after copying a fresh wishlist.json from the Claude page:
    python3 sync_images.py
"""
import base64, hashlib, json, os, re

DATA_URL = re.compile(r'^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$')
EXT = {'jpeg': 'jpg', 'png': 'png', 'webp': 'webp'}

with open('wishlist.json') as f:
    data = json.load(f)

os.makedirs('img', exist_ok=True)
keep = set()
for item in data['items']:
    pictures = item.get('imgs') if isinstance(item.get('imgs'), list) else ([item['img']] if item.get('img') else [])
    item.pop('img', None)
    paths = []
    for n, pic in enumerate(pictures):
        m = DATA_URL.match(pic or '')
        if not m:
            paths.append(pic)             # already a file path from an earlier run
            if isinstance(pic, str) and pic.startswith('img/'):
                keep.add(pic.split('?')[0][4:])
            continue
        raw = base64.b64decode(m.group(2))
        base = re.sub(r'[^a-z0-9-]', '', item['id'].lower()) + ('' if n == 0 else '-%d' % n)
        name = base + '.' + EXT[m.group(1)]
        with open(os.path.join('img', name), 'wb') as f:
            f.write(raw)
        keep.add(name)
        # the ?v= part changes when the picture changes, so browsers don't show an old copy
        paths.append('img/' + name + '?v=' + hashlib.sha256(raw).hexdigest()[:8])
    item['imgs'] = paths

for name in os.listdir('img'):            # remove pictures of deleted items or removed pictures
    if name not in keep:
        os.remove(os.path.join('img', name))

with open('wishlist.json', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('pictures:', len(keep), '| wishlist.json:', os.path.getsize('wishlist.json') // 1024, 'KB')
