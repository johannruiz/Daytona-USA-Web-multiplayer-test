import {TransportProbe,attachDataChannelProbe} from './transport-probe.js?v=53.8.59';
import {encodeMotion,decodeMotion} from './motion-codec.js?v=53.8.59';
export const MOTION_VERSION=1,MOTION_LABEL='daytona-motion-v1';
export function motionChannelId(conn){const maximum=conn.peerConnection?.sctp?.maxChannels??65535;for(const id of [16,17,2,3])if(id<maximum&&id!==conn.dataChannel?.id)return id;return null;}
export class MotionChannel {
 constructor(conn,{id,nonce,enabled=true,onData=()=>{},onState=()=>{},onLow=()=>{}}){
  if(!Number.isInteger(id)||id<0||id>=65535||id===conn.dataChannel?.id||!/^[a-f0-9]{32}$/.test(nonce))throw Error('Invalid movement channel offer.');
  this.id=id;this.nonce=nonce;this.remoteReady=false;this.failed=false;this.disposed=false;this.invalidMessages=0;this.probe=new TransportProbe({enabled});
  // Both endpoints create the same negotiated ID. No datachannel event is
  // generated for PeerJS to mistake this channel for its reliable connection.
  const c=this.channel=conn.peerConnection.createDataChannel(MOTION_LABEL,{negotiated:true,id,ordered:false,maxRetransmits:0});
  if(c.id!==id||c.negotiated!==true||c.ordered!==false||c.maxRetransmits!==0||c.maxPacketLifeTime!=null){try{c.close();}catch{}throw Error('Unsupported movement channel properties.');}
  c.binaryType='arraybuffer';c.bufferedAmountLowThreshold=0;
  this.stopProbe=attachDataChannelProbe(c,this.probe);
  this.listeners={open:()=>{if(!this.disposed)onState('open');},close:()=>{if(!this.disposed){this.failed=true;onState('closed');}},error:()=>{if(!this.disposed){this.failed=true;onState('error');}},bufferedamountlow:()=>{if(!this.disposed)onLow();},message:e=>{
   if(this.disposed||this.failed)return;let data;try{data=decodeMotion(e.data);}catch{this.invalidMessages++;return;}
   this.probe.dispatched();onData(data);
  }};
  for(const [name,listener] of Object.entries(this.listeners))c.addEventListener(name,listener);
 }
 get open(){return !this.disposed&&!this.failed&&this.channel.readyState==='open';}
 get ready(){return this.open&&this.remoteReady;}
 send(data,count){if(!this.open)throw Error('Movement channel unavailable.');this.channel.send(encodeMotion(data,count));}
 dispose(){if(this.disposed)return;this.disposed=true;for(const [name,listener] of Object.entries(this.listeners))this.channel.removeEventListener(name,listener);this.stopProbe();try{this.channel.close();}catch{}}
}
