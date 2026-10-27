// Notification delivery only: no fetch handler, cache, push subscription or ROM access.
const appURL=new URL('./',self.location.href);
const sameApp=client=>{try{const url=new URL(client.url);return url.origin===appURL.origin&&(url.pathname===appURL.pathname||url.pathname===appURL.pathname+'index.html');}catch{return false;}};
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('message',event=>{
 const client=event.source,data=event.data;if(!client?.id||!sameApp(client)||typeof data?.stamp!=='string'||data.stamp.length>80)return;
 if(data.type==='daytona-room-alert-close'){
  event.waitUntil(self.registration.getNotifications().then(list=>{for(const n of list)if(n.data?.clientId===client.id&&n.data?.stamp===data.stamp)n.close();}));return;
 }
 if(data.type!=='daytona-room-alert'||!['joined','request','spectating','left'].includes(data.kind)||typeof data.title!=='string'||data.title.length>80||typeof data.body!=='string'||data.body.length>160||typeof data.tag!=='string'||data.tag.length>180)return;
 event.waitUntil(self.registration.showNotification(data.title,{body:data.body,tag:data.tag,silent:true,icon:new URL('daytona-logo.png',appURL).href,
  data:{clientId:client.id,stamp:data.stamp,kind:data.kind}}).catch(()=>{}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const data=event.notification.data;
 if(!data?.clientId)return;
 event.waitUntil((async()=>{const client=await self.clients.get(data.clientId);if(client&&sameApp(client)){await client.focus();client.postMessage({type:'daytona-room-alert-click',stamp:data.stamp,kind:data.kind});}})());
});
