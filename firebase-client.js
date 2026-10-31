// Public web configuration. Database ownership is enforced by server rules.
import {createAppCheckGate} from './firebase-security.js?v=53.8.59';
import {createRoomAnnouncements} from './room-announcements.js?v=53.8.59';
export const FIREBASE_CONFIG={
 apiKey:'AIzaSyDdISDv02wMhfd17CDVI8FQkk_mWBHlpms',
 authDomain:'daytona-usa-web.firebaseapp.com',
 databaseURL:'https://daytona-usa-web-default-rtdb.firebaseio.com',
 projectId:'daytona-usa-web',
 appId:'1:103411207185:web:7b7a2c2ee65762cfa6f5b0',
 messagingSenderId:'103411207185',measurementId:'G-DHG2V3XJ6K'
};
const CDN='https://www.gstatic.com/firebasejs/13.0.0/';
let appPromise;
const app=()=>appPromise??=(async()=>{const sdk=await import(CDN+'firebase-app.js');return sdk.initializeApp(FIREBASE_CONFIG);})().catch(e=>{appPromise=null;throw e;});
const ensureAppCheck=createAppCheckGate();
let identityPromise;
async function identity(){
 return identityPromise??=(async()=>{
  const [instance,sdk]=await Promise.all([app(),import(CDN+'firebase-auth.js')]);
  const check=await ensureAppCheck(instance),auth=sdk.getAuth(instance);await auth.authStateReady();
  if(auth.currentUser){try{await auth.currentUser.getIdToken(true);}catch(e){if(['auth/user-not-found','auth/user-token-expired','auth/invalid-user-token','auth/user-disabled'].includes(e.code))await sdk.signOut(auth);else throw e;}}
  if(!auth.currentUser)await sdk.signInAnonymously(auth);
  return {instance,auth,check};
 })().catch(error=>{identityPromise=null;throw error;});
}
// Reuses the same anonymous identity/App Check instance without opening RTDB.
export async function getConnectionTokens(){
 const {auth,check}=await identity();if(!check)throw Error('App Check unavailable for relay access.');
 const sdk=await import(CDN+'firebase-app-check.js');
 const [idToken,result]=await Promise.all([auth.currentUser.getIdToken(),sdk.getToken(check,false)]);
 return {idToken,appCheckToken:result.token};
}

export async function createFirebaseDirectoryBackend(){
 const [{instance,auth},dbSDK]=await Promise.all([identity(),import(CDN+'firebase-database.js')]);
 const db=dbSDK.getDatabase(instance),room=id=>dbSDK.ref(db,'publicRooms/'+id);
 const announcements=createRoomAnnouncements({tokens:getConnectionTokens});
 return {
  uid:auth.currentUser.uid,timestamp:()=>dbSDK.serverTimestamp(),
  online:()=>{ensureAppCheck.setActive(true);dbSDK.goOnline(db);},offline:()=>{dbSDK.goOffline(db);ensureAppCheck.setActive(false);},
  connection:fn=>dbSDK.onValue(dbSDK.ref(db,'.info/connected'),s=>fn(s.val()===true)),
  offset:fn=>dbSDK.onValue(dbSDK.ref(db,'.info/serverTimeOffset'),s=>fn(Number(s.val())||0)),
  listen:(next,error)=>dbSDK.onValue(dbSDK.query(dbSDK.ref(db,'publicRooms'),dbSDK.orderByChild('updatedAt'),dbSDK.limitToLast(50)),s=>next(s.val()||{}),error),
  arm:id=>dbSDK.onDisconnect(room(id)).remove(),
  put:(id,value)=>dbSDK.set(room(id),value),
  remove:id=>dbSDK.remove(room(id)),cancel:id=>dbSDK.onDisconnect(room(id)).cancel(),
  published:id=>announcements.published(id),withdraw:id=>announcements.withdraw(id)
 };
}

let analyticsPromise;
export function startAnalytics(){
 return analyticsPromise??=(async()=>{
  try{
   const [instance,sdk]=await Promise.all([app(),import(CDN+'firebase-analytics.js')]);
   if(!await sdk.isSupported())return false;
   // Never send invitation fragments, player names, messages, or room names.
   const location=globalThis.location.origin+globalThis.location.pathname;
   const analytics=sdk.initializeAnalytics(instance,{config:{send_page_view:false,page_location:location,page_title:'Daytona USA Web'}});
   sdk.setDefaultEventParameters({page_location:location,page_title:'Daytona USA Web'});
   sdk.logEvent(analytics,'page_view',{page_location:location,page_title:'Daytona USA Web'});
   return true;
  }catch{return false;} // An optional analytics failure must not affect play.
 })();
}
