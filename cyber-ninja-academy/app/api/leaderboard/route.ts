import {insert,readBoard,SECTOR_IDS,update,validate} from "../../leaderboard-store";

const headers={"cache-control":"no-store"};
const hits=new Map<string,number[]>();

function limited(ip:string){
  const now=Date.now(),list=(hits.get(ip)||[]).filter(t=>now-t<60000);list.push(now);hits.set(ip,list);
  if(hits.size>5000)hits.clear();
  return list.length>6;
}

export async function GET(request:Request){
  const sector=Number(new URL(request.url).searchParams.get("sector")||1);
  if(!SECTOR_IDS.includes(sector))return Response.json({error:"unknown sector"},{status:400,headers});
  try{
    const board=await readBoard();
    return Response.json({sector,entries:(board[String(sector)]||[]).slice(0,10)},{headers});
  }catch{
    return Response.json({error:"leaderboard storage unavailable"},{status:503,headers});
  }
}

export async function POST(request:Request){
  const ip=request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"local";
  if(limited(ip))return Response.json({error:"too many submissions, wait a minute"},{status:429,headers});
  let body:unknown;
  try{body=await request.json()}catch{return Response.json({error:"invalid JSON"},{status:400,headers})}
  const checked=validate(body);
  if(typeof checked==="string")return Response.json({error:checked},{status:400,headers});
  try{
    const result=await update(board=>{
      const r=insert(board,checked.sector,checked.entry);
      return {...r,entries:(board[String(checked.sector)]||[]).slice(0,10)};
    });
    return Response.json({sector:checked.sector,...result},{status:201,headers});
  }catch{
    return Response.json({error:"leaderboard storage unavailable"},{status:503,headers});
  }
}
