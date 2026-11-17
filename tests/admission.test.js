import test from 'node:test';
import assert from 'node:assert/strict';
import {admitReview} from '../server/admission.js';

const origin='https://avenquellis.example';
const request=(address, headers={})=>new Request(origin+'/api/grade', {
  method:'POST',headers:{origin,'CF-Connecting-IP':address,...headers}
});
const admit=(address,headers={},env={AVENQUELLIS_HOSTED_GRADING:'enabled'})=>admitReview({request:request(address,headers),env});

test('hosted reviews share one cooldown across addresses in an IPv6 /64',async()=>{
  assert.equal(admit('2001:db8:10:20::1'),true);
  const denied=admit('2001:0DB8:0010:0020:ffff:ffff:ffff:ffff');
  assert.equal(denied.status,429);
  assert.equal(denied.headers.get('Retry-After'),'60');
  assert.match((await denied.json()).error,/Wait a minute/);
  assert.equal(admit('2001:db8:10:21::1'),true,'a separate network retains its own allowance');
});

test('IPv4 and mapped IPv6 forms cannot get separate review allowances',()=>{
  assert.equal(admit('198.51.100.7'),true);
  assert.equal(admit('::ffff:198.51.100.7').status,429);
  assert.equal(admit('::FFFF:c633:6407').status,429);
  assert.equal(admit('198.51.100.8'),true);
});

test('rejected configuration and origin requests do not consume the review cooldown',()=>{
  assert.equal(admit('203.0.113.10',{},{}).status,503);
  assert.equal(admit('203.0.113.10',{origin:'https://other.example'}).status,403);
  assert.equal(admit('').status,403);
  assert.equal(admit('203.0.113.10'),true);
  assert.equal(admit('203.0.113.10').status,429);
});
