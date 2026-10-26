export async function api(path, options={}) {
  const {body,...rest}=options;
  const form=body instanceof FormData;
  const response=await fetch('/api'+path,{credentials:'same-origin',...rest,headers:{...(body&&!form?{'Content-Type':'application/json'}:{}),...options.headers},...(body?{body:form?body:JSON.stringify(body)}:{})});
  let data;
  try {data=await response.json()}catch {throw new Error('The server returned an unexpected response. Make sure the Node server is running.');}
  if(!response.ok){const e=new Error(data.error||'The request could not be completed.');e.status=response.status;throw e;}
  return data;
}
export function safeUrl(value) {try {const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
