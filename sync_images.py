"""Split item pictures out of wishlist.json into separate files.

The Claude page saves each picture inside wishlist.json as a long text code
(a "data URL"). That makes the list file big, so the page can't show any
text until the whole thing has downloaded.

This script moves each picture into its own file in img/ and leaves only a
short path (img/<id>.jpg?v=<hash>) in wishlist.json. The list file becomes
small and loads fast, and the browser fetches the pictures afterwards.

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
    m = DATA_URL.match(item.get('img') or '')
    if not m:
        continue
    raw = base64.b64decode(m.group(2))
    name = re.sub(r'[^a-z0-9-]', '', item['id'].lower()) + '.' + EXT[m.group(1)]
    with open(os.path.join('img', name), 'wb') as f:
        f.write(raw)
    keep.add(name)
    # the ?v= part changes when the picture changes, so browsers don't show an old copy
    item['img'] = 'img/' + name + '?v=' + hashlib.sha256(raw).hexdigest()[:8]

for name in os.listdir('img'):            # remove pictures of deleted items
    if name not in keep and not any((i.get('img') or '').startswith('img/' + name) for i in data['items']):
        os.remove(os.path.join('img', name))

with open('wishlist.json', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('pictures:', len(keep), '| wishlist.json:', os.path.getsize('wishlist.json') // 1024, 'KB')
