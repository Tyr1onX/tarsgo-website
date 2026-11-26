import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ApiError, apiRequest } from "~/lib/api-client";
import { getCurrentUser, getCachedCurrentUser, subscribeAccountSessionChange, subscribeAuthStateChange } from "~/lib/auth-client";
import { worldItems, type WorldItem } from "~/lib/pixel-jijia-items";
import { drawItem } from "~/lib/pixel-jijia-item-art";

type ItemRow = { id:string; quantity:number; revision:number };

function ItemIcon({ item }:{ item:WorldItem }) {
  return <canvas width={32} height={24} aria-hidden="true" ref={node=>{
    const ctx=node?.getContext("2d");
    if(ctx){ctx.clearRect(0,0,32,24);drawItem(ctx,item,16,12,2);}
  }}/>;
}

export function PixelInventory({ change, atWater, onInspect }:{change:number; atWater:()=>boolean; onInspect:(item:WorldItem)=>void}) {
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState<ItemRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState("");
  const [guest,setGuest]=useState(false);
  const [busy,setBusy]=useState(false);
  const owner=useRef<number|null>(null);
  const generation=useRef(0);
  const load=useCallback(async()=>{
    const current=++generation.current;
    setLoading(true);
    try{
      const user=await getCurrentUser();
      if(current!==generation.current || getCachedCurrentUser()?.id!==user.id)return;
      owner.current=user.id;
      const inventory=await apiRequest<ItemRow[]>("/api/pixel-home/items",{cache:"no-store"});
      if(current===generation.current && getCachedCurrentUser()?.id===user.id){
        setRows(inventory);setGuest(false);setNotice("");
      }
    }catch(error){
      if(current!==generation.current)return;
      setRows([]);setGuest(error instanceof ApiError && error.status===401);
      setNotice(error instanceof Error?error.message:"背包读取失败");
    }finally{if(current===generation.current)setLoading(false);}
  },[]);
  useEffect(()=>{
    if(!open)return;
    void load();
    const changed=()=>{
      generation.current++;owner.current=null;setRows([]);setNotice("");setBusy(false);setGuest(false);
      void load();
    };
    const auth=subscribeAuthStateChange(user=>{if(owner.current!==null && owner.current!==user?.id)changed();});
    const session=subscribeAccountSessionChange(changed);
    window.addEventListener("focus",load);
    return ()=>{generation.current++;session();auth();window.removeEventListener("focus",load);};
  },[open,change,load]);
  async function release(row:ItemRow){
    if(!atWater()){setNotice("走到水边就可以放生。");return;}
    const id=owner.current;
    if(!id||busy)return;
    setBusy(true);
    let message="已放生";
    try{await apiRequest("/api/pixel-home/release",{method:"POST",body:{owner:id,id:row.id,revision:row.revision}});}
    catch(error){message=error instanceof Error?error.message:"请重新查看背包";}
    if(getCachedCurrentUser()?.id!==id)return;
    await load();
    if(getCachedCurrentUser()?.id===id){setNotice(message);setBusy(false);}
  }
  return <details className="pixel-world-map-discoveries" onToggle={event=>{
    if(!event.currentTarget.open){setRows([]);setNotice("");setGuest(false);setLoading(true);setBusy(false);}
    setOpen(event.currentTarget.open);
  }}>
    <summary>背包与收藏</summary>
    {open&&<div className="pixel-world-map-discovery-list pixel-world-inventory">
      {rows.map(row=>{
        const item=worldItems.get(row.id);
        if(!item)return null;
        return <div key={row.id}><ItemIcon item={item}/><span>{item.name} · {row.quantity? "×"+row.quantity:"已发现"}</span>
          {row.quantity>0&&<button type="button" disabled={busy} onClick={()=>{
            if(owner.current===getCachedCurrentUser()?.id)onInspect(item);
          }}>拿起看看</button>}
          {item.kind==="fish"&&row.quantity>0&&<button type="button" disabled={busy} onClick={()=>void release(row)}>放生一条</button>}
        </div>;
      })}
      {guest?<Link to="/login">登录后保存渔获</Link>:notice?<span role="status">{notice}</span>:!rows.length&&<span>{loading?"读取背包中…":"暂无收藏"}</span>}
      {notice&&!guest&&rows.length===0&&<button type="button" onClick={()=>void load()}>刷新背包</button>}
    </div>}
  </details>;
}
