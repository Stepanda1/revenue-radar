// All monetary calculations are performed in integer cents, before any AI call.
// Papa Parse 5.5.3 is vendored with its MIT license for reproducible offline imports.
import Papa from '../vendor/papaparse/papaparse.cjs';

export type SalesRow = { date: string; product: string; revenue: number; quantity: number | null; orderId: string | null };
export type Mapping = { date: string; product: string; revenue: string; quantity: string; unitPrice: string; orderId: string };
export type CsvData = { headers: string[]; records: Record<string,string>[]; errors: string[] };
export type Quality = { input: number; accepted: number; rejected: number; duplicateRows: number; issues: {row: number; reason: string}[] };
export type Daily = { date: string; revenue: number; rows: number; baseline: number | null; anomaly: boolean; difference: number | null; history: number };
export type Product = { name: string; current: number; previous: number; delta: number; change: number | null; share: number; quantity: number | null; rows: number };
export type Analysis = {
  start: string; end: string; previousStart: string; previousEnd: string; days: number; comparisonAvailable: boolean;
  total: number; previous: number; change: number | null; averageDaily: number; rows: number; orders: number | null;
  daily: Daily[]; anomalies: Daily[]; products: Product[]; mainDecliner: Product | null; missingDays: number;
  recommendations: {priority: 'High' | 'Medium' | 'Low'; title: string; evidence: string; action: string; measure: string}[];
};
const DAY = 86400000;
const sum = (rows: SalesRow[]) => rows.reduce((total,r) => total + r.revenue, 0);
export const formatMoney = (cents: number, currency = 'USD') => new Intl.NumberFormat('en-US', {style:'currency',currency,maximumFractionDigits:0}).format(cents/100);
export const formatExact = (cents: number, currency = 'USD') => new Intl.NumberFormat('en-US', {style:'currency',currency,maximumFractionDigits:2}).format(cents/100);
export const percent = (n: number | null) => n === null ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%';
export const shortDate = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
export const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n*DAY).toISOString().slice(0,10);
export const dayDistance = (a: string,b: string) => Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/DAY);
const median = (data: number[]) => { const a = [...data].sort((a,b)=>a-b); return a.length % 2 ? a[(a.length-1)/2] : (a[a.length/2-1]+a[a.length/2])/2; };
export function parseCsv(text: string): CsvData {
  if (!text.trim()) throw new Error('This file is empty. Upload a CSV with a header row and sales records.');
  const result = Papa.parse(text.replace(/^\uFEFF/,''), {header:true,skipEmptyLines:'greedy',transformHeader:(h:string)=>h.trim(),delimitersToGuess:[',',';','\t','|']});
  if (result.errors.some((e:{code:string})=>e.code==='MissingQuotes')) throw new Error('The CSV has an unclosed quoted field. Check the file and try again.');
  if (Object.keys(result.meta.renamedHeaders ?? {}).length) throw new Error('Column names must be unique. Rename duplicate headers before importing.');
  const headers: string[] = result.meta.fields ?? [];
  if (headers.length < 2 || !headers.every(Boolean)) throw new Error('A header row with at least two named columns is required.');
  if (!result.data.length) throw new Error('No sales rows were found after the header.');
  if (result.data.length > 50000) throw new Error('This MVP supports up to 50,000 sales rows. Split your export into smaller files.');
  const errors = result.errors.filter((e:{code:string})=>e.code!=='UndetectableDelimiter').map((e:{row:number;message:string})=>'CSV row '+(e.row+2)+': '+e.message);
  if (errors.length) throw new Error(errors[0] + ' Each row must match the number of columns in the header.');
  return {headers,records:result.data,errors:[]};
}
export function inferMapping(headers: string[]): Mapping {
  const normalized = (s:string)=>s.toLowerCase().replace(/[\s_-]+/g,'');
  const choose = (aliases:string[]) => headers.find(h=>aliases.includes(normalized(h))) ?? '';
  return {
    date:choose(['date','orderdate','transactiondate','дата','датазаказа','timestamp','createdat']),
    product:choose(['product','productname','item','sku','товар','наименование']),
    revenue:choose(['revenue','sales','amount','total','linetotal','выручка','сумма','итого']),
    quantity:choose(['quantity','qty','units','количество']),
    unitPrice:choose(['unitprice','price','цена']),
    orderId:choose(['orderid','transactionid','номерзаказа','idзаказа'])
  };
}
export function parseDate(value:string): string | null {
  const s = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T\d{2}:\d{2}| \d{2}:\d{2})/.exec(s);
  const eu = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(s);
  const date = iso ? iso[1]+'-'+iso[2]+'-'+iso[3] : eu ? eu[3]+'-'+eu[2]+'-'+eu[1] : null;
  if (!date) return null;
  const time = Date.parse(date+'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===date ? date : null;
}
export function parseNumber(value:string, decimal:'dot'|'comma'='dot'): number | null {
  let s = value.trim().replace(/[\s\u00A0\u202F]/g,'').replace(/^[\$€£₽¥]/,'').replace(/[\$€£₽¥]$/,'');
  if (!s) return null;
  // Reject incorrectly grouped numbers rather than silently changing their value.
  const pattern = decimal==='dot' ? /^[-+]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/ : /^[-+]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/;
  if (!pattern.test(s)) return null;
  s = decimal==='comma' ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n)<1e10 ? n : null;
}
export function moneyToCents(value:string,decimal:'dot'|'comma'='dot'):number|null {
  const parsed=parseNumber(value,decimal);
  if(parsed===null)return null;
  let normalized=value.trim().replace(/[\s\u00A0\u202F]/g,'').replace(/^[\$€£₽¥]/,'').replace(/[\$€£₽¥]$/,'');
  normalized=decimal==='comma'?normalized.replace(/\./g,'').replace(',','.'):normalized.replace(/,/g,'');
  const negative=normalized.startsWith('-');
  normalized=normalized.replace(/^[-+]/,'');
  const [whole,fraction='']=normalized.split('.');
  const cents=Number(whole)*100+Number((fraction+'00').slice(0,2))+(Number(fraction[2]??0)>=5?1:0);
  return negative?-cents:cents;
}
export function normalizeCsv(data:CsvData,mapping:Mapping,decimal:'dot'|'comma'='dot'): {rows:SalesRow[];quality:Quality} {
  if (!mapping.date || !mapping.product || (!mapping.revenue && (!mapping.quantity || !mapping.unitPrice))) throw new Error('Map Date, Product and Revenue, or Quantity + Unit price.');
  const selected = Object.values(mapping).filter(Boolean);
  if (new Set(selected).size!==selected.length) throw new Error('Each CSV column can only be mapped to one field.');
  if (selected.some(k=>!data.headers.includes(k))) throw new Error('The selected column is missing from this CSV.');
  const rows:SalesRow[] = [], seen = new Set<string>();
  const quality:Quality = {input:data.records.length,accepted:0,rejected:0,duplicateRows:0,issues:[]};
  data.records.forEach((r,index) => {
    const date = parseDate(String(r[mapping.date] ?? ''));
    const product = String(r[mapping.product] ?? '').trim();
    const quantity = mapping.quantity ? parseNumber(String(r[mapping.quantity] ?? ''),decimal) : null;
    const price = mapping.unitPrice ? parseNumber(String(r[mapping.unitPrice] ?? ''),decimal) : null;
    const revenue = mapping.revenue ? parseNumber(String(r[mapping.revenue] ?? ''),decimal) : quantity!==null && price!==null ? quantity*price : null;
    const reason = !date ? 'Invalid date: use YYYY-MM-DD or DD.MM.YYYY' : !product ? 'Product is empty' :
      product.length>200 ? 'Product name exceeds 200 characters' : revenue===null ? 'Invalid revenue / number format' :
      revenue<0 ? 'Negative revenue: refunds are outside this gross-sales MVP' :
      revenue>1e9 ? 'Row revenue exceeds the supported 1 billion currency-unit limit' :
      mapping.quantity && (quantity===null || quantity<0) ? 'Invalid quantity' :
      mapping.unitPrice && (price===null || price<0) ? 'Invalid unit price' : '';
    if (reason) {quality.rejected++;quality.issues.push({row:index+2,reason});return;}
    const orderId = mapping.orderId ? String(r[mapping.orderId] ?? '').trim() || null : null;
    const cents = mapping.revenue ? moneyToCents(String(r[mapping.revenue]),decimal)! :
      Math.round(quantity!*moneyToCents(String(r[mapping.unitPrice]),decimal)!);
    const row = {date:date!,product,revenue:cents,quantity,orderId};
    const signature = JSON.stringify(row);
    if (seen.has(signature)) quality.duplicateRows++;
    seen.add(signature);
    rows.push(row);
  });
  quality.accepted = rows.length;
  if (!rows.length) throw new Error('No valid sales rows remain. Check dates, revenue and the chosen number format.');
  rows.sort((a,b)=>a.date.localeCompare(b.date));
  if (dayDistance(rows[0].date,rows[rows.length-1].date)>1095) throw new Error('The export spans more than three years. Upload a smaller date range.');
  return {rows,quality};
}
export function analyze(rows:SalesRow[],period:number=14,currency:string='USD'):Analysis {
  if (!rows.length) throw new Error('No sales data to analyze.');
  const ordered = [...rows].sort((a,b)=>a.date.localeCompare(b.date));
  const min = ordered[0].date, end = ordered[ordered.length-1].date;
  const totalDays = dayDistance(min,end)+1, days = period===0 ? totalDays : Math.min(period,totalDays);
  const start = addDays(end,1-days), previousEnd=addDays(start,-1), previousStart=addDays(start,-days);
  const comparisonAvailable = previousStart>=min;
  const currentRows = ordered.filter(r=>r.date>=start);
  const previousRows = ordered.filter(r=>r.date>=previousStart && r.date<=previousEnd);
  const total = sum(currentRows), previous=sum(previousRows), change=comparisonAvailable && previous>0 ? (total-previous)/previous*100 : null;
  const totals = new Map<string,{revenue:number;rows:number}>();
  for (const r of ordered) { const v = totals.get(r.date) ?? {revenue:0,rows:0};v.revenue+=r.revenue;v.rows++;totals.set(r.date,v); }
  const daily:Daily[] = [];
  for (let i=0;i<days;i++) {
    const date=addDays(start,i), value=totals.get(date) ?? {revenue:0,rows:0};
    const history:number[] = [];
    for (let w=1;w<=4;w++) { const earlier=addDays(date,-w*7);if(earlier>=min)history.push(totals.get(earlier)?.revenue ?? 0); }
    const baseline = history.length>=3 ? median(history) : null;
    const mad = baseline!==null ? median(history.map(v=>Math.abs(v-baseline))) : 0;
    const difference = baseline && baseline>0 ? (value.revenue-baseline)/baseline*100 : null;
    const anomaly = baseline!==null && baseline>0 && Math.abs(value.revenue-baseline)>Math.max(baseline*.3,3.5*1.4826*mad,100);
    daily.push({date,...value,baseline,anomaly,difference,history:history.length});
  }
  const aggregates = new Map<string,Product>();
  for (const r of currentRows) {
    const p = aggregates.get(r.product) ?? {name:r.product,current:0,previous:0,delta:0,change:null,share:0,quantity:0,rows:0};
    p.current+=r.revenue;p.rows++;
    p.quantity = p.quantity===null || r.quantity===null ? null : p.quantity+r.quantity;
    aggregates.set(r.product,p);
  }
  for (const r of previousRows) {
    const p = aggregates.get(r.product) ?? {name:r.product,current:0,previous:0,delta:0,change:null,share:0,quantity:null,rows:0};
    p.previous+=r.revenue;aggregates.set(r.product,p);
  }
  const products:Product[] = [...aggregates.values()].map(p=>({...p,delta:p.current-p.previous,
    change:comparisonAvailable && p.previous>0?(p.current-p.previous)/p.previous*100:null,
    share:total>0?p.current/total*100:0
  })).sort((a,b)=>b.current-a.current);
  const mainDecliner = comparisonAvailable ? [...products].filter(p=>p.delta<0).sort((a,b)=>a.delta-b.delta)[0] ?? null : null;
  const recommendations:Analysis['recommendations'] = [];
  if (mainDecliner) recommendations.push({priority: mainDecliner.change!==null && mainDecliner.change<-20?'High':'Medium',
    title:'Investigate '+mainDecliner.name,
    evidence:mainDecliner.name+' fell '+formatMoney(-mainDecliner.delta,currency)+' ('+percent(mainDecliner.change)+') vs the previous '+days+' days.',
    action:'Check availability, listing visibility, traffic and checkout conversion for this product. These are hypotheses to test, not proven causes.',
    measure:'Track daily product revenue and conversion over the next 7 days.'});
  const anomalies=daily.filter(d=>d.anomaly);
  if(anomalies.length)recommendations.push({priority:'Medium',title:'Review '+anomalies.length+' unusual sales day'+(anomalies.length===1?'':'s'),
    evidence:'Observed revenue differs from the median of 3–4 previous matching weekdays by more than 30% and the robust variability threshold.',
    action:'Check export completeness first, then compare promotions, outages and stock changes against the highlighted dates.',
    measure:'Confirm which events explain the pattern before changing your sales strategy.'});
  if(products[0]?.share>=50)recommendations.push({priority:'Medium',title:'Reduce dependence on one product',
    evidence:products[0].name+' contributes '+products[0].share.toFixed(1)+'% of selected-period gross revenue.',
    action:'Test a complementary offer or bundle with a second product. Preserve the leading product’s availability.',
    measure:'Compare second-product revenue and gross margin. Margin cannot be calculated from this export.'});
  if(!comparisonAvailable)recommendations.push({priority:'Low',title:'Add an earlier comparison period',
    evidence:'This export does not cover the full preceding '+days+'-day window.',
    action:'Upload at least '+(days*2)+' days of sales or select a shorter period to enable a fair comparison.',
    measure:'Use equal-length periods before judging a product’s trend.'});
  if(!recommendations.length)recommendations.push({priority:'Low',title:'Run one small growth experiment',
    evidence:'No product decline or statistical anomaly was identified in the selected period.',
    action:'Test one offer on a small segment, and compare revenue against the same weekdays. Track margin separately.',
    measure:'Evaluate the test after 7 days; do not assume revenue growth means profit growth.'});
  const orders=currentRows.every(r=>r.orderId!==null)?new Set(currentRows.map(r=>r.orderId)).size:null;
  return {start,end,previousStart,previousEnd,days,comparisonAvailable,total,previous,change,averageDaily:total/days,rows:currentRows.length,orders,
    daily,anomalies,products,mainDecliner,missingDays:daily.filter(d=>!d.rows).length,recommendations};
}
export function createDemo():SalesRow[] {
  const rows:SalesRow[] = [];
  const products=[['Cloud Hoodie',64,26],['Everyday Tee',28,34],['Canvas Tote',18,21],['Studio Cap',24,17],['Crew Socks',12,32]] as const;
  let seed=731;
  const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<56;i++) {
    const date=addDays('2026-08-16',i), weekend=[0,6].includes(new Date(date+'T00:00:00Z').getUTCDay());
    for(let p=0;p<products.length;p++) {
      const [product,price,base]=products[p];
      let quantity=Math.round(base*(weekend?1.2:1)*(0.93+random()*.14));
      if(p===0 && i>=42)quantity=Math.round(quantity*.38);
      if(p>0 && i>=42)quantity=Math.round(quantity*1.05);
      if([45,46,47].includes(i))quantity=Math.round(quantity*.26);
      rows.push({date,product,revenue:quantity*price*100,quantity,orderId:null});
    }
  }
  return rows;
}
export function demoCsv():string {
  return 'date,product,quantity,unit_price,revenue\n'+createDemo().map(r=>[r.date,r.product,r.quantity,(r.revenue/100)/(r.quantity||1),r.revenue/100].join(',')).join('\n');
}
export function reportMarkdown(a:Analysis,currency:string,source:string):string {
  return '# Revenue Radar — Sales report\n\nDataset: '+source+'\nSelected period: '+a.start+' to '+a.end+' ('+a.days+' days)\nCurrency: '+currency+
    '\nGross revenue: '+formatExact(a.total,currency)+'\nPrevious period: '+(a.comparisonAvailable?a.previousStart+' to '+a.previousEnd:'Insufficient history')+
    '\nRevenue change: '+percent(a.change)+'\nAverage daily revenue: '+formatExact(a.averageDaily,currency)+'\nSales rows: '+a.rows+
    '\nOrders: '+(a.orders??'Unavailable: no complete order IDs')+
    '\n\n## Products\n\n| Product | Revenue | Change | Share |\n| --- | --- | --- | --- |\n'+a.products.map(p=>'| '+p.name.replace(/[|\n\r]/g,' ')+' | '+formatExact(p.current,currency)+' | '+percent(p.change)+' | '+p.share.toFixed(1)+'% |').join('\n')+
    '\n\n## Unusual days\n\n'+(a.anomalies.length?a.anomalies.map(d=>'- '+d.date+': '+formatExact(d.revenue,currency)+', matching-weekday median '+formatExact(d.baseline!,currency)+' ('+percent(d.difference)+')').join('\n'):'No detected anomalies in eligible days.')+
    '\n\n## Recommended checks\n\n'+a.recommendations.map((r,i)=>(i+1)+'. '+r.title+' ['+r.priority+']\n   Evidence: '+r.evidence+'\n   Check: '+r.action+'\n   Measure: '+r.measure).join('\n\n')+
    '\n\n## Method and limits\n\nAmounts are summed in integer cents. Comparisons use equal-length calendar periods. Missing dates are treated as zero gross sales; verify export completeness. Anomalies require at least three earlier matching weekdays; threshold is max(30% of median, 3.5 × 1.4826 × MAD, 1 currency unit). Statistical deviations do not prove causes. Refunds and negative revenue are excluded. Currency selection labels amounts without conversion. Profit and margin are not inferred. Recommendations above are deterministic evidence-based checks, not an LLM output.\n';
}
