import { parseImport } from './logic.mjs';
const T = {
'A apple notes checklist': `☐ AirPods Pro 2 - 8,900฿\n☑ Kindle Paperwhite ~ 5500\n✅ Mechanical keyboard (Keychron K2) 3,500 baht\n⬜ Yoga mat\n• Desk lamp 890 https://www.lazada.co.th/p/123\n• Water bottle $25`,
'B messy chat': `hey so i want: a ps5 (around 17000), nintendo switch oled 12k, and a new bag?? idk maybe the aer one\n\nalso 2 pairs of socks 150 each`,
'C markdown links': `- [Sony WH-1000XM5](https://sony.com/xm5) - 11,990\n- [Uniqlo hoodie](https://uniqlo.com/h) 1,290 THB\n* **Camera strap** – 590`,
'D price labels': `Name: Linen shirt | Price: 1,200 | Size M\nItem: Tote bag, price 450\nBook "Atomic Habits" ราคา 350 บาท`,
'E numbered w/ notes': `1) Fujifilm X100V (black or silver) 60000-70000\n2) 50mm lens\n3) Tripod - carbon fiber, light, ~2500\n4. SD card 128GB 450`,
'F thai': `หูฟัง Sony 5,990 บาท\nรองเท้า Nike Air Max 4500\nกระเป๋าเป้ สีดำ\nแก้วน้ำ 25 ออนซ์ 590฿`,
'G k suffix': `Gaming mouse 2k\nMonitor 4K 144hz 8.5k\nChair 6,500-9,000\nSSD 1TB 2,890`,
'H csv other headers': `Product,Cost (THB),Where to buy,Notes\n"Rice cooker",1990,https://shop.com/rc,"3L, white"\nKettle,,,quiet one\n,100,,`,
'I semicolon csv': `name;price;priority;tags\nLamp;450;want;home\nRug;1,200;must have;home, decor\nVase;300;low;`,
'J tsv missing cols': `Item\tPrice\tLink\nPen\t20\nNotebook\t\thttps://n.co\nCase\t590\thttps://c.co\tblack`,
'K one line commas': `socks, shirt, hat, shoes`,
'L headings and blanks': `WISHLIST 2026\n\nTECH:\n  - Laptop 35000\n  - Mouse 590\n\nHOME:\n  - Sofa 12,000\n`,
'M quirky prices': `Bike 15.000\nWatch USD 250\nPlane ticket 1,200.50\nCoffee 85/cup\nGift card 500 x2\nRam 16GB 1,100\nMac Studio M2 Ultra`,
'N http not https + junk': `Cable http://a.co/x 150\n\n---\n===\nDesk https://d.co/very/long/path?x=1&y=2 3200`,
'O dup + case': `Switch\nswitch\nSWITCH 11000`,
'P windows crlf bom': '﻿Name,Price\r\nMug,120\r\nPlate,90\r\n',
'Q quoted multiline': `name,price,note\n"Cup",100,"line1\nline2"\nBowl,50,`,
'R year numbers': `2024 calendar 150\nPS5 Pro 2025 edition 22000\nHonda Civic 1995 model`,
};
for (const [k, v] of Object.entries(T)) { console.log('\n## ' + k); for (const r of parseImport(v)) console.log(JSON.stringify([r.name, r.price, r.priceMax||undefined, r.approx||undefined, r.urls.length||undefined, r.note||undefined, r.priority!=='want'?r.priority:undefined, r.tags.length?r.tags:undefined, r.got||undefined]).replace(/,null/g,',-')); }
