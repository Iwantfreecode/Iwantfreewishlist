import { logicTags, tagHits, bigHits } from './tags.mjs';
import { itemPics, picLinksOf, parsePicUrls, mapOldItem, parseTags, parseUrls, moveInOrder, nextItemId, newListId, itemFromForm, checkItemInput } from './logic.mjs';
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
console.log('UNIT',p,'pass',f,'fail');
