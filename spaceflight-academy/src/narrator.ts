const FEMININE = ["female","aria","ava","emma","jenny","michelle","natasha","samantha","susan","zira","allison","serena","karen","moira","tessa","fiona","joanna","kendra","kimberly","salli","ivy","amy","hazel","victoria"];
const MASCULINE = ["male","david","mark","guy","george","daniel","james","ryan","fred","thomas","aaron","matthew","brian"];
let session = 0;
let activeFinish:(()=>void)|null=null;

type NarrationOptions={rate?:number;pitch?:number};

export function prepareNarrationText(input:string):string{
  return input
    .replace(/(\d+(?:\.\d+)?)\s*V\b/g,"$1 volts")
    .replace(/(\d+(?:\.\d+)?)\s*A\b/g,"$1 amperes")
    .replace(/(\d+(?:\.\d+)?)\s*Ω/g,"$1 ohms")
    .replace(/(\d+(?:\.\d+)?)\s*km\b/gi,"$1 kilometers")
    .replace(/(\d+(?:\.\d+)?)\s*m\/s\b/gi,"$1 meters per second")
    .replace(/\bGPS\b/g,"G P S")
    .replace(/\bIMU\b/g,"I M U")
    .replace(/\bRCS\b/g,"R C S")
    .replace(/\bCO₂\b|\bCO2\b/g,"carbon dioxide")
    .replace(/\bdelta-v\b/gi,"delta vee")
    .replace(/[•·]/g,", ")
    .replace(/[−–]/g," minus ")
    .replace(/\s+([,.?!;:])/g,"$1")
    .replace(/\s+/g," ")
    .trim();
}

export function scoreVoice(name:string,language:string,local=false):number{
  const normalized=name.toLowerCase();
  let score=language.toLowerCase().startsWith("en")?70:-120;
  if(language.toLowerCase().startsWith("en-us"))score+=18;
  if(FEMININE.some(hint=>normalized.includes(hint)))score+=115;
  if(MASCULINE.some(hint=>normalized.includes(hint)))score-=140;
  if(/natural|neural|premium|enhanced/.test(normalized))score+=24;
  if(/google|microsoft|apple/.test(normalized))score+=6;
  if(local)score+=3;
  return score;
}

function chunks(text:string):string[]{
  const sentences=text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)??[text],out:string[]=[];
  for(const sentence of sentences){
    const clean=sentence.trim();if(!clean)continue;
    if(clean.length<=185){out.push(clean);continue}
    const words=clean.split(/\s+/);let part="";
    for(const word of words){if(part&&`${part} ${word}`.length>185){out.push(part);part=word}else part=part?`${part} ${word}`:word}
    if(part)out.push(part);
  }
  return out;
}

export function stopNarration(){
  session+=1;
  if(typeof window!=="undefined"&&"speechSynthesis"in window)window.speechSynthesis.cancel();
  const finish=activeFinish;activeFinish=null;finish?.();
}

export function speakFriendly(text:string,rateOrOptions:number|NarrationOptions=.72):Promise<void>{
  if(typeof window==="undefined"||!("speechSynthesis"in window))return Promise.resolve();
  const clean=prepareNarrationText(text);if(!clean)return Promise.resolve();
  stopNarration();
  const current=session,synthesis=window.speechSynthesis;
  const voice=synthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith("en")).sort((a,b)=>scoreVoice(b.name,b.lang,b.localService)-scoreVoice(a.name,a.lang,a.localService))[0];
  const options=typeof rateOrOptions==="number"?{rate:rateOrOptions}:rateOrOptions;
  const parts=chunks(clean);let index=0;
  return new Promise(resolve=>{
    let finished=false;
    const finish=()=>{if(finished)return;finished=true;if(activeFinish===finish)activeFinish=null;resolve()};
    activeFinish=finish;
    const next=()=>{
      if(current!==session||index>=parts.length){finish();return}
      const utterance=new SpeechSynthesisUtterance(parts[index]);
      if(voice)utterance.voice=voice;
      utterance.lang=voice?.lang??"en-US";
      utterance.rate=options.rate??.72;utterance.pitch=options.pitch??1.14;utterance.volume=.94;
      utterance.onend=()=>{index+=1;window.setTimeout(next,150)};
      utterance.onerror=()=>{index+=1;window.setTimeout(next,40)};
      synthesis.speak(utterance);
    };
    if(synthesis.getVoices().length)next();
    else{synthesis.addEventListener("voiceschanged",next,{once:true});window.setTimeout(next,350)}
  });
}
