export const STUDIO_SLOTS=["driver-home","driver-event","rider-banner-1","rider-banner-2","rider-banner-3","rider-banner-4","rider-banner-5","rider-banner-6","help","legal","app-versions"] as const;
/** Contract v0.10.0 §19: a text in sv, fr and en (all required); app versions as two pairs (rider and driver app). */
export type StudioText={title:string;sv:string;fr:string;en:string;image:string;expiresAt:string;riderMin:string;riderRecommended:string;driverMin:string;driverRecommended:string;reaccept:boolean};
export type StudioSlot={author:string;draft:StudioText;published:StudioText|null;history:{version:number;at:string;actor:string;text:StudioText;action:"publish"|"rollback"}[]};
export type StudioBook={draftRev:number;slots:Record<string,StudioSlot>};
export function emptyStudio():StudioBook{return {draftRev:1,slots:{}};}
export function emptyStudioText():StudioText{return {title:"Movera",sv:"",fr:"",en:"",image:"",expiresAt:"",riderMin:"",riderRecommended:"",driverMin:"",driverRecommended:"",reaccept:false};}
/** Older saved drafts have no French text and one version pair; they get empty fields. */
export function normalizeStudioText(text:Partial<StudioText>&{minVersion?:string;recommendedVersion?:string}):StudioText{const {minVersion,recommendedVersion,...rest}=text;return {...emptyStudioText(),...(minVersion?{riderMin:minVersion}:{}),...(recommendedVersion?{riderRecommended:recommendedVersion}:{}),...rest};}
export function studioSlot(book:StudioBook,id:string):StudioSlot{const slot=book.slots[id];if(!slot)return {author:"nora",draft:emptyStudioText(),published:null,history:[]};return {...slot,draft:normalizeStudioText(slot.draft),published:slot.published?normalizeStudioText(slot.published):null,history:slot.history.map((h)=>({...h,text:normalizeStudioText(h.text)}))};}
const SEMVER=/^\d+\.\d+\.\d+$/;
function pairError(min:string,recommended:string):string|undefined{
 if(!SEMVER.test(min)||!SEMVER.test(recommended))return "Use semantic versions such as 1.2.3.";
 const a=min.split(".").map(Number),b=recommended.split(".").map(Number);
 for(let i=0;i<3;i++){if(a[i]>b[i])return "Recommended version cannot be below minimum.";if(a[i]<b[i])break;}
}
export function validateStudio(id:string,d:StudioText):string|undefined{
 if(!STUDIO_SLOTS.includes(id as typeof STUDIO_SLOTS[number]))return "Invalid content slot.";
 if(!d.title.trim() || !d.sv.trim() || !d.fr.trim() || !d.en.trim())return "Title and all three languages (Swedish, French, English) are required.";
 if(d.image && !/^https:\/\//.test(d.image))return "Images must use HTTPS.";
 if(d.expiresAt && (!Number.isFinite(Date.parse(d.expiresAt)) || Date.parse(d.expiresAt)<=Date.now()))return "Expiry must be a future date.";
 if(id==="app-versions")return pairError(d.riderMin,d.riderRecommended)??pairError(d.driverMin,d.driverRecommended);
}
/** The publish body of POST /admin/content/{slot}/publish (contract v0.10.0 §19), without zoneIds. */
export function publishBody(id:string,d:StudioText){
 return {title:d.title.trim(),text:{sv:d.sv,fr:d.fr,en:d.en},...(d.image?{image:d.image}:{}),...(d.expiresAt?{expiresAt:new Date(d.expiresAt).toISOString()}:{}),...(id==="legal"?{reaccept:d.reaccept}:{}),...(id==="app-versions"?{versions:{rider:{min:d.riderMin,recommended:d.riderRecommended},driver:{min:d.driverMin,recommended:d.driverRecommended}}}:{})};
}
export function changeStudio(book:StudioBook,id:string,draft:StudioText,action:"save"|"publish"|"rollback",actor:string):{book:StudioBook;error?:string}{
 const old=studioSlot(book,id);const error=action!=="rollback"?validateStudio(id,draft):undefined;if(error)return {book,error};
 if(action==="publish"&&old.author===actor)return {book,error:"A second agent must publish."};
 if(action==="rollback"&&old.history.length<2)return {book,error:"No prior published version is available."};
 let next=action==="save"?{...old,author:actor,draft:{...draft}}:old;
 if(action!=="save"){const text=action==="publish"?{...old.draft}:{...old.history[old.history.length-2].text};next={...old,published:text,history:[...old.history,{version:old.history.length+1,at:new Date().toISOString(),actor,text,action}]};}
 return {book:{draftRev:book.draftRev+1,slots:{...book.slots,[id]:next}}};
}
