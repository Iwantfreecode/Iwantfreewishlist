# Wishlist

A small static wishlist page. The list lives in `wishlist.json`; `index.html` reads it and shows it.

To change the list, edit `wishlist.json` on github.com (pencil icon), then commit. The live page updates in about a minute.

Each item looks like this:

```json
{
  "id": "any-unique-text",
  "name": "Item name",
  "price": 1200,
  "urls": ["https://shop.example/item"],
  "note": "Colour, size",
  "priority": "want",
  "got": false,
  "example": false
}
```

`priority` is `must`, `want` or `someday`. Use `null` for an unknown price. Set `got` to `true` once you have it.

Note: the private Claude copy of this page uses a cursive font. This GitHub page always keeps the normal font.
