import { logicTags, tagHits, bigHits } from './tags.mjs';
import { itemPics, picLinksOf, parsePicUrls, mapOldItem, parseTags, parseUrls, moveInOrder, nextItemId, newListId, itemFromForm, checkItemInput } from './logic.mjs';
import { money, convertedRange, CURRENCIES, friendlyError } from './logic.mjs';
import { getRate } from './rates.mjs';
let p=0,f=0; const eq=(n,a,b)=>{ const ok=JSON.stringify(a)===JSON.stringify(b); ok?p++:f++; if(!ok) console.log('FAIL',n,JSON.stringify(a),'!=',JSON.stringify(b)); };
const it=(id,tags,extra={})=>({id,name:id,tags,repeat:'',...extra});
const ctx=(items,repTags=[],joints=[])=>({items,repTags,joints});
// normal tag: shared tag -> hit; small when item has more tags
let a=it('a',['bag','travel bag']), b=it('b',['bag','laptop bag']);
let h=tagHits(b,ctx([a,b]),{a:{by:'u'}},'me'); eq('small',[h.length,h[0].big],[1,false]);
// big: item's only tag already picked
let c=it('c',['bag']); h=tagHits(c,ctx([a,c]),{a:{by:'u'}},'me'); eq('big',h[0].big,true);
// repeatable tag ignored
h=tagHits(c,ctx([a,c],['bag']),{a:{by:'u'}},'me'); eq('repeatable tag ignored',h.length,0);
// repeat item never counts
h=tagHits(it('r',['bag'],{repeat:'item'}),ctx([a]),{a:{by:'u'}},'me'); eq('repeat item',h.length,0);
// own tick also counts and is flagged mine
h=tagHits(c,ctx([a,c]),{a:{by:'me'}},'me'); eq('mine flag',h[0].mine,true);
// joint: item with both tags gets hidden tag; plain travel bag ticked + big-bag item => small (shares travel bag)
const joint=[{name:'big bag',tags:['travel bag','laptop bag']}];
let big=it('big',['travel bag','laptop bag']), tb=it('tb',['travel bag']);
eq('joint tag added',Object.keys(logicTags(big,ctx([big],[],joint))).length,3);
h=tagHits(big,ctx([big,tb],[],joint),{tb:{by:'u'}},'me'); eq('plain travel bag vs big bag item is small',[h.length,h[0].big],[1,false]);
// both plain ticked separately -> big bag item becomes big
let lb=it('lb',['laptop bag']); h=tagHits(big,ctx([big,tb,lb],[],joint),{tb:{by:'u'},lb:{by:'v'}},'me'); eq('both plain ticked => big',h.every(x=>x.big)&&h.length>0,true);
// no tags -> no hits
eq('no tags',tagHits(it('z',[]),ctx([a]),{a:{by:'u'}},'me').length,0);
// helpers
eq('parseTags',parseTags('Bag,  bag , Travel  Bag, a,b,c,d'),['Bag','Travel Bag','a','b','c']);
eq('parseTags 30 chars',parseTags('x'.repeat(40))[0].length,30);
eq('parseUrls https only',parseUrls('https://a.co/x\nhttp://bad\njavascript:alert(1)\nhttps://b.co'),['https://a.co/x','https://b.co']);
eq('nextItemId',nextItemId({i00:1,i01:1}),'i02'); eq('nextItemId full',nextItemId(Object.fromEntries(Array.from({length:100},(_,i)=>['i'+String(i).padStart(2,'0'),1]))),null);
eq('listId shape',/^[A-Za-z0-9]{20}$/.test(newListId()),true);
const list={items:{i00:{priority:'want'},i01:{priority:'must'},i02:{priority:'want'}},order:['i00','i01','i02']};
eq('move down within group',moveInOrder(list,'i00',1),['i02','i01','i00']); eq('move up at top',moveInOrder(list,'i00',-1),null);
// import mapping with https base
const m=mapOldItem({name:'X',price:4000,priceMax:null,approx:true,urls:['https://a.co/1','ftp://x'],note:'n',priority:'essential',tags:['Bag','bag'],repeat:'tag',imgs:['img/abc.jpg?v=12'],got:false},'https://iwantfreecode.github.io/Iwantfreewishlist/');
eq('import picUrls',m.item.picUrls,['https://iwantfreecode.github.io/Iwantfreewishlist/img/abc.jpg']); eq('import repeat tag -> repTags',[m.item.repeat,m.repTagsAdd],['',['bag']]); eq('import essential kept',m.item.priority,'essential'); eq('import urls',m.item.urls,['https://a.co/1']);
// item form
eq('form fields complete',Object.keys(itemFromForm({name:' A ',price:'12',priority:'zzz'})).sort(),['approx','got','name','note','picUrl','picUrls','picV','picV1','price','priceMax','priority','repeat','tags','urls']);
eq('form bad priority->want',itemFromForm({name:'A',priority:'zzz'}).priority,'want');
eq('check empty name',checkItemInput({name:' '})!=='',true); eq('check bad link',checkItemInput({name:'a',picUrls:'https://ok.co/a.jpg\nhttp://x'})!=='',true);
// multi pictures
const mi=mapOldItem({name:'Y',imgs:['img/a.jpg','img/b.jpg?v=2','img/c.jpg']},'https://x.github.io/W/'); eq('import keeps all imgs',mi.item.picUrls.length,3);
eq('parsePicUrls max 8 https only',parsePicUrls(Array.from({length:12},(_,i)=>'https://a.co/'+i).join('\n')+'\nhttp://no').length,8);
eq('itemPics order uploads then links',itemPics({picV:5,picV1:6,picUrls:['https://a.co/1','https://a.co/2']}).map(x=>x.slot??x.url),[0,1,'https://a.co/1','https://a.co/2']);
eq('itemPics legacy picUrl',itemPics({picUrl:'https://a.co/old'}).length,1);
eq('itemPics empty',itemPics({}).length,0);
eq('form keeps picV1',itemFromForm({name:'A',picUrls:'https://a.co/x'},{picV:1,picV1:2}).picV1,2);
eq('form picUrls 9 lines -> check error',checkItemInput({name:'a',picUrls:Array.from({length:9},(_,i)=>'https://a.co/'+i).join('\n')})!=='',true);
import { parseImport } from './logic.mjs';
{
const a=parseImport('- Aulumu G03 around ฿1,700 https://a.co/x\n2. Nike mind 001\n[x] Body cam 680\niPhone 15\nHeadphones 3000-3700 baht');
eq('import lines: price+link',[a[0].name,a[0].price,a[0].approx,a[0].urls[0]],['Aulumu G03',1700,true,'https://a.co/x']);
eq('import: leading-zero number is part of name',[a[1].name,a[1].price],['Nike mind 001',0]);
eq('import: [x] means got',[a[2].name,a[2].price,a[2].got],['Body cam',680,true]);
eq('import: short number stays in name',[a[3].name,a[3].price],['iPhone 15',0]);
eq('import: range with baht',[a[4].name,a[4].price,a[4].priceMax],['Headphones',3000,3700]);
const t=parseImport('Name\tPrice\tNote\tLink\tPriority\tTags\nBag\t฿2,500\t"black, 22L"\thttps://b.co\tMust have\tbag, sling\nCap\t300\t\t\tsomeday\t');
eq('import tsv with header',[t[0].name,t[0].price,t[0].note,t[0].urls[0],t[0].priority,t[0].tags],['Bag',2500,'black, 22L','https://b.co','must',['bag','sling']]);
eq('import tsv row 2',[t[1].name,t[1].price,t[1].priority],['Cap',300,'someday']);
const c=parseImport('name,price,link\n"Shoe, red",1200,https://s.co\nSock,80,');
eq('import csv quotes',[c[0].name,c[0].price,c[0].urls.length,c[1].name],['Shoe, red',1200,1,'Sock']);
eq('import empty',parseImport('  \n '),[]);
eq('import cap 100',parseImport(Array.from({length:150},(_,i)=>'item '+i).join('\n')).length,100);
eq('import no header table',(()=>{const r=parseImport('Cup\t250\tblue\nPlate\thttps://p.co');return [r[0].price,r[0].note,r[1].urls.length]})(),[250,'blue',1]);
}

{
const g=(t)=>parseImport(t);
let r=g('☐ AirPods Pro 2 - 8,900฿\n✅ Mechanical keyboard (Keychron K2) 3,500 baht\n• Water bottle $25\n- [Sony XM5](https://sony.com/x) - 11,990');
eq('stress: Pro 2 - 8,900฿',[r[0].name,r[0].price],['AirPods Pro 2',8900]);
eq('stress: paren becomes note + checkbox got',[r[1].name,r[1].price,r[1].note,r[1].got],['Mechanical keyboard',3500,'Keychron K2',true]);
eq('stress: dollars never become baht',[r[2].price,r[2].note],[0,'$25']);
eq('stress: markdown link',[r[3].name,r[3].price,r[3].urls.length],['Sony XM5',11990,1]);
r=g('Gaming mouse 2k\nMonitor 4K 144hz 8.5k\nBike 15.000\nPlane ticket 1,200.50\nGift card 500 x2\nCoffee 85/cup\n2024 calendar 150');
eq('stress: k suffix',[r[0].price,r[1].name,r[1].price],[2000,'Monitor 4K 144hz',8500]);
eq('stress: 15.000 is fifteen thousand',r[2].price,15000);
eq('stress: decimals',r[3].price,1201);
eq('stress: x2 ignored in price',[r[4].name,r[4].price],['Gift card',500]);
eq('stress: small number stays',[r[5].price],[0]);
eq('stress: year at start stays in name',[r[6].name,r[6].price],['2024 calendar',150]);
r=g('Name: Linen shirt | Price: 1,200 | Size M\nBook "Atomic Habits" ราคา 350 บาท\nหูฟัง Sony 5,990 บาท');
eq('stress: labelled line',[r[0].name,r[0].price,r[0].note],['Linen shirt',1200,'Size M']);
eq('stress: thai price word',[r[1].price,r[2].price],[350,5990]);
r=g('WISHLIST 2026\n\nTECH:\n  - Laptop 35000\n  - Mouse 590\nHOME:\n  - Sofa 12,000');
eq('stress: headings become tags',r.map((x)=>[x.name,x.tags[0]]),[['Laptop','tech'],['Mouse','tech'],['Sofa','home']]);
r=g('Product,Cost (THB),Where to buy,Notes\n"Rice cooker",1990,https://shop.com/rc,"3L, white"\n,100,,');
eq('stress: other header names',[r.length,r[0].price,r[0].urls.length,r[0].note],[1,1990,1,'3L, white']);
r=g('Item\tPrice\tLink\nCase\t590\thttps://c.co\tblack');
eq('stress: extra column goes to note',r[0].note,'black');
eq('stress: one line commas',g('socks, shirt, hat').length,3);
eq('stress: http link not added, kept in note',(()=>{const x=g('Cable http://a.co/x 150')[0];return [x.price,x.urls.length,x.note.includes('http://a.co/x')]})(),[150,0,true]);
eq('stress: huge number ignored',g('Thing '+'9'.repeat(40))[0].price,0);
}
// ---- money and exchange rates ----
eq('money: baht',[money(150),money(2400,'USD'),money(1234.6,'EUR')],['฿150','$2,400','€1,235']);
eq('money: unknown code falls back to the code',money(5,'XYZ'),'XYZ 5');
eq('range: 2400 THB at 0.0277 USD',convertedRange(2400,0,0.0277,'USD'),'$63–$70');
eq('range: small price',convertedRange(150,0,0.0277,'USD'),'$3–$5');
eq('range: price range 3000-3700',convertedRange(3000,3700,0.0277,'USD'),'$78–$110');
eq('range: never lower than the real value',(()=>{ const t=convertedRange(10000,0,0.0277,'USD').replace(/[^0-9–]/g,'').split('–').map(Number); return t[0]<=277 && t[1]>=277; })(),true);
eq('range: all list currencies have a symbol',Object.keys(CURRENCIES).length,17);
const store=()=>{ const m={}; return { getItem:(k)=>m[k]||null, setItem:(k,v)=>{m[k]=v;} }; };
let calls=0; const okFetch=async()=>{ calls++; return { ok:true, json:async()=>({date:'2026-11-12',rates:{USD:0.0277}}) }; };
const st=store();
eq('rate: same currency needs no call',await getRate('THB','THB',okFetch,st),{rate:1,date:''});
eq('rate: fetched',await getRate('THB','USD',okFetch,st),{rate:0.0277,date:'2026-11-12'});
await getRate('THB','USD',okFetch,st); eq('rate: second ask uses the saved value',calls,1);
let bad=false; try { await getRate('THB','EUR',async()=>({ok:false,status:500}),store()); } catch(e){ bad=true; } eq('rate: source error throws',bad,true);
bad=false; try { await getRate('THB','EUR',async()=>({ok:true,json:async()=>({rates:{}})}),store()); } catch(e){ bad=true; } eq('rate: missing rate throws',bad,true);
eq('error: offline text (firestore)',friendlyError({code:'unavailable'}),'No connection. Try again.');
eq('error: timeout text',friendlyError({code:'timeout'}),'This is taking too long. Check your connection and try again.');
eq('error: unknown stays plain',friendlyError({code:'x'}),'Something went wrong. Please try again.');
console.log('UNIT',p,'pass',f,'fail');
