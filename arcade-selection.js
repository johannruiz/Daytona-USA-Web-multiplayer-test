// Direction gestures select one option; the virtual arcade wheel holds that
// option after the physical wheel/stick/key returns to centre. No RAM writes.
const LETTER_STEER=Object.freeze([-85,-76,-71,-67,-62,-57,-52,-47,-42,-37,-33,-27,-22,-18,-13,0,9,14,18,24,29,34,38,43,48,53,58,63,78]);
export function selectionSteer(kind,index,cursor=0){
 if(kind===1)return [0,50,100][index]??0;
 if(kind===2)return index?100:0;
 if(kind===3)return cursor===3?(index?0:LETTER_STEER[0]):LETTER_STEER[index]??0;
 return 0;
}
export class ArcadeSelection{
 constructor(){this.reset();this.lastRaw=0;}
 reset(){this.key=0;this.index=0;this.direction=0;this.armed=false;this.repeat=0;this.heldFor=0;}
 read(raw,state,seconds=1/60){
  const kind=state&255,selected=(state>>>8)&255,cursor=(state>>>16)&255,count=state>>>24;
  const value=Number.isFinite(raw)?Math.max(-100,Math.min(100,raw)):0,wasNeutral=Math.abs(this.lastRaw)<=12;this.lastRaw=value;
  if(![1,2,3].includes(kind)||count!==(kind===1?3:kind===2||cursor===3?2:29)||selected>=count||kind!==3&&cursor!==0||cursor>3){this.reset();return raw;}
  const key=kind|(cursor<<8);
  const direction=Math.abs(value)>=30?Math.sign(value):0,neutral=Math.abs(value)<=12;
  if(key!==this.key){this.reset();this.key=key;this.index=kind===3?selected:0;this.armed=kind===3?(neutral||wasNeutral):neutral;if(kind!==3)return selectionSteer(kind,0);}
  const step=dir=>{this.index=Math.max(0,Math.min(count-1,this.index+dir));};
  const letters=kind===3&&cursor<3,dt=Math.max(0,Math.min(.05,Number.isFinite(seconds)?seconds:0));
  if(neutral){this.direction=0;this.armed=true;this.repeat=0;this.heldFor=0;}
  else if(direction&&this.armed){
   if(direction!==this.direction){step(direction);this.direction=direction;this.heldFor=0;this.repeat=letters?.35:.48;}
   else{this.heldFor+=dt;this.repeat-=dt;if(this.repeat<=0){step(direction);this.repeat=letters?(this.heldFor>=1.6?.05:this.heldFor>=.9?.085:.14):.16;}}
  }
  return selectionSteer(kind,this.index,cursor);
 }
}
