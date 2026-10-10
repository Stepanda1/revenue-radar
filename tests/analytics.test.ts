import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays,analyze,createDemo,demoCsv,inferMapping,moneyToCents,normalizeCsv,parseCsv,parseDate,parseNumber,reportMarkdown} from '../lib/analytics.ts';
import type {SalesRow} from '../lib/analytics.ts';
const row=(date:string,product:string,revenue:number,orderId:string|null=null):SalesRow=>({date,product,revenue,quantity:null,orderId});
test('quoted CSV, escaped quotes, BOM, blank lines and embedded newlines survive import',()=>{
  const csv=parseCsv('\uFEFFdate,product,revenue\r\n2026-01-01,"Tee, blue",12.34\r\n2026-01-02,"A ""B""\nC",45.67\r\n\r\n');
  const result=normalizeCsv(csv,inferMapping(csv.headers));
  assert.equal(result.rows[0].product,'Tee, blue');
  assert.equal(result.rows[1].product,'A "B"\nC');
  assert.equal(result.rows[0].revenue,1234);
  assert.equal(result.quality.accepted,2);
});
test('semicolon Russian columns and comma decimals use explicit mapping',()=>{
  const csv=parseCsv('дата;товар;сумма\n01.10.2026;Кружка;1.234,56');
  const result=normalizeCsv(csv,inferMapping(csv.headers),'comma');
  assert.equal(result.rows[0].revenue,123456);
  assert.equal(result.rows[0].date,'2026-10-01');
});
test('decimal cents round exactly without the 1.005 floating point error',()=>{
  assert.equal(moneyToCents('1.005'),101);
  assert.equal(moneyToCents('0.105'),11);
  assert.equal(moneyToCents('1.999'),200);
  assert.equal(moneyToCents('1.234,56','comma'),123456);
  assert.equal(moneyToCents('$1,234.56'),123456);
});
test('quantity times unit price is supported, including decimal cents',()=>{
  const csv=parseCsv('date,product,quantity,unit_price\n2026-01-01,Tee,3,1.005');
  const result=normalizeCsv(csv,inferMapping(csv.headers));
  assert.equal(result.rows[0].revenue,303);
});
test('invalid dates, refunds, empty products and invalid amounts are reported',()=>{
  const csv=parseCsv('date,product,revenue\n2026-02-30,Tee,10\n2026-01-01,Tee,-10\n2026-01-01,,10\n2026-01-01,Tee,abc\n2026-01-01,Tee,0\n2026-01-02,Tee,25');
  const result=normalizeCsv(csv,inferMapping(csv.headers));
  assert.equal(result.quality.rejected,4);
  assert.deepEqual(result.quality.issues.map(x=>x.row),[2,3,4,5]);
  assert.equal(result.rows.length,2);
  assert.equal(parseDate('2024-02-29'),'2024-02-29');
  assert.equal(parseDate('2025-02-29'),null);
  assert.equal(parseDate('01/02/2026'),'2026-02-01');
});
test('incorrect numeric grouping and malformed CSV fail clearly',()=>{
  assert.equal(parseNumber('12,34.56'),null);
  assert.equal(parseNumber('12.34','comma'),null);
  assert.throws(()=>parseCsv('date,product,revenue\n2026-01-01,Tee,3,extra'));
  assert.throws(()=>parseCsv('date,product,revenue\n2026-01-01,"Tee,3'));
  assert.throws(()=>parseCsv('date,date,revenue\n2026-01-01,x,3'));
  assert.throws(()=>parseCsv('date,product,revenue\n'));
});
test('duplicate sales rows are counted and retained; multiple rows per order count once',()=>{
  const csv=parseCsv('date,product,revenue,order_id\n2026-01-01,Tee,10,A\n2026-01-01,Tee,10,A\n2026-01-01,Cap,5,A');
  const result=normalizeCsv(csv,inferMapping(csv.headers));
  assert.equal(result.quality.duplicateRows,1);
  assert.equal(result.rows.length,3);
  const a=analyze(result.rows,0);
  assert.equal(a.total,2500);
  assert.equal(a.orders,1);
});
test('equal calendar periods, zero-filled missing days and product contribution sum agree',()=>{
  const rows=[row('2026-01-01','A',10000),row('2026-01-02','B',5000),row('2026-01-03','A',4000),row('2026-01-04','B',6000)];
  const a=analyze(rows,2);
  assert.equal(a.previous,15000);assert.equal(a.total,10000);
  assert.equal(a.comparisonAvailable,true);assert.ok(Math.abs(a.change!+33.333333333333)<1e-8);
  assert.equal(a.mainDecliner?.name,'A');
  assert.equal(a.products.reduce((n,p)=>n+p.delta,0),a.total-a.previous);
  assert.equal(a.start,'2026-01-03');
  const b=analyze([rows[0],rows[3]],2);
  assert.equal(b.missingDays,1);assert.equal(b.daily[0].revenue,0);
});
test('short history and zero previous revenue never produce misleading percentages',()=>{
  const a=analyze([row('2026-01-01','A',100),row('2026-01-03','A',300)],14);
  assert.equal(a.comparisonAvailable,false);assert.equal(a.change,null);assert.equal(a.products[0].change,null);
  const b=analyze([row('2026-01-01','A',0),row('2026-01-02','A',200)],1);
  assert.equal(b.comparisonAvailable,true);assert.equal(b.change,null);
});
test('matching weekday baseline uses prior dates, accommodates weekly seasonality and flags drops',()=>{
  const rows=Array.from({length:42},(_,i)=>row(addDays('2026-01-01',i),'A',i%7<2?20000:10000));
  const normal=analyze(rows,14);
  assert.equal(normal.anomalies.length,0);
  rows[35].revenue=1000;
  const changed=analyze(rows,14);
  const anomaly=changed.anomalies.find(d=>d.date===rows[35].date);
  assert.ok(anomaly);assert.equal(anomaly.baseline,20000);
  rows[41].revenue=99999999;
  assert.equal(analyze(rows,14).daily.find(d=>d.date===rows[35].date)?.baseline,20000);
});
test('synthetic demo produces the intended product decline and three outage-like days',()=>{
  const a=analyze(createDemo(),14);
  assert.equal(a.total,3636600);assert.equal(a.previous,5629800);
  assert.equal(a.mainDecliner?.name,'Cloud Hoodie');
  assert.deepEqual(a.anomalies.map(d=>d.date),['2026-09-30','2026-10-01','2026-10-02']);
  assert.equal(a.orders,null);
  const csv=parseCsv(demoCsv());
  assert.equal(normalizeCsv(csv,inferMapping(csv.headers)).quality.accepted,280);
  assert.ok(reportMarkdown(a,'USD','Synthetic demo').includes('not an LLM output'));
});
test('large distinct-product exports aggregate without a quadratic scan',()=>{
  const rows=Array.from({length:20000},(_,i)=>row('2026-01-01','Product '+i,100));
  const a=analyze(rows,0);
  assert.equal(a.products.length,20000);assert.equal(a.total,2000000);
});
