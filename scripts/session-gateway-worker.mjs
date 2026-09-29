// Run this command through an approved scheduler; one bounded delivery per invocation.
const endpoint=new URL(process.env.PAY_LAB_WORKER_URL||'');
if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error('Configure the HTTPS worker endpoint');
const secret=process.env.PAY_LAB_WORKER_SECRET;
if(!secret||secret.length<32)throw Error('Configure the worker secret server-side');
const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(55000),headers:{authorization:`Bearer ${secret}`}});
if(!response.ok)throw Error(`Worker returned HTTP ${response.status}`);
console.log(await response.json());
